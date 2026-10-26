import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contributionEvents, contributionFields, contributionPayments, contributionRecords, contributionWithdrawals, contributions } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import type { AuthenticatedUser } from "../users/types.js";
import { cellStatus, currentMonth, monthIndex, monthsDue, yearRange, type YearMonth } from "./rules.js";
import type { ContributionInput, ContributionUpdate, PaymentInput, RecordInput, RecordUpdate, WithdrawalInput, WithdrawalUpdate } from "./schemas.js";

/** Contributions are private to the person who keeps them. */
export type Actor = Pick<AuthenticatedUser, "id" | "tenantId">;
type ContributionRow = typeof contributions.$inferSelect;
type RecordRow = typeof contributionRecords.$inferSelect;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const MAX_ROWS = 5000;
const MAX_CONTRIBUTIONS = 200;

async function log(contributionId: string, type: string, summary: string, detail: Record<string, unknown> = {}) {
  await db.insert(contributionEvents).values({ contributionId, type, summary, detail });
}

/** The contribution, only if it is the actor's and has not been removed. */
async function owned(actor: Actor, id: string): Promise<ContributionRow> {
  const [row] = await db
    .select()
    .from(contributions)
    .where(and(eq(contributions.id, id), eq(contributions.ownerId, actor.id), isNull(contributions.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound("We couldn't find that contribution. It may have been removed.");
  return row;
}

function openForChanges(row: ContributionRow) {
  if (row.status === "closed") throw AppError.conflict("This contribution is closed. Reopen it to make changes.");
}

const startOf = (row: ContributionRow): YearMonth => ({ year: row.startYear ?? currentMonth().year, month: row.startMonth ?? 1 });

async function fieldsOf(contributionId: string) {
  return db
    .select({ id: contributionFields.id, label: contributionFields.label, orderIndex: contributionFields.orderIndex })
    .from(contributionFields)
    .where(and(eq(contributionFields.contributionId, contributionId), isNull(contributionFields.deletedAt)))
    .orderBy(asc(contributionFields.orderIndex), asc(contributionFields.createdAt));
}

/** Keeps only answers for columns that exist, so nothing unknown is ever stored. */
async function cleanValues(contributionId: string, values: Record<string, string>) {
  const fields = await fieldsOf(contributionId);
  const known = new Set(fields.map((f) => f.id));
  const bad = Object.keys(values).find((id) => !known.has(id));
  if (bad) throw AppError.validation("One of the columns no longer exists. Refresh the page and try again.");
  const cleaned: Record<string, string> = {};
  for (const [id, value] of Object.entries(values)) if (value !== "") cleaned[id] = value;
  return cleaned;
}

/** Money in, money taken out, and what is left, for contributions. */
async function totalsFor(rows: ContributionRow[]) {
  const ids = rows.map((r) => r.id);
  const result = new Map<string, { collectedMinor: number; takenMinor: number; recordCount: number }>();
  for (const id of ids) result.set(id, { collectedMinor: 0, takenMinor: 0, recordCount: 0 });
  if (ids.length === 0) return result;
  const [oneTime, paid, taken, counts] = await Promise.all([
    db
      .select({ id: contributionRecords.contributionId, total: sql<string>`coalesce(sum(${contributionRecords.amountMinor}), 0)` })
      .from(contributionRecords)
      .where(and(inArray(contributionRecords.contributionId, ids), isNull(contributionRecords.deletedAt)))
      .groupBy(contributionRecords.contributionId),
    db
      .select({ id: contributionPayments.contributionId, total: sql<string>`coalesce(sum(${contributionPayments.amountMinor}), 0)` })
      .from(contributionPayments)
      .innerJoin(contributionRecords, eq(contributionRecords.id, contributionPayments.recordId))
      .where(and(inArray(contributionPayments.contributionId, ids), isNull(contributionRecords.deletedAt)))
      .groupBy(contributionPayments.contributionId),
    db
      .select({ id: contributionWithdrawals.contributionId, total: sql<string>`coalesce(sum(${contributionWithdrawals.amountMinor}), 0)` })
      .from(contributionWithdrawals)
      .where(and(inArray(contributionWithdrawals.contributionId, ids), isNull(contributionWithdrawals.deletedAt)))
      .groupBy(contributionWithdrawals.contributionId),
    db
      .select({ id: contributionRecords.contributionId, n: sql<number>`count(*)::int` })
      .from(contributionRecords)
      .where(and(inArray(contributionRecords.contributionId, ids), isNull(contributionRecords.deletedAt)))
      .groupBy(contributionRecords.contributionId),
  ]);
  for (const r of oneTime) result.get(r.id)!.collectedMinor += num(r.total);
  for (const r of paid) result.get(r.id)!.collectedMinor += num(r.total);
  for (const r of taken) result.get(r.id)!.takenMinor = num(r.total);
  for (const r of counts) result.get(r.id)!.recordCount = r.n;
  return result;
}

const present = (row: ContributionRow, totals: { collectedMinor: number; takenMinor: number; recordCount: number }) => ({
  id: row.id,
  name: row.name,
  purpose: row.purpose,
  kind: row.kind as "one_time" | "recurring",
  status: row.status as "active" | "closed",
  startYear: row.startYear,
  startMonth: row.startMonth,
  expectedMonthlyMinor: row.expectedMonthlyMinor,
  collectedMinor: totals.collectedMinor,
  takenMinor: totals.takenMinor,
  balanceMinor: totals.collectedMinor - totals.takenMinor,
  recordCount: totals.recordCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

async function one(row: ContributionRow) {
  const totals = (await totalsFor([row])).get(row.id)!;
  return present(row, totals);
}

export const contributionsService = {
  async list(actor: Actor) {
    const rows = await db
      .select()
      .from(contributions)
      .where(and(eq(contributions.ownerId, actor.id), isNull(contributions.deletedAt)))
      .orderBy(desc(contributions.createdAt))
      .limit(MAX_CONTRIBUTIONS);
    const totals = await totalsFor(rows);
    const items = rows.map((r) => present(r, totals.get(r.id)!));
    return {
      items,
      totals: {
        collectedMinor: items.reduce((s, i) => s + i.collectedMinor, 0),
        takenMinor: items.reduce((s, i) => s + i.takenMinor, 0),
        balanceMinor: items.reduce((s, i) => s + i.balanceMinor, 0),
      },
    };
  },

  async create(actor: Actor, input: ContributionInput) {
    const [counted] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(contributions)
      .where(and(eq(contributions.ownerId, actor.id), isNull(contributions.deletedAt)));
    if (counted!.n >= MAX_CONTRIBUTIONS) throw AppError.conflict(`You can keep up to ${MAX_CONTRIBUTIONS} contributions. Remove one you no longer need first.`);
    const recurring = input.kind === "recurring";
    const now = currentMonth();
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contributions)
        .values({
          ownerId: actor.id,
          tenantId: actor.tenantId,
          name: input.name,
          purpose: input.purpose,
          kind: input.kind,
          startYear: recurring ? (input.startYear ?? now.year) : null,
          startMonth: recurring ? (input.startMonth ?? now.month) : null,
          expectedMonthlyMinor: recurring ? (input.expectedMonthlyMinor ?? null) : null,
        })
        .returning();
      await tx.insert(contributionFields).values(input.fields.map((label, index) => ({ contributionId: row!.id, label, orderIndex: index })));
      await tx.insert(contributionEvents).values({
        contributionId: row!.id,
        type: "created",
        summary: `Created the ${recurring ? "recurring" : "one-time"} contribution "${input.name}"`,
        detail: { fields: input.fields },
      });
      return row!;
    });
    return one(created);
  },

  async get(actor: Actor, id: string) {
    const row = await owned(actor, id);
    return { ...(await one(row)), fields: await fieldsOf(id) };
  },

  async update(actor: Actor, id: string, input: ContributionUpdate) {
    const row = await owned(actor, id);
    const patch: Partial<typeof contributions.$inferInsert> = { updatedAt: new Date() };
    const changes: string[] = [];
    if (input.name !== undefined && input.name !== row.name) (patch.name = input.name), changes.push("name");
    if (input.purpose !== undefined && input.purpose !== row.purpose) (patch.purpose = input.purpose), changes.push("purpose");
    if (input.status !== undefined && input.status !== row.status) (patch.status = input.status), changes.push(input.status === "closed" ? "closed it" : "reopened it");
    if (input.expectedMonthlyMinor !== undefined) {
      if (row.kind !== "recurring") throw AppError.validation("Only a recurring contribution has a monthly amount.");
      if (input.expectedMonthlyMinor !== row.expectedMonthlyMinor) (patch.expectedMonthlyMinor = input.expectedMonthlyMinor), changes.push("monthly amount");
    }
    if (changes.length === 0) return one(row);
    const [updated] = await db.update(contributions).set(patch).where(eq(contributions.id, id)).returning();
    await log(id, "updated", `Changed: ${changes.join(", ")}`, { before: { name: row.name, purpose: row.purpose, status: row.status, expectedMonthlyMinor: row.expectedMonthlyMinor }, after: input });
    return one(updated!);
  },

  async remove(actor: Actor, id: string) {
    const row = await owned(actor, id);
    await db.update(contributions).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(contributions.id, id));
    await log(id, "removed", `Removed the contribution "${row.name}"`);
  },

  // ------------------------------------------------------------------ columns
  async addField(actor: Actor, id: string, label: string) {
    const row = await owned(actor, id);
    openForChanges(row);
    const fields = await fieldsOf(id);
    if (fields.length >= 20) throw AppError.validation("A contribution can have at most 20 columns.");
    if (fields.some((f) => f.label.toLowerCase() === label.toLowerCase()) || label.toLowerCase() === "amount") throw AppError.validation(`There is already a column called "${label}".`, { field: "label" });
    const [field] = await db.insert(contributionFields).values({ contributionId: id, label, orderIndex: (fields.at(-1)?.orderIndex ?? -1) + 1 }).returning();
    await log(id, "field_added", `Added the column "${label}"`);
    return { id: field!.id, label: field!.label, orderIndex: field!.orderIndex };
  },

  async renameField(actor: Actor, id: string, fieldId: string, label: string) {
    const row = await owned(actor, id);
    openForChanges(row);
    const fields = await fieldsOf(id);
    const current = fields.find((f) => f.id === fieldId);
    if (!current) throw AppError.notFound("We couldn't find that column.");
    if (fields.some((f) => f.id !== fieldId && f.label.toLowerCase() === label.toLowerCase()) || label.toLowerCase() === "amount") throw AppError.validation(`There is already a column called "${label}".`, { field: "label" });
    await db.update(contributionFields).set({ label }).where(eq(contributionFields.id, fieldId));
    await log(id, "field_renamed", `Renamed the column "${current.label}" to "${label}"`);
    return { ...current, label };
  },

  async removeField(actor: Actor, id: string, fieldId: string) {
    const row = await owned(actor, id);
    openForChanges(row);
    const fields = await fieldsOf(id);
    const current = fields.find((f) => f.id === fieldId);
    if (!current) throw AppError.notFound("We couldn't find that column.");
    if (fields.length <= 1) throw AppError.validation("A contribution needs at least one column.");
    await db.update(contributionFields).set({ deletedAt: new Date() }).where(eq(contributionFields.id, fieldId));
    await log(id, "field_removed", `Removed the column "${current.label}"`);
  },

  // ------------------------------------------------------------------ rows (one-time) / contributors (recurring)
  async listRecords(actor: Actor, id: string) {
    const row = await owned(actor, id);
    const records = await db
      .select()
      .from(contributionRecords)
      .where(and(eq(contributionRecords.contributionId, id), isNull(contributionRecords.deletedAt)))
      .orderBy(asc(contributionRecords.createdAt))
      .limit(MAX_ROWS);
    let paidByRecord = new Map<string, { total: number; months: number; last: Date | null }>();
    if (row.kind === "recurring" && records.length > 0) {
      const sums = await db
        .select({
          recordId: contributionPayments.recordId,
          total: sql<string>`coalesce(sum(${contributionPayments.amountMinor}), 0)`,
          months: sql<number>`count(*)::int`,
          last: sql<Date | null>`max(${contributionPayments.updatedAt})`,
        })
        .from(contributionPayments)
        .where(eq(contributionPayments.contributionId, id))
        .groupBy(contributionPayments.recordId);
      paidByRecord = new Map(sums.map((s) => [s.recordId, { total: num(s.total), months: s.months, last: s.last ? new Date(s.last) : null }]));
    }
    const now = currentMonth();
    const items = records.map((r) => {
      const paid = paidByRecord.get(r.id);
      const start: YearMonth = { year: r.startYear ?? startOf(row).year, month: r.startMonth ?? startOf(row).month };
      return {
        id: r.id,
        values: r.values,
        amountMinor: row.kind === "one_time" ? r.amountMinor : (paid?.total ?? 0),
        startYear: row.kind === "recurring" ? start.year : null,
        startMonth: row.kind === "recurring" ? start.month : null,
        monthsPaid: paid?.months ?? 0,
        monthsDue: row.kind === "recurring" ? monthsDue(start, now) : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });
    return { items, totalMinor: items.reduce((s, i) => s + (i.amountMinor ?? 0), 0), fields: await fieldsOf(id) };
  },

  async addRecord(actor: Actor, id: string, input: RecordInput) {
    const row = await owned(actor, id);
    openForChanges(row);
    const [counted] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(contributionRecords)
      .where(and(eq(contributionRecords.contributionId, id), isNull(contributionRecords.deletedAt)));
    if (counted!.n >= MAX_ROWS) throw AppError.conflict(`A contribution can hold up to ${MAX_ROWS} rows.`);
    const values = await cleanValues(id, input.values);
    if (Object.keys(values).length === 0) throw AppError.validation("Fill in at least one column before saving the row.", { field: "values" });
    if (row.kind === "one_time" && input.amountMinor === undefined) throw AppError.validation("Enter the amount for this row.", { field: "amountMinor" });
    const [rec] = await db
      .insert(contributionRecords)
      .values({
        contributionId: id,
        values,
        amountMinor: row.kind === "one_time" ? input.amountMinor! : null,
        startYear: row.kind === "recurring" ? (input.startYear ?? row.startYear) : null,
        startMonth: row.kind === "recurring" ? (input.startMonth ?? row.startMonth) : null,
      })
      .returning();
    await log(id, "record_added", row.kind === "one_time" ? `Added a row of ${input.amountMinor! / 100}` : "Added a contributor", { recordId: rec!.id, values, amountMinor: rec!.amountMinor });
    return rec!;
  },

  async updateRecord(actor: Actor, id: string, recordId: string, input: RecordUpdate) {
    const row = await owned(actor, id);
    openForChanges(row);
    const rec = await findRecord(id, recordId);
    const patch: Partial<typeof contributionRecords.$inferInsert> = { updatedAt: new Date() };
    if (input.values !== undefined) {
      const values = await cleanValues(id, input.values);
      if (Object.keys(values).length === 0) throw AppError.validation("Fill in at least one column.", { field: "values" });
      patch.values = values;
    }
    if (input.amountMinor !== undefined) {
      if (row.kind !== "one_time") throw AppError.validation("A recurring contributor's money is recorded month by month.");
      patch.amountMinor = input.amountMinor;
    }
    if (row.kind === "recurring") {
      if (input.startYear !== undefined) patch.startYear = input.startYear;
      if (input.startMonth !== undefined) patch.startMonth = input.startMonth;
    }
    const [updated] = await db.update(contributionRecords).set(patch).where(eq(contributionRecords.id, recordId)).returning();
    await log(id, "record_updated", row.kind === "one_time" ? "Changed a row" : "Changed a contributor", {
      recordId,
      before: { values: rec.values, amountMinor: rec.amountMinor, startYear: rec.startYear, startMonth: rec.startMonth },
      after: { values: updated!.values, amountMinor: updated!.amountMinor, startYear: updated!.startYear, startMonth: updated!.startMonth },
    });
    return updated!;
  },

  async removeRecord(actor: Actor, id: string, recordId: string) {
    const row = await owned(actor, id);
    openForChanges(row);
    const rec = await findRecord(id, recordId);
    await db.update(contributionRecords).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(contributionRecords.id, recordId));
    await log(id, "record_removed", row.kind === "one_time" ? "Removed a row" : "Removed a contributor", { recordId, values: rec.values, amountMinor: rec.amountMinor });
  },

  // ------------------------------------------------------------------ recurring: payments by month
  async setPayment(actor: Actor, id: string, recordId: string, input: PaymentInput) {
    const row = await owned(actor, id);
    openForChanges(row);
    if (row.kind !== "recurring") throw AppError.validation("Only a recurring contribution is tracked by month.");
    await findRecord(id, recordId);
    const [existing] = await db
      .select()
      .from(contributionPayments)
      .where(and(eq(contributionPayments.recordId, recordId), eq(contributionPayments.year, input.year), eq(contributionPayments.month, input.month)))
      .limit(1);
    const now = new Date();
    const [saved] = existing
      ? await db.update(contributionPayments).set({ amountMinor: input.amountMinor, updatedAt: now }).where(eq(contributionPayments.id, existing.id)).returning()
      : await db.insert(contributionPayments).values({ contributionId: id, recordId, year: input.year, month: input.month, amountMinor: input.amountMinor }).returning();
    await db.update(contributionRecords).set({ updatedAt: now }).where(eq(contributionRecords.id, recordId));
    await log(id, existing ? "payment_updated" : "payment_added", `${existing ? "Changed" : "Recorded"} a payment for ${input.month}/${input.year}`, {
      recordId,
      year: input.year,
      month: input.month,
      before: existing?.amountMinor ?? null,
      after: input.amountMinor,
    });
    return saved!;
  },

  async removePayment(actor: Actor, id: string, recordId: string, year: number, month: number) {
    const row = await owned(actor, id);
    openForChanges(row);
    await findRecord(id, recordId);
    const [existing] = await db
      .select()
      .from(contributionPayments)
      .where(and(eq(contributionPayments.recordId, recordId), eq(contributionPayments.year, year), eq(contributionPayments.month, month)))
      .limit(1);
    if (!existing) throw AppError.notFound("There is no payment recorded for that month.");
    await db.delete(contributionPayments).where(eq(contributionPayments.id, existing.id));
    await db.update(contributionRecords).set({ updatedAt: new Date() }).where(eq(contributionRecords.id, recordId));
    await log(id, "payment_removed", `Removed the payment for ${month}/${year}`, { recordId, year, month, before: existing.amountMinor });
  },

  /** One year as a grid: every contributor against twelve months, with who paid, who did not, and the totals. */
  async tracker(actor: Actor, id: string, yearInput?: number) {
    const row = await owned(actor, id);
    if (row.kind !== "recurring") throw AppError.validation("Only a recurring contribution is tracked by month.");
    const now = currentMonth();
    const start = startOf(row);
    const year = yearInput ?? Math.min(Math.max(now.year, start.year), now.year);
    const records = await db
      .select()
      .from(contributionRecords)
      .where(and(eq(contributionRecords.contributionId, id), isNull(contributionRecords.deletedAt)))
      .orderBy(asc(contributionRecords.createdAt))
      .limit(MAX_ROWS);
    const payments = await db
      .select()
      .from(contributionPayments)
      .where(and(eq(contributionPayments.contributionId, id), eq(contributionPayments.year, year)));
    const paymentOf = new Map(payments.map((p) => [`${p.recordId}:${p.month}`, p]));
    const expected = row.expectedMonthlyMinor;
    const monthTotals = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, collectedMinor: 0, paidCount: 0, unpaidCount: 0, partialCount: 0, expectedMinor: 0 }));

    const members = records.map((r) => {
      const memberStart: YearMonth = { year: r.startYear ?? start.year, month: r.startMonth ?? start.month };
      let paidMonths = 0;
      let unpaidMonths = 0;
      let totalMinor = 0;
      const cells = monthTotals.map((totals) => {
        const payment = paymentOf.get(`${r.id}:${totals.month}`);
        const status = cellStatus({ start: memberStart, cell: { year, month: totals.month }, now, paidMinor: payment ? payment.amountMinor : null, expectedMinor: expected });
        if (payment) {
          totals.collectedMinor += payment.amountMinor;
          totalMinor += payment.amountMinor;
          paidMonths += 1;
          if (status === "partial") totals.partialCount += 1;
          else totals.paidCount += 1;
        }
        if (status === "unpaid") {
          totals.unpaidCount += 1;
          unpaidMonths += 1;
        }
        if (expected !== null && (status === "paid" || status === "partial" || status === "unpaid" || status === "upcoming")) totals.expectedMinor += expected;
        return { month: totals.month, status, amountMinor: payment?.amountMinor ?? null, recordedAt: payment?.createdAt ?? null, updatedAt: payment?.updatedAt ?? null };
      });
      return { id: r.id, values: r.values, startYear: memberStart.year, startMonth: memberStart.month, cells, paidMonths, unpaidMonths, totalMinor };
    });

    return {
      year,
      years: yearRange(Math.min(start.year, year), Math.max(now.year, year)),
      expectedMonthlyMinor: expected,
      fields: await fieldsOf(id),
      members,
      monthTotals,
      yearTotalMinor: monthTotals.reduce((s, m) => s + m.collectedMinor, 0),
      unpaidCount: members.reduce((s, m) => s + m.unpaidMonths, 0),
      currentMonth: now,
    };
  },

  /** The whole life of a recurring contribution, year by year, and who is behind right now. */
  async summary(actor: Actor, id: string) {
    const row = await owned(actor, id);
    const base = await one(row);
    if (row.kind !== "recurring") return { ...base, years: [], behind: [], bestMonth: null };
    const now = currentMonth();
    const start = startOf(row);
    const perYear = await db
      .select({
        year: contributionPayments.year,
        total: sql<string>`coalesce(sum(${contributionPayments.amountMinor}), 0)`,
        payments: sql<number>`count(*)::int`,
        contributors: sql<number>`count(distinct ${contributionPayments.recordId})::int`,
      })
      .from(contributionPayments)
      .innerJoin(contributionRecords, eq(contributionRecords.id, contributionPayments.recordId))
      .where(and(eq(contributionPayments.contributionId, id), isNull(contributionRecords.deletedAt)))
      .groupBy(contributionPayments.year);
    const totalByYear = new Map(perYear.map((y) => [y.year, y]));
    const firstYear = Math.min(start.year, ...perYear.map((y) => y.year));
    const years = yearRange(firstYear, Math.max(now.year, ...perYear.map((y) => y.year))).map((year) => ({
      year,
      collectedMinor: num(totalByYear.get(year)?.total),
      payments: totalByYear.get(year)?.payments ?? 0,
      contributors: totalByYear.get(year)?.contributors ?? 0,
    }));

    const records = await db
      .select()
      .from(contributionRecords)
      .where(and(eq(contributionRecords.contributionId, id), isNull(contributionRecords.deletedAt)))
      .limit(MAX_ROWS);
    const allPayments = await db.select({ recordId: contributionPayments.recordId, year: contributionPayments.year, month: contributionPayments.month }).from(contributionPayments).where(eq(contributionPayments.contributionId, id));
    const paidSet = new Set(allPayments.map((p) => `${p.recordId}:${p.year}:${p.month}`));
    const behind = records
      .map((r) => {
        const s: YearMonth = { year: r.startYear ?? start.year, month: r.startMonth ?? start.month };
        let missing = 0;
        for (let i = monthIndex(s); i <= monthIndex(now); i++) {
          const y = Math.floor(i / 12);
          const m = (i % 12) + 1;
          if (!paidSet.has(`${r.id}:${y}:${m}`)) missing += 1;
        }
        return { id: r.id, values: r.values, missingMonths: missing };
      })
      .filter((r) => r.missingMonths > 0)
      .sort((a, b) => b.missingMonths - a.missingMonths)
      .slice(0, 50);

    const best = await db
      .select({ year: contributionPayments.year, month: contributionPayments.month, total: sql<string>`sum(${contributionPayments.amountMinor})` })
      .from(contributionPayments)
      .where(eq(contributionPayments.contributionId, id))
      .groupBy(contributionPayments.year, contributionPayments.month)
      .orderBy(desc(sql`sum(${contributionPayments.amountMinor})`))
      .limit(1);
    return { ...base, years, behind, bestMonth: best[0] ? { year: best[0].year, month: best[0].month, collectedMinor: num(best[0].total) } : null };
  },

  // ------------------------------------------------------------------ money taken out
  async listWithdrawals(actor: Actor, id: string) {
    await owned(actor, id);
    const rows = await db
      .select()
      .from(contributionWithdrawals)
      .where(and(eq(contributionWithdrawals.contributionId, id), isNull(contributionWithdrawals.deletedAt)))
      .orderBy(desc(contributionWithdrawals.takenAt), desc(contributionWithdrawals.createdAt));
    // Oldest first so each row can show how much had been taken up to and including it.
    let running = 0;
    const withRunning = [...rows].reverse().map((w) => ({ w, cumulativeMinor: (running += w.amountMinor) }));
    const cumulative = new Map(withRunning.map((x) => [x.w.id, x.cumulativeMinor]));
    return {
      items: rows.map((w) => ({ id: w.id, amountMinor: w.amountMinor, note: w.note, takenAt: w.takenAt, cumulativeMinor: cumulative.get(w.id)!, createdAt: w.createdAt, updatedAt: w.updatedAt })),
      totalTakenMinor: running,
    };
  },

  async addWithdrawal(actor: Actor, id: string, input: WithdrawalInput) {
    const row = await owned(actor, id);
    openForChanges(row);
    const [saved] = await db.insert(contributionWithdrawals).values({ contributionId: id, amountMinor: input.amountMinor, note: input.note, takenAt: input.takenAt ?? new Date() }).returning();
    await log(id, "withdrawal_added", `Recorded ${input.amountMinor / 100} taken out`, { withdrawalId: saved!.id, note: input.note, amountMinor: input.amountMinor });
    const totals = (await totalsFor([row])).get(id)!;
    return { withdrawal: saved!, balanceMinor: totals.collectedMinor - totals.takenMinor };
  },

  async updateWithdrawal(actor: Actor, id: string, withdrawalId: string, input: WithdrawalUpdate) {
    const row = await owned(actor, id);
    openForChanges(row);
    const [existing] = await db
      .select()
      .from(contributionWithdrawals)
      .where(and(eq(contributionWithdrawals.id, withdrawalId), eq(contributionWithdrawals.contributionId, id), isNull(contributionWithdrawals.deletedAt)))
      .limit(1);
    if (!existing) throw AppError.notFound("We couldn't find that entry.");
    const [saved] = await db
      .update(contributionWithdrawals)
      .set({ ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}), ...(input.note !== undefined ? { note: input.note } : {}), ...(input.takenAt !== undefined ? { takenAt: input.takenAt } : {}), updatedAt: new Date() })
      .where(eq(contributionWithdrawals.id, withdrawalId))
      .returning();
    await log(id, "withdrawal_updated", "Changed an amount taken out", { withdrawalId, before: { amountMinor: existing.amountMinor, note: existing.note, takenAt: existing.takenAt }, after: { amountMinor: saved!.amountMinor, note: saved!.note, takenAt: saved!.takenAt } });
    return saved!;
  },

  async removeWithdrawal(actor: Actor, id: string, withdrawalId: string) {
    const row = await owned(actor, id);
    openForChanges(row);
    const [existing] = await db
      .select()
      .from(contributionWithdrawals)
      .where(and(eq(contributionWithdrawals.id, withdrawalId), eq(contributionWithdrawals.contributionId, id), isNull(contributionWithdrawals.deletedAt)))
      .limit(1);
    if (!existing) throw AppError.notFound("We couldn't find that entry.");
    await db.update(contributionWithdrawals).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(contributionWithdrawals.id, withdrawalId));
    await log(id, "withdrawal_removed", "Removed an amount taken out", { withdrawalId, amountMinor: existing.amountMinor, note: existing.note });
  },

  async activity(actor: Actor, id: string) {
    await owned(actor, id);
    return db.select().from(contributionEvents).where(eq(contributionEvents.contributionId, id)).orderBy(desc(contributionEvents.createdAt)).limit(500);
  },

  /** Everything for an export: the table (one-time rows, or the year's grid for a recurring one), and money taken out. */
  async exportData(actor: Actor, id: string, year?: number) {
    const row = await owned(actor, id);
    const fields = await fieldsOf(id);
    const withdrawals = await this.listWithdrawals(actor, id);
    if (row.kind === "one_time") {
      const records = await this.listRecords(actor, id);
      return { row, fields, records: records.items, tracker: null, withdrawals };
    }
    return { row, fields, records: [], tracker: await this.tracker(actor, id, year), withdrawals };
  },
};

async function findRecord(contributionId: string, recordId: string): Promise<RecordRow> {
  const [rec] = await db
    .select()
    .from(contributionRecords)
    .where(and(eq(contributionRecords.id, recordId), eq(contributionRecords.contributionId, contributionId), isNull(contributionRecords.deletedAt)))
    .limit(1);
  if (!rec) throw AppError.notFound("We couldn't find that row. It may have been removed.");
  return rec;
}
