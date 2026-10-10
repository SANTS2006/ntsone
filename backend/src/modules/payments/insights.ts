import { and, count, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { payments, polls, programs, registrations } from "../../db/schema/index.js";
import { listAccessibleBusinessIds } from "../businesses/access.js";
import { listAccessiblePollIds } from "../polls/access.js";
import { listAccessibleProgramIds } from "../programs/access.js";
import type { AuthenticatedUser } from "../users/types.js";
import { balancesFor } from "./wallet.js";

const NONE = "00000000-0000-0000-0000-000000000000";
const DAYS = 30;
const n = (value: unknown) => Number(value ?? 0);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** One point per day for the last `DAYS` days, whole Leones, so a chart can show money the way it shows counts. */
function lastDays(rows: { day: string; value: unknown }[], start: Date) {
  const byDay = new Map(rows.map((r) => [r.day, n(r.value)]));
  return Array.from({ length: DAYS }, (_, i) => {
    const date = isoDay(new Date(start.getTime() + i * 86_400_000));
    return { date, count: Math.round((byDay.get(date) ?? 0) / 100) };
  });
}

/** Money and payments at a glance for the dashboard, limited to what the person can see. */
export async function getPaymentInsights(user: AuthenticatedUser) {
  const [programIds, businessIds, pollIds] = await Promise.all([listAccessibleProgramIds(user), listAccessibleBusinessIds(user), listAccessiblePollIds(user)]);
  const seesAll = programIds === "all" || businessIds === "all" || pollIds === "all";
  // Payments for registrations and orders (by program or business) and for votes (by poll).
  const scope: SQL | undefined = seesAll
    ? undefined
    : or(
        inArray(payments.programId, programIds.length ? programIds : [NONE]),
        inArray(programs.businessId, (businessIds as string[]).length ? (businessIds as string[]) : [NONE]),
        inArray(payments.pollId, (pollIds as string[]).length ? (pollIds as string[]) : [NONE]),
      );

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86_400_000);
  const trendStart = new Date(startOfToday.getTime() - (DAYS - 1) * 86_400_000);
  const paid = eq(payments.status, "completed");

  const base = () => db.select().from(payments).leftJoin(programs, eq(programs.id, payments.programId)).leftJoin(polls, eq(polls.id, payments.pollId));

  const [[totals], trendRows, topPrograms, recent, [fees]] = await Promise.all([
    db
      .select({
        created: count(),
        completed: sql<number>`count(*) filter (where ${payments.status} = 'completed')`,
        pending: sql<number>`count(*) filter (where ${payments.status} = 'pending')`,
        review: sql<number>`count(*) filter (where ${payments.status} = 'review')`,
        failed: sql<number>`count(*) filter (where ${payments.status} in ('failed', 'expired', 'cancelled'))`,
        collected: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'completed'), 0)`,
        today: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'completed' and ${payments.paidAt} >= ${startOfToday}), 0)`,
        week: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'completed' and ${payments.paidAt} >= ${startOfWeek}), 0)`,
        waitingMinor: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'pending'), 0)`,
      })
      .from(payments)
      .leftJoin(programs, eq(programs.id, payments.programId))
      .where(scope),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${payments.paidAt} at time zone 'UTC'), 'YYYY-MM-DD')`, value: sql<string>`sum(${payments.amountMinor})` })
      .from(payments)
      .leftJoin(programs, eq(programs.id, payments.programId))
      .where(and(scope, paid, gte(payments.paidAt, trendStart)))
      .groupBy(sql`1`),
    db
      .select({
        id: sql<string>`coalesce(${programs.id}, ${polls.id})`,
        name: sql<string>`coalesce(${programs.name}, ${polls.name})`,
        kind: sql<string>`coalesce(${programs.kind}::text, 'poll')`,
        businessId: programs.businessId,
        payments: sql<number>`count(*) filter (where ${payments.status} = 'completed')`,
        collected: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'completed'), 0)`,
      })
      .from(payments)
      .leftJoin(programs, eq(programs.id, payments.programId))
      .leftJoin(polls, eq(polls.id, payments.pollId))
      .where(scope)
      .groupBy(sql`1, 2, 3`, programs.businessId)
      .orderBy(sql`6 desc`)
      .limit(5),
    base()
      .where(scope)
      .orderBy(desc(payments.createdAt))
      .limit(6)
      .then((rows) =>
        rows.map(({ payments: p, programs: program, polls: poll }) => ({
          id: p.id,
          programId: program?.id ?? poll?.id ?? p.id,
          programName: program?.name ?? poll?.name ?? "",
          kind: program?.kind ?? "poll",
          businessId: program?.businessId ?? null,
          registrationId: p.registrationId,
          payer: p.payerName ?? p.payerEmail ?? null,
          amountMinor: p.amountMinor,
          status: p.status,
          createdAt: p.createdAt,
        })),
      ),
    // What the platform has kept, shown to the platform team only.
    user.role === "super_admin"
      ? db.select({ fees: sql<string>`coalesce(sum(${payments.feeMinor}) filter (where ${payments.status} = 'completed'), 0)` }).from(payments)
      : Promise.resolve([undefined]),
  ]);

  // The organization's own money (its balance and what is on hold) is shown to its admins.
  const canSeeFund = user.tenantId && (user.role === "admin" || user.role === "super_admin");
  const balances = canSeeFund && user.tenantId ? await balancesFor(user.tenantId) : null;

  const created = n(totals?.created);
  const completed = n(totals?.completed);
  return {
    currency: "SLE",
    created,
    completed,
    pending: n(totals?.pending),
    review: n(totals?.review),
    failed: n(totals?.failed),
    // Of the payments that were started, how many were finished.
    successRate: created > 0 ? Math.round((completed / created) * 100) : null,
    collectedMinor: n(totals?.collected),
    todayMinor: n(totals?.today),
    weekMinor: n(totals?.week),
    waitingMinor: n(totals?.waitingMinor),
    averageMinor: completed > 0 ? Math.round(n(totals?.collected) / completed) : 0,
    platformFeesMinor: fees ? n(fees.fees) : null,
    balances,
    trend: lastDays(trendRows, trendStart),
    topPrograms: topPrograms.map((p) => ({ id: p.id, name: p.name, kind: p.kind, businessId: p.businessId, payments: n(p.payments), collectedMinor: n(p.collected) })),
    recent,
  };
}

/** Payment analytics for one program or order form. */
export async function getProgramPaymentAnalytics(programId: string) {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const trendStart = new Date(startOfToday.getTime() - (DAYS - 1) * 86_400_000);
  const here = eq(payments.programId, programId);

  const [[totals], byStatus, byPurpose, byChannel, trendRows, items, [people]] = await Promise.all([
    db
      .select({
        created: count(),
        collected: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'completed'), 0)`,
        largest: sql<string>`coalesce(max(${payments.amountMinor}) filter (where ${payments.status} = 'completed'), 0)`,
        completed: sql<number>`count(*) filter (where ${payments.status} = 'completed')`,
        waiting: sql<string>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} in ('pending', 'review')), 0)`,
      })
      .from(payments)
      .where(here),
    db.select({ status: payments.status, value: count(), amount: sql<string>`coalesce(sum(${payments.amountMinor}), 0)` }).from(payments).where(here).groupBy(payments.status),
    db
      .select({ purpose: payments.purpose, value: count(), amount: sql<string>`coalesce(sum(${payments.amountMinor}), 0)` })
      .from(payments)
      .where(and(here, eq(payments.status, "completed")))
      .groupBy(payments.purpose),
    db
      .select({ provider: sql<string>`coalesce(${payments.channel}->>'provider', ${payments.channel}->>'type', 'Not recorded')`, value: count(), amount: sql<string>`coalesce(sum(${payments.amountMinor}), 0)` })
      .from(payments)
      .where(and(here, eq(payments.status, "completed")))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${payments.paidAt} at time zone 'UTC'), 'YYYY-MM-DD')`, value: sql<string>`sum(${payments.amountMinor})` })
      .from(payments)
      .where(and(here, eq(payments.status, "completed"), gte(payments.paidAt, trendStart)))
      .groupBy(sql`1`),
    // What was bought: each line of every paid payment.
    db.execute<{ name: string; quantity: number; amount: string }>(sql`
      SELECT line->>'name' AS name,
             sum(coalesce((line->>'quantity')::int, 1))::int AS quantity,
             sum(coalesce((line->>'totalMinor')::bigint, 0))::text AS amount
      FROM payments, jsonb_array_elements(line_items) AS line
      WHERE program_id = ${programId} AND status = 'completed'
      GROUP BY 1
      ORDER BY 3 DESC NULLS LAST
      LIMIT 8
    `),
    db
      .select({ registrations: count() })
      .from(registrations)
      .where(eq(registrations.programId, programId)),
  ]);

  const created = n(totals?.created);
  const completed = n(totals?.completed);
  return {
    currency: "SLE",
    created,
    completed,
    registrations: n(people?.registrations),
    collectedMinor: n(totals?.collected),
    waitingMinor: n(totals?.waiting),
    averageMinor: completed > 0 ? Math.round(n(totals?.collected) / completed) : 0,
    largestMinor: n(totals?.largest),
    successRate: created > 0 ? Math.round((completed / created) * 100) : null,
    byStatus: byStatus.map((r) => ({ status: r.status, count: n(r.value), amountMinor: n(r.amount) })),
    byPurpose: byPurpose.map((r) => ({ purpose: r.purpose, count: n(r.value), amountMinor: n(r.amount) })),
    byChannel: byChannel.map((r) => ({ provider: r.provider, count: n(r.value), amountMinor: n(r.amount) })),
    items: items.rows.map((r) => ({ name: r.name, quantity: n(r.quantity), amountMinor: n(r.amount) })),
    trend: lastDays(trendRows, trendStart),
  };
}
