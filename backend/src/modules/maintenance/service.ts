import { and, count, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { systemSettings, users, voterAccounts } from "../../db/schema/index.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { recordAudit } from "../audit/recorder.js";
import { queueEmail } from "../email/outbox.js";
import { maintenanceEmail } from "../email/templates.js";

// Maintenance mode: the platform team switches it on, says what to tell people, picks where the notice shows (everywhere
// or chosen parts of the site), and can email everyone. The notice itself is what the pages show; it never stops the
// platform team from working (the screens always let a super admin through).

/** The parts of the site a notice can be shown on. */
export const MAINTENANCE_AREAS = ["site", "auth", "admin", "registration", "voting", "payment", "verify"] as const;
export type MaintenanceArea = (typeof MAINTENANCE_AREAS)[number];

export const maintenanceInputSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().trim().min(5, "Write a short message for people to read").max(600),
    // banner: a strip at the top of the page. page: the page is replaced by the maintenance screen (the platform team still gets in).
    mode: z.enum(["banner", "page"]).default("banner"),
    scope: z.enum(["all", "selected"]).default("all"),
    areas: z.array(z.enum(MAINTENANCE_AREAS)).max(MAINTENANCE_AREAS.length).default([]),
    // When it is expected to end (shown to people, and the notice stops showing by itself once it has passed).
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    // Emails sent when maintenance is switched on.
    notifyStaff: z.boolean().default(true),
    notifyVoters: z.boolean().default(false),
    // An email when it is switched off again.
    notifyWhenBack: z.boolean().default(false),
  })
  .refine((v) => v.scope === "all" || v.areas.length > 0, { message: "Choose at least one part of the site to show the notice on", path: ["areas"] })
  .refine((v) => !v.endsAt || new Date(v.endsAt).getTime() > Date.now() - 60_000 || !v.enabled, { message: "The expected end must be in the future", path: ["endsAt"] });
export type MaintenanceInput = z.infer<typeof maintenanceInputSchema>;

export interface MaintenanceState extends Omit<MaintenanceInput, "endsAt"> {
  endsAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastNotifiedAt: string | null;
  lastNotifiedCount: number;
}

const KEY = "maintenance";
const DEFAULT: MaintenanceState = {
  enabled: false,
  message: "We are making improvements. Some things may be unavailable for a short while. Thank you for your patience.",
  mode: "banner",
  scope: "all",
  areas: [],
  endsAt: null,
  notifyStaff: true,
  notifyVoters: false,
  notifyWhenBack: false,
  updatedAt: null,
  updatedBy: null,
  lastNotifiedAt: null,
  lastNotifiedCount: 0,
};

const cache = new TtlCache<MaintenanceState>(1);

export async function readMaintenance(): Promise<MaintenanceState> {
  return cache.get(KEY, 10_000, async () => {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, KEY)).limit(1);
    const parsed = row ? { ...DEFAULT, ...(row.value as Partial<MaintenanceState>) } : DEFAULT;
    return { ...parsed, updatedAt: row?.updatedAt.toISOString() ?? null, updatedBy: row?.updatedBy ?? null };
  });
}

/** What every visitor's browser is told: whether a notice is up, what it says, and where it applies. Nothing private. */
export async function publicMaintenance() {
  const state = await readMaintenance();
  const over = state.endsAt !== null && new Date(state.endsAt).getTime() < Date.now();
  const active = state.enabled && !over;
  return {
    active,
    message: active ? state.message : "",
    mode: state.mode,
    scope: state.scope,
    areas: state.scope === "all" ? [...MAINTENANCE_AREAS] : state.areas,
    endsAt: active ? state.endsAt : null,
    updatedAt: state.updatedAt,
  };
}

async function recipients(options: { staff: boolean; voters: boolean }) {
  const list: { email: string; name: string }[] = [];
  if (options.staff) {
    const rows = await db.select({ email: users.email, name: users.name }).from(users).where(and(eq(users.status, "active"), isNotNull(users.emailVerifiedAt)));
    list.push(...rows);
  }
  if (options.voters) {
    const rows = await db.select({ email: voterAccounts.email, name: voterAccounts.name }).from(voterAccounts).where(isNotNull(voterAccounts.emailVerifiedAt));
    list.push(...rows);
  }
  // One email per address, whatever lists it was on.
  return [...new Map(list.map((r) => [r.email.toLowerCase(), r])).values()];
}

export async function countRecipients(options: { staff: boolean; voters: boolean }) {
  let total = 0;
  if (options.staff) total += (await db.select({ n: count() }).from(users).where(and(eq(users.status, "active"), isNotNull(users.emailVerifiedAt))))[0]?.n ?? 0;
  if (options.voters) total += (await db.select({ n: count() }).from(voterAccounts).where(isNotNull(voterAccounts.emailVerifiedAt)))[0]?.n ?? 0;
  return total;
}

const when = (iso: string | null) => (iso ? new Date(iso).toUTCString() : null);

async function send(kind: "start" | "end", state: MaintenanceState, options: { staff: boolean; voters: boolean }) {
  const people = await recipients(options);
  const mail =
    kind === "start"
      ? maintenanceEmail({
          heading: "The system is under maintenance",
          message: state.message,
          details: [{ label: "What this means", value: "Some pages may be unavailable or slow until it is finished." }, ...(state.endsAt ? [{ label: "Expected back", value: when(state.endsAt)! }] : [])],
        })
      : maintenanceEmail({
          heading: "The system is back",
          message: "Maintenance is finished and everything is available again. Thank you for your patience.",
          details: [],
        });
  for (const person of people) void queueEmail({ to: person.email, toName: person.name, subject: mail.subject, html: mail.html });
  return people.length;
}

/** Saves the settings. Emails go out when maintenance is switched on (or off, when asked), not on every save. */
export async function saveMaintenance(actor: { id: string; name?: string }, input: MaintenanceInput, ipAddress?: string) {
  const before = await readMaintenance();
  const next: MaintenanceState = {
    ...before,
    enabled: input.enabled,
    message: input.message,
    mode: input.mode,
    scope: input.scope,
    areas: input.scope === "all" ? [] : [...new Set(input.areas)],
    endsAt: input.endsAt ?? null,
    notifyStaff: input.notifyStaff,
    notifyVoters: input.notifyVoters,
    notifyWhenBack: input.notifyWhenBack,
  };

  let sent = 0;
  let sentKind: "start" | "end" | null = null;
  if (input.enabled && !before.enabled && (input.notifyStaff || input.notifyVoters)) {
    sent = await send("start", next, { staff: input.notifyStaff, voters: input.notifyVoters });
    sentKind = "start";
  } else if (!input.enabled && before.enabled && before.notifyWhenBack && (before.notifyStaff || before.notifyVoters)) {
    sent = await send("end", next, { staff: before.notifyStaff, voters: before.notifyVoters });
    sentKind = "end";
  }
  if (sentKind) {
    next.lastNotifiedAt = new Date().toISOString();
    next.lastNotifiedCount = sent;
  }

  const { updatedAt: _a, updatedBy: _b, ...stored } = next;
  void _a;
  void _b;
  await db
    .insert(systemSettings)
    .values({ key: KEY, value: stored, updatedBy: actor.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: stored, updatedBy: actor.id, updatedAt: new Date() } });
  cache.clear();

  await recordAudit({
    actorUserId: actor.id,
    action: input.enabled ? "maintenance.on" : "maintenance.off",
    label: input.enabled ? "Switched maintenance mode on" : "Switched maintenance mode off",
    entityType: "system",
    metadata: { mode: input.mode, scope: input.scope, areas: next.areas, endsAt: next.endsAt, emailsQueued: sent, emailKind: sentKind },
    ipAddress,
  });
  return { state: await readMaintenance(), emailsQueued: sent };
}

/** Sends the notice again to everyone, for example after a long wait or a change of plan. */
export async function resendMaintenanceNotice(actor: { id: string }, ipAddress?: string) {
  const state = await readMaintenance();
  if (!state.enabled) return { emailsQueued: 0 };
  const sent = await send("start", state, { staff: state.notifyStaff, voters: state.notifyVoters });
  const stored = { ...state, lastNotifiedAt: new Date().toISOString(), lastNotifiedCount: sent };
  const { updatedAt: _a, updatedBy: _b, ...value } = stored;
  void _a;
  void _b;
  await db.update(systemSettings).set({ value, updatedAt: new Date(), updatedBy: actor.id }).where(eq(systemSettings.key, KEY));
  cache.clear();
  await recordAudit({ actorUserId: actor.id, action: "maintenance.notify", label: "Sent the maintenance notice again", entityType: "system", metadata: { emailsQueued: sent }, ipAddress });
  return { emailsQueued: sent };
}

