import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, count, desc, eq, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { env, isProduction } from "../../config/env.js";
import { db, pool } from "../../db/client.js";
import { backups, restores, systemSettings } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { buildPaginatedResult, paginationSchema, toOffsetLimit } from "../../lib/pagination.js";
import { recordAudit } from "../audit/recorder.js";
import { confirmPassword } from "../payments/payouts.js";
import { isKeyUsable, packToFile, sha256File } from "./crypto.js";
import { createDumpStream, restoreFromFile, scanBackup, schemaFingerprint, type DumpResult, type TableCounts } from "./engine.js";
import { clampPolicy, selectBackupsToDelete, type RetentionPolicy } from "./retention.js";
import { getBackupStorage } from "./storage.js";

// Backups of the whole database, kept in durable storage outside the server; verified before they count; restored only
// by a super admin who confirms in several steps, always after a safety copy of the current data.
//
// Recovery objectives (assumptions in docs/BACKUP_RECOVERY.md): RPO is up to 24 hours with the daily schedule (less when
// a manual backup is taken before risky work, and Neon point-in-time restore narrows it further). RTO is the time to
// download, decrypt and copy the data back: minutes for a database of a few hundred megabytes.

type BackupRow = typeof backups.$inferSelect;
type RestoreRow = typeof restores.$inferSelect;

export type Actor = { id: string } | null;

const STALE_BACKUP_MINUTES = 90;
const STALE_RESTORE_MINUTES = 90;
const POLICY_KEY = "backup_policy";

const inflight = new Set<Promise<unknown>>();
const inflightBackupIds = new Set<string>();
const track = <T>(p: Promise<T>): Promise<T> => {
  inflight.add(p);
  void p.finally(() => inflight.delete(p)).catch(() => undefined);
  return p;
};

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "23505";
/** A short, safe message: no addresses, keys or stack. */
const safeMessage = (err: unknown) => String((err as Error)?.message ?? err).replace(/\s+/g, " ").slice(0, 400);

// ---------------------------------------------------------------- configuration

export function backupConfig() {
  const storage = getBackupStorage();
  let problem = storage.problem;
  const encryptionKeyOk = isKeyUsable(env.BACKUP_ENCRYPTION_KEY);
  if (!problem && isProduction && !encryptionKeyOk) problem = "Set BACKUP_ENCRYPTION_KEY (at least 32 random characters) so backups are encrypted.";
  if (!problem && env.BACKUP_ENCRYPTION_KEY && !encryptionKeyOk) problem = "BACKUP_ENCRYPTION_KEY is too short (at least 32 characters).";
  return {
    enabled: env.BACKUP_ENABLED,
    ready: env.BACKUP_ENABLED && !problem,
    problem: env.BACKUP_ENABLED ? problem : "Backups are switched off (BACKUP_ENABLED=false).",
    storage: storage.kind,
    encrypted: encryptionKeyOk,
    scheduleHourUtc: env.BACKUP_SCHEDULE_HOUR_UTC,
  };
}

function assertReady() {
  const cfg = backupConfig();
  if (!cfg.ready) throw new AppError("PAYMENT_UNAVAILABLE", cfg.problem ?? "Backups are not set up", 503);
  return getBackupStorage().provider!;
}

export const policySchema = z.object({
  retentionDays: z.coerce.number().int().min(1).max(3650),
  keepLatest: z.coerce.number().int().min(3).max(365),
});

export async function getPolicy(): Promise<RetentionPolicy> {
  const fallback = { retentionDays: env.BACKUP_RETENTION_DAYS, keepLatest: Math.max(3, env.BACKUP_KEEP_LATEST) };
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, POLICY_KEY)).limit(1);
  return clampPolicy((row?.value ?? {}) as Partial<RetentionPolicy>, fallback);
}

export async function savePolicy(actor: { id: string }, input: z.infer<typeof policySchema>): Promise<RetentionPolicy> {
  const policy = clampPolicy(input, await getPolicy());
  await db
    .insert(systemSettings)
    .values({ key: POLICY_KEY, value: policy, updatedBy: actor.id })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: policy, updatedBy: actor.id, updatedAt: new Date() } });
  await recordAudit({ actorUserId: actor.id, action: "backup.policy_changed", entityType: "backup", metadata: { ...policy } });
  return policy;
}

// ---------------------------------------------------------------- what a super admin sees

/** The public shape of a backup: never the storage location or anything that could be used to reach the file. */
function serializeBackup(b: BackupRow) {
  return {
    id: b.id,
    type: b.type,
    status: b.status,
    verificationStatus: b.verificationStatus,
    storage: b.storageProvider,
    sizeBytes: b.sizeBytes,
    checksumSha256: b.checksumSha256,
    encrypted: b.encrypted,
    rowTotal: b.rowTotal,
    tableCounts: b.tableCounts as TableCounts | null,
    createdBy: b.createdByName,
    error: b.error,
    startedAt: b.startedAt,
    completedAt: b.completedAt,
    verifiedAt: b.verifiedAt,
    deletedAt: b.deletedAt,
    lastRestoredAt: b.lastRestoredAt,
    restorable: b.status === "completed" && b.verificationStatus === "valid",
  };
}

function serializeRestore(r: RestoreRow) {
  return {
    id: r.id,
    backupId: r.backupId,
    safetyBackupId: r.safetyBackupId,
    status: r.status,
    active: r.status !== "completed" && r.status !== "failed",
    requestedBy: r.requestedByName,
    error: r.error,
    rolledBack: r.rolledBack,
    tableCounts: r.tableCounts as TableCounts | null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    completedAt: r.completedAt,
  };
}

export function nextScheduledAt(now: Date, hourUtc: number): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function getOverview() {
  const cfg = backupConfig();
  const [latestValid] = await db
    .select()
    .from(backups)
    .where(and(eq(backups.status, "completed"), eq(backups.verificationStatus, "valid")))
    .orderBy(desc(backups.startedAt))
    .limit(1);
  const [latestFailed] = await db.select().from(backups).where(eq(backups.status, "failed")).orderBy(desc(backups.startedAt)).limit(1);
  const [running] = await db.select().from(backups).where(eq(backups.status, "running")).limit(1);
  const [activeRestore] = await db.select().from(restores).where(notInArray(restores.status, ["completed", "failed"])).limit(1);
  const [totals] = await db
    .select({ n: count(), bytes: sql<string>`coalesce(sum(${backups.sizeBytes}) filter (where ${backups.status} = 'completed'), 0)` })
    .from(backups)
    .where(ne(backups.status, "deleted"));
  const policy = await getPolicy();
  const lastGood = latestValid?.startedAt ?? null;
  const ageHours = lastGood ? (Date.now() - lastGood.getTime()) / 3_600_000 : null;
  return {
    ...cfg,
    policy,
    nextScheduledAt: cfg.ready ? nextScheduledAt(new Date(), cfg.scheduleHourUtc) : null,
    latestValid: latestValid ? serializeBackup(latestValid) : null,
    latestFailed: latestFailed && (!latestValid || latestFailed.startedAt > latestValid.startedAt) ? serializeBackup(latestFailed) : null,
    running: running ? serializeBackup(running) : null,
    activeRestore: activeRestore ? serializeRestore(activeRestore) : null,
    totalBackups: totals?.n ?? 0,
    totalBytes: Number(totals?.bytes ?? 0),
    // True when the newest valid backup is more than 26 hours old (the daily one is late or failing).
    stale: cfg.ready ? ageHours === null || ageHours > 26 : false,
  };
}

export const listQuerySchema = paginationSchema.extend({
  type: z.enum(["automatic", "manual", "pre_restore"]).optional(),
  status: z.enum(["running", "completed", "failed", "deleted"]).optional(),
});

export async function listBackups(query: z.infer<typeof listQuerySchema>) {
  const where = and(query.type ? eq(backups.type, query.type) : undefined, query.status ? eq(backups.status, query.status) : undefined);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(backups).where(where);
  const { limit, offset } = toOffsetLimit(query);
  const rows = await db.select().from(backups).where(where).orderBy(desc(backups.startedAt)).limit(limit).offset(offset);
  return buildPaginatedResult(rows.map(serializeBackup), n, query);
}

export async function getBackup(id: string) {
  const [row] = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
  if (!row) throw AppError.notFound("Backup not found");
  return serializeBackup(row);
}

export async function listRestores(query: z.infer<typeof paginationSchema>) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(restores);
  const { limit, offset } = toOffsetLimit(query);
  const rows = await db.select().from(restores).orderBy(desc(restores.createdAt)).limit(limit).offset(offset);
  return buildPaginatedResult(rows.map(serializeRestore), n, query);
}

export async function getRestore(id: string) {
  const [row] = await db.select().from(restores).where(eq(restores.id, id)).limit(1);
  if (!row) throw AppError.notFound("Restore not found");
  return serializeRestore(row);
}

// ---------------------------------------------------------------- making a backup

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ntsbk-"));
}

async function actorName(actor: Actor): Promise<string | null> {
  if (!actor) return null;
  const res = await pool.query<{ name: string }>("select name from users where id = $1", [actor.id]);
  return res.rows[0]?.name ?? null;
}

async function failStaleBackups() {
  const cutoff = new Date(Date.now() - STALE_BACKUP_MINUTES * 60_000);
  await db
    .update(backups)
    .set({ status: "failed", error: "Interrupted: the server stopped before this backup finished", completedAt: new Date() })
    .where(and(eq(backups.status, "running"), lt(backups.startedAt, cutoff)));
}

/** Records that a backup has started (and refuses if one is already running anywhere). The work happens in executeBackup. */
export async function startBackup(type: BackupRow["type"], actor: Actor): Promise<BackupRow> {
  assertReady();
  await failStaleBackups();
  const storage = getBackupStorage();
  const id = randomUUID();
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/backup-${now.toISOString().replace(/[:.]/g, "-")}-${id}.ntsbk`;
  try {
    const [row] = await db
      .insert(backups)
      .values({
        id,
        type,
        status: "running",
        storageProvider: storage.kind,
        storageKey: key,
        encrypted: isKeyUsable(env.BACKUP_ENCRYPTION_KEY),
        createdBy: actor?.id ?? null,
        createdByName: actor ? await actorName(actor) : "Automatic schedule",
      })
      .returning();
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) throw AppError.conflict("A backup is already running. Wait for it to finish.");
    throw err;
  }
}

/** Starts a backup and returns at once; it finishes in the background. */
export async function createBackupInBackground(type: BackupRow["type"], actor: Actor) {
  const row = await startBackup(type, actor);
  track(executeBackup(row.id, actor));
  return serializeBackup(row);
}

/** Does the work of a backup that startBackup recorded: copy, pack, upload, verify. Never throws; failures are recorded. */
export async function executeBackup(id: string, actor: Actor): Promise<BackupRow> {
  const provider = getBackupStorage().provider!;
  inflightBackupIds.add(id);
  const dir = await tempDir();
  try {
    const [row] = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
    if (!row) throw new Error("Backup record is missing");
    const file = path.join(dir, "backup.ntsbk");
    const result: DumpResult = { counts: {}, fingerprint: "", rowTotal: 0 };
    await packToFile(createDumpStream(result), file, isKeyUsable(env.BACKUP_ENCRYPTION_KEY) ? env.BACKUP_ENCRYPTION_KEY : undefined);
    const size = (await stat(file)).size;
    if (size <= 0) throw new Error("The backup file is empty");
    const checksum = await sha256File(file);
    await provider.put(row.storageKey, file);
    const stored = await provider.head(row.storageKey);
    if (!stored || stored.size !== size) throw new Error("The stored backup is missing or has the wrong size");
    await db
      .update(backups)
      .set({ status: "completed", completedAt: new Date(), sizeBytes: size, checksumSha256: checksum, schemaFingerprint: result.fingerprint, tableCounts: result.counts, rowTotal: result.rowTotal })
      .where(eq(backups.id, id));
    await recordAudit({ actorUserId: actor?.id ?? null, actorType: actor ? "user" : "system", action: "backup.created", entityType: "backup", entityId: id, entityLabel: row.type, metadata: { type: row.type, sizeBytes: size, rows: result.rowTotal } });
    return await verifyBackup(id, actor);
  } catch (err) {
    const message = safeMessage(err);
    const [row] = await db
      .update(backups)
      .set({ status: "failed", verificationStatus: "invalid", error: message, completedAt: new Date() })
      .where(eq(backups.id, id))
      .returning();
    if (row) await provider.delete(row.storageKey).catch(() => undefined);
    await recordAudit({ actorUserId: actor?.id ?? null, actorType: actor ? "user" : "system", action: "backup.failed", entityType: "backup", entityId: id, outcome: "failed", metadata: { error: message } });
    console.error("Backup failed", message);
    return row!;
  } finally {
    inflightBackupIds.delete(id);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------- checking a backup

/**
 * Proves a stored backup can be used: the file is there with the right size, its checksum is what was recorded, it
 * decrypts (so it was not altered), it is complete, and the rows in it match what was copied. Only then is it 'valid'.
 */
export async function verifyBackup(id: string, actor: Actor): Promise<BackupRow> {
  const provider = assertReady();
  const [row] = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
  if (!row) throw AppError.notFound("Backup not found");
  if (row.status !== "completed") throw AppError.conflict("Only a finished backup can be verified");
  const dir = await tempDir();
  try {
    const file = path.join(dir, "verify.ntsbk");
    const stored = await provider.head(row.storageKey);
    if (!stored) throw new Error("The backup file is missing from storage");
    if (row.sizeBytes !== null && stored.size !== row.sizeBytes) throw new Error("The backup file in storage has a different size than recorded");
    await provider.getToFile(row.storageKey, file);
    const checksum = await sha256File(file);
    if (checksum !== row.checksumSha256) throw new Error("The backup file's checksum does not match (it was changed or damaged)");
    const scan = await scanBackup(file, isKeyUsable(env.BACKUP_ENCRYPTION_KEY) ? env.BACKUP_ENCRYPTION_KEY : undefined);
    const recorded = (row.tableCounts ?? {}) as TableCounts;
    for (const table of scan.header.tables) {
      if ((scan.found[table] ?? 0) !== (recorded[table] ?? 0)) throw new Error(`Table ${table} does not match what was backed up`);
    }
    const [updated] = await db
      .update(backups)
      .set({ verificationStatus: "valid", verifiedAt: new Date(), error: null })
      .where(eq(backups.id, id))
      .returning();
    await recordAudit({ actorUserId: actor?.id ?? null, actorType: actor ? "user" : "system", action: "backup.verified", entityType: "backup", entityId: id, metadata: { result: "valid" } });
    return updated!;
  } catch (err) {
    const message = safeMessage(err);
    const [updated] = await db.update(backups).set({ verificationStatus: "invalid", verifiedAt: new Date(), error: message }).where(eq(backups.id, id)).returning();
    await recordAudit({ actorUserId: actor?.id ?? null, actorType: actor ? "user" : "system", action: "backup.verified", entityType: "backup", entityId: id, outcome: "failed", metadata: { result: "invalid", error: message } });
    return updated!;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------- deleting and retention

async function protectedBackupIds(): Promise<Set<string>> {
  const active = await db.select().from(restores).where(notInArray(restores.status, ["completed", "failed"]));
  const ids = new Set<string>();
  for (const r of active) {
    ids.add(r.backupId);
    if (r.safetyBackupId) ids.add(r.safetyBackupId);
  }
  return ids;
}

async function removeBackup(row: BackupRow, actor: Actor, reason: string) {
  const provider = assertReady();
  await provider.delete(row.storageKey);
  await db.update(backups).set({ status: "deleted", deletedAt: new Date() }).where(eq(backups.id, row.id));
  await recordAudit({ actorUserId: actor?.id ?? null, actorType: actor ? "user" : "system", action: "backup.deleted", entityType: "backup", entityId: row.id, metadata: { reason, type: row.type } });
}

/** A super admin deleting one backup by hand. The newest valid backup, the only valid backup and anything a restore is using cannot be deleted. */
export async function deleteBackup(id: string, actor: { id: string }, password: string) {
  await confirmPassword(actor.id, password);
  const [row] = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
  if (!row) throw AppError.notFound("Backup not found");
  if (row.status === "deleted") throw AppError.conflict("This backup is already deleted");
  if (row.status === "running") throw AppError.conflict("A backup that is running cannot be deleted");
  if ((await protectedBackupIds()).has(id)) throw AppError.conflict("A restore is using this backup right now");
  const valid = await db
    .select({ id: backups.id })
    .from(backups)
    .where(and(eq(backups.status, "completed"), eq(backups.verificationStatus, "valid")))
    .orderBy(desc(backups.startedAt));
  const isValid = valid.some((v) => v.id === id);
  if (isValid && valid[0]?.id === id) throw AppError.conflict("The newest valid backup cannot be deleted");
  if (isValid && valid.length <= 1) throw AppError.conflict("The only valid backup cannot be deleted");
  await removeBackup(row, actor, "deleted by a super admin");
  return getBackup(id);
}

/** Deletes backups past the retention policy. Safe to run from any instance. Returns how many were removed. */
export async function applyRetention(): Promise<number> {
  if (!backupConfig().ready) return 0;
  const policy = await getPolicy();
  const rows = await db.select().from(backups).where(ne(backups.status, "deleted"));
  const ids = selectBackupsToDelete(
    rows.map((r) => ({ id: r.id, type: r.type as "automatic", status: r.status as "completed", verificationStatus: r.verificationStatus as "valid", startedAt: r.startedAt })),
    policy,
    await protectedBackupIds(),
    new Date(),
  );
  let removed = 0;
  for (const id of ids) {
    const row = rows.find((r) => r.id === id)!;
    try {
      await removeBackup(row, null, `older than ${policy.retentionDays} days and outside the newest ${policy.keepLatest}`);
      removed += 1;
    } catch (err) {
      console.error("Could not delete an old backup", safeMessage(err));
    }
  }
  return removed;
}

// ---------------------------------------------------------------- downloading

export async function prepareDownload(id: string, actor: { id: string }, password: string): Promise<{ file: string; dir: string; name: string; size: number }> {
  const provider = assertReady();
  await confirmPassword(actor.id, password);
  const [row] = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
  if (!row || row.status !== "completed") throw AppError.notFound("Backup not found");
  const dir = await tempDir();
  try {
    const file = path.join(dir, "download.ntsbk");
    await provider.getToFile(row.storageKey, file);
    if ((await sha256File(file)) !== row.checksumSha256) throw AppError.conflict("The stored backup does not match its checksum, so it was not released");
    await recordAudit({ actorUserId: actor.id, action: "backup.downloaded", entityType: "backup", entityId: id });
    return { file, dir, name: `backup-${row.startedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-")}${row.encrypted ? ".ntsbk" : ".ntsbk.gz"}`, size: (await stat(file)).size };
  } catch (err) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------- restoring

export const RESTORE_CONFIRMATION_PREFIX = "RESTORE";

/** The words the super admin must type to confirm: RESTORE and the first eight characters of the backup's id. */
export const confirmationFor = (backupId: string) => `${RESTORE_CONFIRMATION_PREFIX} ${backupId.slice(0, 8).toUpperCase()}`;

/** Step 2 of a restore: everything the screen shows before the final confirmation. Changes nothing. */
export async function previewRestore(backupId: string) {
  assertReady();
  const [row] = await db.select().from(backups).where(eq(backups.id, backupId)).limit(1);
  if (!row) throw AppError.notFound("Backup not found");
  const problems: string[] = [];
  if (row.status !== "completed") problems.push("This backup did not finish.");
  if (row.verificationStatus !== "valid") problems.push("This backup has not passed verification. Verify it first.");
  const current = await schemaFingerprint(pool);
  if (row.schemaFingerprint && row.schemaFingerprint !== current) problems.push("The database structure has changed since this backup, so it cannot be restored safely.");
  const [active] = await db.select({ id: restores.id }).from(restores).where(notInArray(restores.status, ["completed", "failed"])).limit(1);
  if (active) problems.push("Another restore is already in progress.");
  const [running] = await db.select({ id: backups.id }).from(backups).where(eq(backups.status, "running")).limit(1);
  if (running) problems.push("A backup is running right now. Wait for it to finish.");
  return {
    backup: serializeBackup(row),
    canRestore: problems.length === 0,
    problems,
    confirmationPhrase: confirmationFor(row.id),
    warning: `You are about to restore the database to the state captured on ${row.startedAt.toISOString()}. Everything created or changed after that moment (registrations, payments, votes, accounts) will be replaced. A safety copy of the current database is made first.`,
  };
}

export const restoreRequestSchema = z.object({
  backupId: z.string().uuid(),
  password: z.string().min(1).max(200),
  confirmation: z.string().min(1).max(60),
  acknowledgeDataLoss: z.literal(true, { errorMap: () => ({ message: "Confirm that you understand data created after the backup will be lost" }) }),
});

/** Step 3 onward: re-checks everything on the server, then queues the restore. The actual work happens in the background. */
export async function requestRestore(actor: { id: string }, input: z.infer<typeof restoreRequestSchema>, requestId: string | null) {
  await confirmPassword(actor.id, input.password);
  const preview = await previewRestore(input.backupId);
  if (input.confirmation.trim().toUpperCase() !== preview.confirmationPhrase) throw AppError.validation(`Type ${preview.confirmationPhrase} exactly to confirm`);
  if (!preview.canRestore) throw AppError.conflict(preview.problems.join(" "));
  try {
    const [row] = await db
      .insert(restores)
      .values({ backupId: input.backupId, requestedBy: actor.id, requestedByName: await actorName(actor), requestId })
      .returning();
    await recordAudit({ actorUserId: actor.id, action: "restore.requested", entityType: "backup", entityId: input.backupId, metadata: { restoreId: row!.id, requestId } });
    return serializeRestore(row!);
  } catch (err) {
    if (isUniqueViolation(err)) throw AppError.conflict("Another restore is already in progress.");
    throw err;
  }
}

async function setRestore(id: string, patch: Partial<typeof restores.$inferInsert>) {
  await db.update(restores).set({ ...patch, updatedAt: new Date() }).where(eq(restores.id, id));
}

async function waitForNoRunningBackup(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const [running] = await db.select({ id: backups.id }).from(backups).where(eq(backups.status, "running")).limit(1);
    if (!running) return;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error("A backup kept running, so the restore could not take its safety copy");
}

/** Picks up one queued restore (on whichever instance gets it first) and runs it from start to finish. */
export async function processNextRestore(): Promise<boolean> {
  await failStaleRestores();
  const claimed = await db.execute(sql`
    update restores set status = 'preparing', updated_at = now()
    where id = (select id from restores where status = 'pending' order by created_at limit 1 for update skip locked)
    returning id`);
  const id = (claimed.rows[0] as { id?: string } | undefined)?.id;
  if (!id) return false;
  const [restore] = await db.select().from(restores).where(eq(restores.id, id)).limit(1);
  const [source] = await db.select().from(backups).where(eq(backups.id, restore!.backupId)).limit(1);
  const actor: Actor = restore!.requestedBy ? { id: restore!.requestedBy } : null;
  const audit = (action: string, extra: Record<string, unknown> = {}, outcome: "success" | "failed" = "success") =>
    recordAudit({ actorUserId: actor?.id ?? null, actorType: actor ? "user" : "system", action, entityType: "backup", entityId: source!.id, outcome, metadata: { restoreId: id, requestId: restore!.requestId, ...extra } });
  await audit("restore.started");
  const dir = await tempDir();
  let reachedTransaction = false;
  try {
    const provider = assertReady();
    // 1. Prepare: fetch the file and prove it is the one that was verified.
    const file = path.join(dir, "restore.ntsbk");
    await provider.getToFile(source!.storageKey, file);
    if ((await sha256File(file)) !== source!.checksumSha256) throw new Error("The backup's checksum no longer matches. Nothing was changed.");

    // 2. Safety copy of the database as it is now.
    await setRestore(id, { status: "backing_up_current_database" });
    await waitForNoRunningBackup();
    const safety = await startBackup("pre_restore", actor);
    await setRestore(id, { safetyBackupId: safety.id });
    const done = await executeBackup(safety.id, actor);
    if (done.status !== "completed" || done.verificationStatus !== "valid") throw new Error("The safety copy of the current database could not be made, so nothing was changed.");

    // 3. Restore inside one transaction, then check it.
    reachedTransaction = true;
    const outcome = await restoreFromFile(file, isKeyUsable(env.BACKUP_ENCRYPTION_KEY) ? env.BACKUP_ENCRYPTION_KEY : undefined, async (stage) => {
      await setRestore(id, { status: stage });
    });
    await setRestore(id, { status: "completed", completedAt: new Date(), tableCounts: outcome.counts, error: null });
    await db.update(backups).set({ lastRestoredAt: new Date() }).where(eq(backups.id, source!.id));
    await audit("restore.completed", { safetyBackupId: safety.id });
    return true;
  } catch (err) {
    const message = safeMessage(err);
    await setRestore(id, { status: "failed", error: message, rolledBack: reachedTransaction, completedAt: new Date() });
    await audit("restore.failed", { error: message }, "failed");
    if (reachedTransaction) await audit("restore.rollback", { note: "The database was left exactly as it was before the restore" });
    console.error("Restore failed", message);
    return true;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function failStaleRestores() {
  const cutoff = new Date(Date.now() - STALE_RESTORE_MINUTES * 60_000);
  await db
    .update(restores)
    .set({ status: "failed", error: "Interrupted: the server stopped during the restore. The database is unchanged unless the restore had already finished.", completedAt: new Date(), rolledBack: true })
    .where(and(inArray(restores.status, ["preparing", "backing_up_current_database", "restoring", "verifying"]), lt(restores.updatedAt, cutoff)));
}

// ---------------------------------------------------------------- the daily schedule

/** True when today's scheduled hour has passed and no automatic backup has been tried since, or the last try failed a while ago. */
export async function automaticBackupDue(now = new Date()): Promise<boolean> {
  const cfg = backupConfig();
  if (!cfg.ready) return false;
  const scheduled = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), cfg.scheduleHourUtc, 0, 0));
  if (now < scheduled) return false;
  const recent = await db
    .select({ status: backups.status, startedAt: backups.startedAt })
    .from(backups)
    .where(and(eq(backups.type, "automatic"), sql`${backups.startedAt} >= ${scheduled}`))
    .orderBy(desc(backups.startedAt));
  if (recent.some((r) => r.status === "completed" || r.status === "running")) return false;
  // Failed earlier today: try again, but not more than 3 times and not more often than every 30 minutes.
  if (recent.length >= 3) return false;
  const last = recent[0];
  if (last && now.getTime() - last.startedAt.getTime() < 30 * 60_000) return false;
  return true;
}

export async function runScheduledBackup(): Promise<void> {
  if (!(await automaticBackupDue())) return;
  let row: BackupRow;
  try {
    row = await startBackup("automatic", null);
  } catch (err) {
    if ((err as AppError).code === "CONFLICT") return; // another instance got there first
    throw err;
  }
  await track(executeBackup(row.id, null));
  await applyRetention().catch((err) => console.error("Retention failed", safeMessage(err)));
}

/** Waits for running backup/restore work and marks anything still unfinished as interrupted. Called on shutdown. */
export async function stopBackupWork(waitMs = 15_000): Promise<void> {
  await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, waitMs))]);
  if (inflightBackupIds.size > 0) {
    await db
      .update(backups)
      .set({ status: "failed", error: "Interrupted by a server restart", completedAt: new Date() })
      .where(and(eq(backups.status, "running"), inArray(backups.id, [...inflightBackupIds])))
      .catch(() => undefined);
  }
}
