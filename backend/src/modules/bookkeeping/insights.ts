import { and, count, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { bookEntries, bookVoiceNotes, businesses } from "../../db/schema/index.js";
import { listAccessibleBusinessIds } from "../businesses/access.js";
import type { AuthenticatedUser } from "../users/types.js";
import { COST_OF_GOODS_KINDS, EXPENSE_KINDS, REVENUE_KINDS, todayString } from "./rules.js";

const NONE = "00000000-0000-0000-0000-000000000000";
const DAYS = 30;
const n = (value: unknown) => Number(value ?? 0);
const list = (kinds: readonly string[]) => sql.join(kinds.map((k) => sql`${k}`), sql`, `);

/** The books of every business the person can see, at a glance for the dashboard. Nothing is shown until a book has been used. */
export async function getBookkeepingInsights(user: AuthenticatedUser) {
  const access = await listAccessibleBusinessIds(user);
  const ids = access === "all" ? null : access.length ? access : [NONE];
  const scopeEntries = ids ? inArray(bookEntries.businessId, ids) : undefined;
  const scopeBusinesses = ids ? inArray(businesses.id, ids) : undefined;

  const today = todayString();
  const monthStart = `${today.slice(0, 8)}01`;
  const trendStart = new Date(Date.parse(`${today}T00:00:00Z`) - (DAYS - 1) * 86_400_000);
  const active = and(scopeEntries, isNull(bookEntries.voidedAt));

  const [perBusiness, unpaid, loans, [voice], trendRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        currency: businesses.currency,
        revenue: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in (${list(REVENUE_KINDS)}) and ${bookEntries.entryDate} >= ${monthStart}), 0)`,
        costs: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in (${list([...COST_OF_GOODS_KINDS, ...EXPENSE_KINDS])}) and ${bookEntries.entryDate} >= ${monthStart}), 0)`,
        entries: count(bookEntries.id),
      })
      .from(bookEntries)
      .innerJoin(businesses, sql`${businesses.id} = ${bookEntries.businessId}`)
      .where(and(active, scopeBusinesses, isNull(businesses.deletedAt)))
      .groupBy(businesses.id, businesses.name, businesses.currency),
    db
      .select({
        businessId: bookEntries.businessId,
        owedToYou: sql<string>`coalesce(sum(${bookEntries.amountMinor} - ${bookEntries.paidMinor}) filter (where ${bookEntries.kind} = 'sale'), 0)`,
        youOwe: sql<string>`coalesce(sum(${bookEntries.amountMinor} - ${bookEntries.paidMinor}) filter (where ${bookEntries.kind} in ('purchase','expense')), 0)`,
      })
      .from(bookEntries)
      .where(and(active, sql`${bookEntries.paidMinor} < ${bookEntries.amountMinor}`))
      .groupBy(bookEntries.businessId),
    db.execute<{ business_id: string; direction: string; balance: string; open: number; overdue: number }>(sql`
      select l.business_id, l.direction,
             coalesce(sum(greatest(0, round(l.principal_minor * (1 + l.interest_percent / 100)) - coalesce(r.repaid, 0))), 0)::text as balance,
             count(*)::int as open,
             count(*) filter (where l.due_on is not null and l.due_on < ${today} and round(l.principal_minor * (1 + l.interest_percent / 100)) > coalesce(r.repaid, 0))::int as overdue
      from book_loans l
      left join (
        select loan_id, sum(amount_minor) as repaid from book_entries
        where kind in ('loan_repayment_in','loan_repayment_out') and voided_at is null and loan_id is not null group by loan_id
      ) r on r.loan_id = l.id
      where l.status = 'open' ${ids ? sql`and l.business_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})` : sql``}
      group by l.business_id, l.direction`),
    db
      .select({ n: count() })
      .from(bookVoiceNotes)
      .where(and(ids ? inArray(bookVoiceNotes.businessId, ids) : undefined, isNull(bookVoiceNotes.voidedAt), sql`${bookVoiceNotes.status} = 'new'`)),
    db
      .select({
        day: sql<string>`${bookEntries.entryDate}::text`,
        currency: businesses.currency,
        revenue: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in (${list(REVENUE_KINDS)})), 0)`,
        costs: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in (${list([...COST_OF_GOODS_KINDS, ...EXPENSE_KINDS])})), 0)`,
      })
      .from(bookEntries)
      .innerJoin(businesses, sql`${businesses.id} = ${bookEntries.businessId}`)
      .where(and(active, scopeBusinesses, sql`${bookEntries.entryDate} >= ${trendStart.toISOString().slice(0, 10)}`))
      .groupBy(sql`1`, businesses.currency),
  ]);

  if (perBusiness.length === 0 && n(voice?.n) === 0) return null;

  // Money in different currencies is never added together: the totals and the chart use the currency with the most entries.
  const entriesBy = new Map<string, number>();
  for (const b of perBusiness) entriesBy.set(b.currency, (entriesBy.get(b.currency) ?? 0) + n(b.entries));
  const mainCurrency = [...entriesBy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "SLE";
  const currencyOf = new Map(perBusiness.map((b) => [b.id, b.currency]));
  const inMain = (businessId: string) => currencyOf.get(businessId) === mainCurrency;

  const rows = perBusiness
    .map((b) => ({ id: b.id, name: b.name, currency: b.currency, revenueMinor: n(b.revenue), costsMinor: n(b.costs), profitMinor: n(b.revenue) - n(b.costs), entries: n(b.entries) }))
    .sort((a, b) => b.entries - a.entries);
  const main = rows.filter((r) => r.currency === mainCurrency);

  const loanRows = loans.rows.filter((l) => inMain(l.business_id));
  const sumLoans = (direction: string) => loanRows.filter((l) => l.direction === direction).reduce((s, l) => s + n(l.balance), 0);

  const byDay = new Map<string, { revenue: number; costs: number }>();
  for (const r of trendRows.filter((t) => t.currency === mainCurrency)) byDay.set(r.day, { revenue: n(r.revenue), costs: n(r.costs) });
  const trend = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(trendStart.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { date, revenueMinor: byDay.get(date)?.revenue ?? 0, costsMinor: byDay.get(date)?.costs ?? 0 };
  });

  return {
    currency: mainCurrency,
    businesses: rows.length,
    monthRevenueMinor: main.reduce((s, r) => s + r.revenueMinor, 0),
    monthCostsMinor: main.reduce((s, r) => s + r.costsMinor, 0),
    monthProfitMinor: main.reduce((s, r) => s + r.profitMinor, 0),
    owedToYouMinor: unpaid.filter((u) => inMain(u.businessId)).reduce((s, u) => s + n(u.owedToYou), 0) + sumLoans("lent"),
    youOweMinor: unpaid.filter((u) => inMain(u.businessId)).reduce((s, u) => s + n(u.youOwe), 0) + sumLoans("borrowed"),
    openLoans: loanRows.reduce((s, l) => s + n(l.open), 0),
    overdueLoans: loanRows.reduce((s, l) => s + n(l.overdue), 0),
    newVoiceNotes: n(voice?.n),
    trend,
    top: rows.slice(0, 5),
  };
}

