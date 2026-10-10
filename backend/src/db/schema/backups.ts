import { bigint, boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * One row per database backup. The file itself lives in the backup storage (never in the database); this row says
 * where it is, how big it is, its checksum, and whether it has been verified. A backup counts as a recovery point only
 * when verification_status is 'valid'. Migration 0030 also adds a unique index so that only ONE backup can be running
 * at a time, even across several server instances.
 */
export const backups = pgTable(
  "backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // automatic (daily schedule), manual (a super admin pressed the button), pre_restore (safety copy taken before a restore).
    type: text("type").notNull(),
    // running -> completed | failed; deleted once retention (or a super admin) removed the file.
    status: text("status").notNull().default("running"),
    // pending -> valid | invalid. Only a completed AND valid backup can be restored.
    verificationStatus: text("verification_status").notNull().default("pending"),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    // SHA-256 of the stored file (after encryption), checked again before every restore or download.
    checksumSha256: text("checksum_sha256"),
    encrypted: boolean("encrypted").notNull().default(true),
    // A hash of the database structure (tables, columns, types). A backup can only be restored into the same structure.
    schemaFingerprint: text("schema_fingerprint"),
    tableCounts: jsonb("table_counts"),
    rowTotal: bigint("row_total", { mode: "number" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdByName: text("created_by_name"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    lastRestoredAt: timestamp("last_restored_at", { withTimezone: true }),
  },
  (table) => [index("backups_started_idx").on(table.startedAt), index("backups_type_status_idx").on(table.type, table.status, table.startedAt)],
);

/** A request to restore the database from a backup, and how far it has got. Only one can be active at a time (migration 0030). */
export const restores = pgTable(
  "restores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    backupId: uuid("backup_id")
      .notNull()
      .references(() => backups.id),
    // The copy of the CURRENT database taken just before restoring; the way back if the restore turns out to be a mistake.
    safetyBackupId: uuid("safety_backup_id").references(() => backups.id),
    // pending, preparing, backing_up_current_database, restoring, verifying, completed, failed
    status: text("status").notNull().default("pending"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    requestedByName: text("requested_by_name"),
    requestId: text("request_id"),
    error: text("error"),
    tableCounts: jsonb("table_counts"),
    // True when the restore failed after the safety copy was made and the database was left unchanged (rolled back).
    rolledBack: boolean("rolled_back").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("restores_created_idx").on(table.createdAt)],
);
