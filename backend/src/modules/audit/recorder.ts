import { eq } from "drizzle-orm";
import { isTest } from "../../config/env.js";
import { db } from "../../db/client.js";
import { auditLogs, users } from "../../db/schema/index.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { auditContext } from "./context.js";

export type AuditRow = typeof auditLogs.$inferInsert;

/** An event as the code states it, before the account and the person are filled in. */
export interface AuditDraft {
  actorUserId?: string | null;
  tenantId?: string | null;
  actorType?: "user" | "visitor" | "voter" | "system";
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  label?: string | null;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  outcome?: "success" | "failed" | "denied";
  source?: "request" | "event";
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  requestId?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

// ---------------------------------------------------------------- writing, in batches

type Sink = (rows: AuditRow[]) => Promise<void>;

const databaseSink: Sink = async (rows) => {
  await db.insert(auditLogs).values(rows);
};

let sink: Sink = databaseSink;
/** Tests replace where entries go (nothing touches a database there). */
export function setAuditSink(next: Sink | null) {
  sink = next ?? databaseSink;
}

const queue: AuditRow[] = [];
let timer: NodeJS.Timeout | undefined;
let flushing: Promise<void> = Promise.resolve();
const MAX_QUEUE = 5_000;

/** Writes everything waiting. Called every second, when the queue is big, and when the server shuts down. */
export function flushAudit(): Promise<void> {
  flushing = flushing.then(async () => {
    while (queue.length > 0) {
      const batch = queue.splice(0, 200);
      try {
        await sink(batch);
      } catch (err) {
        console.error("Could not write audit entries", err);
        // Try these again once, but never let a database problem grow the queue without limit.
        if (queue.length + batch.length <= MAX_QUEUE) queue.unshift(...batch);
        return;
      }
    }
  });
  return flushing;
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flushAudit();
  }, 1_000);
  timer.unref();
}

export function enqueueAudit(rows: AuditRow[]) {
  // Without a test sink there is nowhere to write while testing.
  if (isTest && sink === databaseSink) return;
  if (queue.length + rows.length > MAX_QUEUE) queue.splice(0, rows.length);
  queue.push(...rows);
  if (queue.length >= 100) void flushAudit();
  else schedule();
}

// ---------------------------------------------------------------- filling in who it was

interface KnownUser {
  tenantId: string | null;
  name: string;
  email: string;
  role: string;
}
const userCache = new TtlCache<KnownUser | null>(2_000);

/** A user's name, email, role and account, remembered briefly. */
export function lookupUser(userId: string): Promise<KnownUser | null> {
  return userCache.get(userId, 60_000, async () => {
    const [row] = await db.select({ tenantId: users.tenantId, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    return row ? { tenantId: row.tenantId, name: row.name, email: row.email, role: row.role } : null;
  });
}

/** Completes a draft: the person (from the user id), the account (the draft's, else the person's) and the defaults. */
export async function completeDraft(draft: AuditDraft): Promise<AuditRow> {
  let { actorName, actorEmail, actorRole, tenantId } = draft;
  let actorType = draft.actorType;
  if (draft.actorUserId && (!actorName || !tenantId)) {
    const known = await lookupUser(draft.actorUserId).catch(() => null);
    if (known) {
      actorName ??= known.name;
      actorEmail ??= known.email;
      actorRole ??= known.role;
      tenantId ??= known.tenantId;
    }
  }
  actorType ??= draft.actorUserId ? "user" : "system";
  return {
    actorUserId: draft.actorUserId ?? null,
    tenantId: tenantId ?? null,
    actorType,
    actorName: actorName ?? null,
    actorEmail: actorEmail ?? null,
    actorRole: actorRole ?? null,
    action: draft.action,
    label: draft.label ?? null,
    entityType: draft.entityType,
    entityId: draft.entityId ?? null,
    entityLabel: draft.entityLabel ?? null,
    outcome: draft.outcome ?? "success",
    source: draft.source ?? "event",
    method: draft.method ?? null,
    path: draft.path ?? null,
    statusCode: draft.statusCode ?? null,
    requestId: draft.requestId ?? null,
    userAgent: draft.userAgent ?? null,
    metadata: draft.metadata ?? null,
    ipAddress: draft.ipAddress ?? null,
  };
}

// ---------------------------------------------------------------- recording an event

export interface RecordAuditInput {
  actorUserId?: string | null;
  /** The account the activity belongs to, when the caller knows it. Otherwise it is worked out from the request or the person. */
  tenantId?: string | null;
  actorType?: AuditDraft["actorType"];
  /** Who it was, when there is no signed-in user to look up (a visitor or voter). */
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  /** The action in plain words. A readable one is made from the action name if left out. */
  label?: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  outcome?: AuditDraft["outcome"];
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

const KNOWN_LABELS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  "user.register": "Created an account",
  "user.verify_email": "Confirmed their email address",
  "user.update_profile": "Updated their profile",
  "user.change_password": "Changed their password",
  "user.change_email": "Changed their email address",
  "user.create": "Added a team member",
  "user.remove_from_team": "Removed someone from the team",
  "account.own_space_created": "Opened their own space",
  "organization.rename": "Changed the organization's name",
  "form.publish": "Published the registration form",
  "registration.status_change": "Changed the status of a registration or order",
  "registration.edit": "Edited a registration's answers",
  "registration.import": "Imported registrations from a file",
  "registrations.export": "Exported registrations",
  "program.payment_config": "Changed the program's payment settings",
  "payment.waived": "Waived a payment",
  "payment.recheck": "Re-checked a payment with Monime",
  "payment.completed": "A payment was received",
  "payment.started": "A payment was started",
  "payment.failed": "A payment did not go through",
  "payment.expired": "A payment expired",
  "payment.cancelled": "A payment was cancelled",
  "payment.review": "A payment needs review",
  "payout_account.add": "Added a withdrawal account",
  "payout_account.remove": "Removed a withdrawal account",
  "payout.request": "Requested a withdrawal",
  "payout.cancel": "Cancelled a withdrawal",
  "payout.approve": "Approved a withdrawal",
  "payout.reject": "Declined a withdrawal",
  "payout.completed": "A withdrawal was sent",
  "payout.failed": "A withdrawal failed",
  "public.submit": "Submitted a registration or order",
  "verification.scan": "A QR code was scanned",
  "voter.vote": "Cast a vote",
};

const humanize = (action: string) => {
  if (KNOWN_LABELS[action]) return KNOWN_LABELS[action]!;
  const text = action.replace(/[._]/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Records that something happened. Inside a request it is kept with that request and written when the response is
 * sent (so it carries the result, address and browser); anywhere else (background work) it is written straight away.
 * It never throws and never slows the thing being recorded.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const ctx = auditContext.getStore();
    const draft: AuditDraft = {
      ...input,
      label: input.label ?? humanize(input.action),
      source: "event",
      requestId: ctx?.requestId ?? null,
      method: ctx?.method ?? null,
      path: ctx?.path ?? null,
      userAgent: ctx?.userAgent ?? null,
      ipAddress: input.ipAddress ?? ctx?.ip ?? null,
      metadata: input.metadata ?? null,
    };
    if (ctx) {
      ctx.pending.push(draft);
      return;
    }
    enqueueAudit([await completeDraft(draft)]);
  } catch (err) {
    // Auditing must never break the primary operation it is observing.
    console.error("Failed to record audit log", err);
  }
}
