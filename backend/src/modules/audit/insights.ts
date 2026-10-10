import { and, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { auditLogs, tenants } from "../../db/schema/index.js";

const DAYS = 30;
const n = (value: unknown) => Number(value ?? 0);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The audit log at a glance, for the platform's dashboard. */
export async function getAuditInsights() {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86_400_000);
  const trendStart = new Date(startOfToday.getTime() - (DAYS - 1) * 86_400_000);
  const problem = ne(auditLogs.outcome, "success");

  const [[totals], trendRows, busiest, recentProblems] = await Promise.all([
    db
      .select({
        total: count(),
        today: sql<number>`count(*) filter (where ${auditLogs.createdAt} >= ${startOfToday})`,
        week: sql<number>`count(*) filter (where ${auditLogs.createdAt} >= ${startOfWeek})`,
        problemsWeek: sql<number>`count(*) filter (where ${auditLogs.createdAt} >= ${startOfWeek} and ${auditLogs.outcome} <> 'success')`,
        accountsWeek: sql<number>`count(distinct ${auditLogs.tenantId}) filter (where ${auditLogs.createdAt} >= ${startOfWeek})`,
        visitorsWeek: sql<number>`count(*) filter (where ${auditLogs.createdAt} >= ${startOfWeek} and ${auditLogs.actorType} in ('visitor', 'voter'))`,
      })
      .from(auditLogs),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${auditLogs.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`, value: count() })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, trendStart))
      .groupBy(sql`1`),
    db
      .select({ tenantId: auditLogs.tenantId, name: tenants.name, events: count(), problems: sql<number>`count(*) filter (where ${auditLogs.outcome} <> 'success')` })
      .from(auditLogs)
      .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
      .where(gte(auditLogs.createdAt, startOfWeek))
      .groupBy(auditLogs.tenantId, tenants.name)
      .orderBy(desc(count()))
      .limit(5),
    db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        label: auditLogs.label,
        action: auditLogs.action,
        outcome: auditLogs.outcome,
        actorName: auditLogs.actorName,
        actorType: auditLogs.actorType,
        tenantName: tenants.name,
      })
      .from(auditLogs)
      .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
      .where(and(problem, inArray(auditLogs.outcome, ["failed", "denied"])))
      .orderBy(desc(auditLogs.createdAt))
      .limit(5),
  ]);

  const byDay = new Map(trendRows.map((r) => [r.day, n(r.value)]));
  return {
    total: n(totals?.total),
    today: n(totals?.today),
    week: n(totals?.week),
    problemsWeek: n(totals?.problemsWeek),
    accountsWeek: n(totals?.accountsWeek),
    visitorsWeek: n(totals?.visitorsWeek),
    trend: Array.from({ length: DAYS }, (_, i) => {
      const date = isoDay(new Date(trendStart.getTime() + i * 86_400_000));
      return { date, count: byDay.get(date) ?? 0 };
    }),
    busiest: busiest.map((r) => ({ tenantId: r.tenantId, name: r.name ?? "No account", events: n(r.events), problems: n(r.problems) })),
    recentProblems,
  };
}
