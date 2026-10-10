import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { bookEntries, bookVoiceNotes } from "../../db/schema/index.js";
import { COST_OF_GOODS_KINDS, EXPENSE_KINDS, KIND_LABEL, REVENUE_KINDS, isMoneyIn, todayString, type EntryKind } from "./rules.js";
import { listLoans } from "./service.js";

const n = (value: unknown) => Number(value ?? 0);
const list = (kinds: readonly string[]) => sql.join(kinds.map((k) => sql`${k}`), sql`, `);
const MONEY_IN_KINDS = ["sale", "other_income", "loan_in", "loan_repayment_in", "owner_in"] as const;

export interface Period {
  from: string;
  to: string;
}

/** This month so far, unless asked for something else. */
export function resolvePeriod(from?: string, to?: string, now = new Date()): Period {
  const today = todayString(now);
  return { from: from ?? `${today.slice(0, 8)}01`, to: to ?? today };
}

const byDay = (rows: { day: string; value: unknown }[], start: Date, days: number) => {
  const map = new Map(rows.map((r) => [r.day, n(r.value)]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { date, amountMinor: map.get(date) ?? 0 };
  });
};

/** The profit and loss for a period: what came in as sales, what stock and expenses cost, and what was left. */
export async function profitAndLoss(businessId: string, period: Period) {
  const active = and(eq(bookEntries.businessId, businessId), isNull(bookEntries.voidedAt), sql`${bookEntries.entryDate} between ${period.from} and ${period.to}`);
  const [byCategory, monthly] = await Promise.all([
    db
      .select({ kind: bookEntries.kind, category: bookEntries.category, total: sql<string>`sum(${bookEntries.amountMinor})`, count: sql<number>`count(*)::int` })
      .from(bookEntries)
      .where(and(active, inArray(bookEntries.kind, [...REVENUE_KINDS, ...COST_OF_GOODS_KINDS, ...EXPENSE_KINDS])))
      .groupBy(bookEntries.kind, bookEntries.category)
      .orderBy(desc(sql`sum(${bookEntries.amountMinor})`)),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${bookEntries.entryDate}::timestamp), 'YYYY-MM')`,
        revenue: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in (${list(REVENUE_KINDS)})), 0)`,
        costs: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in (${list([...COST_OF_GOODS_KINDS, ...EXPENSE_KINDS])})), 0)`,
      })
      .from(bookEntries)
      .where(and(active, inArray(bookEntries.kind, [...REVENUE_KINDS, ...COST_OF_GOODS_KINDS, ...EXPENSE_KINDS])))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const section = (kinds: readonly string[], fallback: string) =>
    byCategory
      .filter((r) => kinds.includes(r.kind))
      .map((r) => ({ category: r.category ?? fallback, totalMinor: n(r.total), count: r.count }))
      .reduce<{ category: string; totalMinor: number; count: number }[]>((acc, row) => {
        const found = acc.find((a) => a.category === row.category);
        if (found) {
          found.totalMinor += row.totalMinor;
          found.count += row.count;
        } else acc.push({ ...row });
        return acc;
      }, [])
      .sort((a, b) => b.totalMinor - a.totalMinor);

  const revenue = section(REVENUE_KINDS, "Sales");
  const costOfGoods = section(COST_OF_GOODS_KINDS, "Stock bought");
  const expenses = section(EXPENSE_KINDS, "Other expenses");
  const sum = (rows: { totalMinor: number }[]) => rows.reduce((total, r) => total + r.totalMinor, 0);
  const revenueMinor = sum(revenue);
  const costOfGoodsMinor = sum(costOfGoods);
  const expensesMinor = sum(expenses);
  const grossProfitMinor = revenueMinor - costOfGoodsMinor;
  return {
    period,
    revenue,
    costOfGoods,
    expenses,
    revenueMinor,
    costOfGoodsMinor,
    grossProfitMinor,
    expensesMinor,
    netProfitMinor: grossProfitMinor - expensesMinor,
    monthly: monthly.map((m) => ({ month: m.month, revenueMinor: n(m.revenue), costsMinor: n(m.costs), profitMinor: n(m.revenue) - n(m.costs) })),
  };
}

/** Money that actually moved in a period (not what was only promised): in, out, and what was there at the start and the end. */
export async function cashFlow(businessId: string, period: Period) {
  const base = and(sql`p.business_id = ${businessId}`, sql`p.voided_at is null`, sql`e.voided_at is null`);
  const [moved, opening, byMethod, monthly] = await Promise.all([
    db.execute<{ kind: string; total: string }>(sql`
      select e.kind, coalesce(sum(p.amount_minor), 0)::text as total
      from book_entry_payments p join book_entries e on e.id = p.entry_id
      where ${base} and p.paid_on between ${period.from} and ${period.to}
      group by e.kind`),
    db.execute<{ total: string }>(sql`
      select coalesce(sum(case when e.kind in (${list(MONEY_IN_KINDS)}) then p.amount_minor else -p.amount_minor end), 0)::text as total
      from book_entry_payments p join book_entries e on e.id = p.entry_id
      where ${base} and p.paid_on < ${period.from}`),
    db.execute<{ method: string; total: string }>(sql`
      select p.method, coalesce(sum(case when e.kind in (${list(MONEY_IN_KINDS)}) then p.amount_minor else -p.amount_minor end), 0)::text as total
      from book_entry_payments p join book_entries e on e.id = p.entry_id
      where ${base} and p.paid_on <= ${period.to}
      group by p.method`),
    db.execute<{ month: string; money_in: string; money_out: string }>(sql`
      select to_char(date_trunc('month', p.paid_on::timestamp), 'YYYY-MM') as month,
             coalesce(sum(p.amount_minor) filter (where e.kind in (${list(MONEY_IN_KINDS)})), 0)::text as money_in,
             coalesce(sum(p.amount_minor) filter (where e.kind not in (${list(MONEY_IN_KINDS)})), 0)::text as money_out
      from book_entry_payments p join book_entries e on e.id = p.entry_id
      where ${base} and p.paid_on between ${period.from} and ${period.to}
      group by 1 order by 1`),
  ]);
  const lines = moved.rows.map((r) => ({ kind: r.kind as EntryKind, label: KIND_LABEL[r.kind as EntryKind] ?? r.kind, moneyIn: isMoneyIn(r.kind), totalMinor: n(r.total) })).sort((a, b) => b.totalMinor - a.totalMinor);
  const moneyInMinor = lines.filter((l) => l.moneyIn).reduce((s, l) => s + l.totalMinor, 0);
  const moneyOutMinor = lines.filter((l) => !l.moneyIn).reduce((s, l) => s + l.totalMinor, 0);
  const openingMinor = n(opening.rows[0]?.total);
  return {
    period,
    openingMinor,
    moneyInMinor,
    moneyOutMinor,
    closingMinor: openingMinor + moneyInMinor - moneyOutMinor,
    lines,
    byMethod: byMethod.rows.map((r) => ({ method: r.method, balanceMinor: n(r.total) })),
    monthly: monthly.rows.map((r) => ({ month: r.month, moneyInMinor: n(r.money_in), moneyOutMinor: n(r.money_out) })),
  };
}

/** Who owes the business, and who the business owes: credit sales and purchases not yet paid, and open loans. */
export async function debts(businessId: string) {
  const unpaid = await db
    .select({
      partyName: bookEntries.partyName,
      kind: bookEntries.kind,
      owing: sql<string>`sum(${bookEntries.amountMinor} - ${bookEntries.paidMinor})`,
      count: sql<number>`count(*)::int`,
      oldest: sql<string>`min(${bookEntries.entryDate})::text`,
      phone: sql<string | null>`max(${bookEntries.partyPhone})`,
    })
    .from(bookEntries)
    .where(and(eq(bookEntries.businessId, businessId), isNull(bookEntries.voidedAt), sql`${bookEntries.paidMinor} < ${bookEntries.amountMinor}`, inArray(bookEntries.kind, ["sale", "purchase", "expense"])))
    .groupBy(bookEntries.partyName, bookEntries.kind)
    .orderBy(desc(sql`sum(${bookEntries.amountMinor} - ${bookEntries.paidMinor})`));
  const loans = await listLoans(businessId, { status: "open" });

  const owedToYou = unpaid.filter((r) => r.kind === "sale").map((r) => ({ party: r.partyName ?? "Unnamed", phone: r.phone, owingMinor: n(r.owing), count: r.count, since: r.oldest }));
  const youOwe = unpaid.filter((r) => r.kind !== "sale").map((r) => ({ party: r.partyName ?? "Unnamed", phone: r.phone, owingMinor: n(r.owing), count: r.count, since: r.oldest }));
  const lent = loans.filter((l) => l.direction === "lent" && l.balanceMinor > 0);
  const borrowed = loans.filter((l) => l.direction === "borrowed" && l.balanceMinor > 0);
  const total = (rows: { owingMinor: number }[]) => rows.reduce((s, r) => s + r.owingMinor, 0);
  return {
    owedToYou,
    youOwe,
    lentLoans: lent,
    borrowedLoans: borrowed,
    owedToYouMinor: total(owedToYou) + lent.reduce((s, l) => s + l.balanceMinor, 0),
    youOweMinor: total(youOwe) + borrowed.reduce((s, l) => s + l.balanceMinor, 0),
  };
}

/** The first screen of the books: how the month is going, cash on hand, what is owed, and what needs attention. */
export async function summary(businessId: string, period: Period) {
  const today = todayString();
  const trendStart = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000);
  const [pl, flow, owed, trendRows, [attention], [voice], loansOpen] = await Promise.all([
    profitAndLoss(businessId, period),
    cashFlow(businessId, period),
    debts(businessId),
    db
      .select({
        day: sql<string>`${bookEntries.entryDate}::text`,
        revenue: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in (${list(REVENUE_KINDS)})), 0)`,
        costs: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in (${list([...COST_OF_GOODS_KINDS, ...EXPENSE_KINDS])})), 0)`,
      })
      .from(bookEntries)
      .where(and(eq(bookEntries.businessId, businessId), isNull(bookEntries.voidedAt), sql`${bookEntries.entryDate} >= ${trendStart.toISOString().slice(0, 10)}`))
      .groupBy(sql`1`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookEntries)
      .where(and(eq(bookEntries.businessId, businessId), isNull(bookEntries.voidedAt), sql`${bookEntries.paidMinor} < ${bookEntries.amountMinor}`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookVoiceNotes)
      .where(and(eq(bookVoiceNotes.businessId, businessId), isNull(bookVoiceNotes.voidedAt), eq(bookVoiceNotes.status, "new"))),
    listLoans(businessId, { status: "open" }),
  ]);
  const cashNow = await cashFlow(businessId, { from: today, to: today });
  return {
    period,
    revenueMinor: pl.revenueMinor,
    costOfGoodsMinor: pl.costOfGoodsMinor,
    expensesMinor: pl.expensesMinor,
    profitMinor: pl.netProfitMinor,
    moneyInMinor: flow.moneyInMinor,
    moneyOutMinor: flow.moneyOutMinor,
    // Everything that has been paid in or out up to today.
    cashOnHandMinor: cashNow.closingMinor,
    cashByMethod: cashNow.byMethod,
    owedToYouMinor: owed.owedToYouMinor,
    youOweMinor: owed.youOweMinor,
    unpaidEntries: attention?.n ?? 0,
    openLoans: loansOpen.length,
    overdueLoans: loansOpen.filter((l) => l.overdue).length,
    newVoiceNotes: voice?.n ?? 0,
    topExpenses: pl.expenses.slice(0, 5),
    trend: {
      revenue: byDay(trendRows.map((r) => ({ day: r.day, value: r.revenue })), trendStart, 30),
      costs: byDay(trendRows.map((r) => ({ day: r.day, value: r.costs })), trendStart, 30),
    },
  };
}
