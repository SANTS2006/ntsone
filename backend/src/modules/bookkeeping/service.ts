import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { bookEntries, bookEntryPayments, bookLoans, bookVoiceNotes, businesses } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { buildPaginatedResult } from "../../lib/pagination.js";
import { recordAudit } from "../audit/recorder.js";
import { REVENUE_KINDS, canBeOnCredit, isMoneyIn, loanBalance, loanEntryKind, repaymentKind, todayString, type EntryKind } from "./rules.js";
import type { EntryInput, EntryUpdate, LoanInput } from "./schemas.js";

type Entry = typeof bookEntries.$inferSelect;
type Loan = typeof bookLoans.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface Actor {
  id: string;
}

const n = (value: unknown) => Number(value ?? 0);

async function businessOf(businessId: string) {
  const [business] = await db.select({ id: businesses.id, tenantId: businesses.tenantId, currency: businesses.currency, name: businesses.name }).from(businesses).where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt))).limit(1);
  if (!business) throw AppError.notFound("Business not found");
  return business;
}

export const bookSettings = async (businessId: string) => {
  const business = await businessOf(businessId);
  return { currency: business.currency, businessName: business.name };
};

const inMinors = (kinds: readonly string[]) => sql`${bookEntries.kind} in (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)})`;

// ---------------------------------------------------------------- the cash book

const view = (entry: Entry) => ({
  id: entry.id,
  kind: entry.kind as EntryKind,
  entryDate: entry.entryDate,
  amountMinor: entry.amountMinor,
  paidMinor: entry.paidMinor,
  outstandingMinor: entry.voidedAt ? 0 : Math.max(0, entry.amountMinor - entry.paidMinor),
  category: entry.category,
  description: entry.description,
  partyName: entry.partyName,
  partyPhone: entry.partyPhone,
  paymentMethod: entry.paymentMethod,
  reference: entry.reference,
  loanId: entry.loanId,
  voiceNoteId: entry.voiceNoteId,
  moneyIn: isMoneyIn(entry.kind),
  voided: Boolean(entry.voidedAt),
  voidedAt: entry.voidedAt,
  voidReason: entry.voidReason,
  createdAt: entry.createdAt,
});

async function insertPayment(tx: Tx, entry: Pick<Entry, "id" | "businessId">, input: { amountMinor: number; paidOn: string; method: string; note?: string | null }, actorId: string) {
  await tx.insert(bookEntryPayments).values({ entryId: entry.id, businessId: entry.businessId, amountMinor: input.amountMinor, paidOn: input.paidOn, method: input.method, note: input.note ?? null, createdBy: actorId });
}

async function claimVoiceNote(tx: Tx, businessId: string, voiceNoteId: string | undefined, entryId: string) {
  if (!voiceNoteId) return;
  const updated = await tx
    .update(bookVoiceNotes)
    .set({ status: "done", entryId })
    .where(and(eq(bookVoiceNotes.id, voiceNoteId), eq(bookVoiceNotes.businessId, businessId), isNull(bookVoiceNotes.voidedAt), isNull(bookVoiceNotes.entryId)))
    .returning({ id: bookVoiceNotes.id });
  if (updated.length === 0) throw AppError.conflict("That voice note was already used or doesn't belong to this business.");
}

export async function createEntry(actor: Actor, businessId: string, input: EntryInput) {
  const business = await businessOf(businessId);
  const paid = input.paidMinor ?? input.amountMinor;
  const entry = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(bookEntries)
      .values({
        businessId,
        tenantId: business.tenantId,
        kind: input.kind,
        entryDate: input.entryDate,
        amountMinor: input.amountMinor,
        paidMinor: paid,
        category: input.category ?? null,
        description: input.description ?? null,
        partyName: input.partyName ?? null,
        partyPhone: input.partyPhone ?? null,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        voiceNoteId: input.voiceNoteId ?? null,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    if (paid > 0) await insertPayment(tx, row!, { amountMinor: paid, paidOn: input.entryDate, method: input.paymentMethod }, actor.id);
    await claimVoiceNote(tx, businessId, input.voiceNoteId, row!.id);
    return row!;
  });
  await recordAudit({ actorUserId: actor.id, tenantId: business.tenantId, action: "book.entry_add", label: "Wrote an entry in the books", entityType: "book_entry", entityId: entry.id, metadata: { businessId, kind: entry.kind, amountMinor: entry.amountMinor, paidMinor: entry.paidMinor, onCredit: paid < input.amountMinor } });
  return view(entry);
}

function periodConditions(from?: string, to?: string): SQL[] {
  const conditions: SQL[] = [];
  if (from) conditions.push(gte(bookEntries.entryDate, from));
  if (to) conditions.push(lte(bookEntries.entryDate, to));
  return conditions;
}

export interface EntriesQuery {
  from?: string;
  to?: string;
  kind?: string;
  search?: string;
  category?: string;
  status: "active" | "voided" | "all";
  unpaid?: "true" | "false";
  page: number;
  pageSize: number;
}

function entriesWhere(businessId: string, query: Omit<EntriesQuery, "page" | "pageSize">) {
  const conditions: SQL[] = [eq(bookEntries.businessId, businessId), ...periodConditions(query.from, query.to)];
  if (query.kind) conditions.push(eq(bookEntries.kind, query.kind));
  if (query.category) conditions.push(eq(bookEntries.category, query.category));
  if (query.status === "active") conditions.push(isNull(bookEntries.voidedAt));
  if (query.status === "voided") conditions.push(sql`${bookEntries.voidedAt} is not null`);
  if (query.unpaid === "true") conditions.push(sql`${bookEntries.paidMinor} < ${bookEntries.amountMinor}`, isNull(bookEntries.voidedAt));
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(or(ilike(bookEntries.description, term), ilike(bookEntries.partyName, term), ilike(bookEntries.category, term), ilike(bookEntries.reference, term), ilike(bookEntries.partyPhone, term))!);
  }
  return and(...conditions);
}

export async function listEntries(businessId: string, query: EntriesQuery) {
  const where = entriesWhere(businessId, query);
  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(bookEntries)
      .where(where)
      .orderBy(desc(bookEntries.entryDate), desc(bookEntries.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({
        n: sql<number>`count(*)::int`,
        // What is on this page of the filter: money in, money out (by amount, not by what was paid yet).
        moneyIn: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in ('sale','other_income','loan_in','loan_repayment_in','owner_in') and ${bookEntries.voidedAt} is null), 0)`,
        moneyOut: sql<string>`coalesce(sum(${bookEntries.amountMinor}) filter (where ${bookEntries.kind} in ('purchase','expense','loan_out','loan_repayment_out','owner_out') and ${bookEntries.voidedAt} is null), 0)`,
      })
      .from(bookEntries)
      .where(where),
  ]);
  return {
    ...buildPaginatedResult(items.map(view), total?.n ?? 0, { page: query.page, pageSize: query.pageSize }),
    summary: { moneyInMinor: n(total?.moneyIn), moneyOutMinor: n(total?.moneyOut) },
  };
}

/** Every entry in a filter, for a download. */
export async function entriesForExport(businessId: string, query: Omit<EntriesQuery, "page" | "pageSize">) {
  const rows = await db.select().from(bookEntries).where(entriesWhere(businessId, query)).orderBy(asc(bookEntries.entryDate), asc(bookEntries.createdAt)).limit(20_000);
  return rows.map(view);
}

async function findEntry(businessId: string, entryId: string) {
  const [entry] = await db.select().from(bookEntries).where(and(eq(bookEntries.id, entryId), eq(bookEntries.businessId, businessId))).limit(1);
  if (!entry) throw AppError.notFound("Entry not found");
  return entry;
}

export async function getEntry(businessId: string, entryId: string) {
  const entry = await findEntry(businessId, entryId);
  const payments = await db.select().from(bookEntryPayments).where(eq(bookEntryPayments.entryId, entry.id)).orderBy(asc(bookEntryPayments.paidOn), asc(bookEntryPayments.createdAt));
  return {
    ...view(entry),
    payments: payments.map((p) => ({ id: p.id, amountMinor: p.amountMinor, paidOn: p.paidOn, method: p.method, note: p.note, voided: Boolean(p.voidedAt) })),
  };
}

const sameAsBefore = (before: Entry, update: EntryUpdate) => ({
  ...(update.entryDate !== undefined ? { entryDate: [before.entryDate, update.entryDate] } : {}),
  ...(update.amountMinor !== undefined ? { amountMinor: [before.amountMinor, update.amountMinor] } : {}),
  ...(update.category !== undefined ? { category: [before.category, update.category] } : {}),
  ...(update.partyName !== undefined ? { partyName: [before.partyName, update.partyName] } : {}),
});

export async function updateEntry(actor: Actor, businessId: string, entryId: string, update: EntryUpdate) {
  const before = await findEntry(businessId, entryId);
  if (before.voidedAt) throw AppError.conflict("A voided entry can't be changed.");
  // The loan pages keep a loan and its repayments in step; changing one here would break the loan's figures.
  if (before.loanId) throw AppError.conflict("This entry belongs to a loan. Change it on the Loans page.");

  const amount = update.amountMinor ?? before.amountMinor;
  const credit = canBeOnCredit(before.kind);
  if (credit && amount < before.paidMinor) throw AppError.validation("The total can't be less than what has already been paid. Void the extra payment first.");

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(bookEntries)
      .set({
        entryDate: update.entryDate ?? before.entryDate,
        amountMinor: amount,
        category: update.category === undefined ? before.category : update.category || null,
        description: update.description === undefined ? before.description : update.description || null,
        partyName: update.partyName === undefined ? before.partyName : update.partyName || null,
        partyPhone: update.partyPhone === undefined ? before.partyPhone : update.partyPhone || null,
        paymentMethod: update.paymentMethod ?? before.paymentMethod,
        reference: update.reference === undefined ? before.reference : update.reference || null,
        // Paid-in-full kinds stay paid in full: their one payment follows the new amount and date.
        paidMinor: credit ? before.paidMinor : amount,
        updatedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(bookEntries.id, entryId))
      .returning();
    if (!credit && (update.amountMinor !== undefined || update.entryDate !== undefined || update.paymentMethod !== undefined)) {
      await tx.update(bookEntryPayments).set({ voidedAt: new Date() }).where(and(eq(bookEntryPayments.entryId, entryId), isNull(bookEntryPayments.voidedAt)));
      await insertPayment(tx, row!, { amountMinor: amount, paidOn: row!.entryDate, method: row!.paymentMethod }, actor.id);
    }
    return row!;
  });
  await recordAudit({ actorUserId: actor.id, tenantId: before.tenantId, action: "book.entry_edit", label: "Changed an entry in the books", entityType: "book_entry", entityId: entryId, metadata: { businessId, changes: sameAsBefore(before, update) } });
  return view(updated);
}

export async function voidEntry(actor: Actor, businessId: string, entryId: string, reason: string) {
  const entry = await findEntry(businessId, entryId);
  if (entry.voidedAt) throw AppError.conflict("This entry is already voided.");
  if (entry.loanId) throw AppError.conflict("This entry belongs to a loan. Cancel or change it on the Loans page.");
  await db.transaction(async (tx) => {
    await tx.update(bookEntries).set({ voidedAt: new Date(), voidedBy: actor.id, voidReason: reason, updatedAt: new Date() }).where(eq(bookEntries.id, entryId));
    await tx.update(bookEntryPayments).set({ voidedAt: new Date() }).where(and(eq(bookEntryPayments.entryId, entryId), isNull(bookEntryPayments.voidedAt)));
    // A voice note that made this entry can be used again.
    await tx.update(bookVoiceNotes).set({ status: "new", entryId: null }).where(eq(bookVoiceNotes.entryId, entryId));
  });
  await recordAudit({ actorUserId: actor.id, tenantId: entry.tenantId, action: "book.entry_void", label: "Voided an entry in the books", entityType: "book_entry", entityId: entryId, metadata: { businessId, kind: entry.kind, amountMinor: entry.amountMinor, reason } });
}

/** Records money that came in (or went out) against an entry that was on credit. */
export async function addEntryPayment(actor: Actor, businessId: string, entryId: string, input: { amountMinor: number; paidOn?: string; method: string; note?: string }) {
  const result = await db.transaction(async (tx) => {
    const [entry] = await tx.select().from(bookEntries).where(and(eq(bookEntries.id, entryId), eq(bookEntries.businessId, businessId))).for("update");
    if (!entry) throw AppError.notFound("Entry not found");
    if (entry.voidedAt) throw AppError.conflict("A voided entry can't take payments.");
    if (!canBeOnCredit(entry.kind)) throw AppError.conflict("This entry was paid in full when it was written down.");
    const owing = entry.amountMinor - entry.paidMinor;
    if (input.amountMinor > owing) throw AppError.validation(`Only ${owing / 100} is still unpaid on this entry.`);
    await insertPayment(tx, entry, { amountMinor: input.amountMinor, paidOn: input.paidOn ?? todayString(), method: input.method, note: input.note }, actor.id);
    const [updated] = await tx.update(bookEntries).set({ paidMinor: entry.paidMinor + input.amountMinor, updatedBy: actor.id, updatedAt: new Date() }).where(eq(bookEntries.id, entryId)).returning();
    return { entry, updated: updated! };
  });
  await recordAudit({ actorUserId: actor.id, tenantId: result.entry.tenantId, action: "book.payment_add", label: isMoneyIn(result.entry.kind) ? "Recorded money received on credit" : "Recorded money paid on credit", entityType: "book_entry", entityId: entryId, metadata: { businessId, amountMinor: input.amountMinor, remainingMinor: result.updated.amountMinor - result.updated.paidMinor } });
  return view(result.updated);
}

/** Takes a payment back (it was written down by mistake): the entry owes that money again. */
export async function voidEntryPayment(actor: Actor, businessId: string, entryId: string, paymentId: string) {
  const result = await db.transaction(async (tx) => {
    const [entry] = await tx.select().from(bookEntries).where(and(eq(bookEntries.id, entryId), eq(bookEntries.businessId, businessId))).for("update");
    if (!entry) throw AppError.notFound("Entry not found");
    if (entry.voidedAt || !canBeOnCredit(entry.kind)) throw AppError.conflict("Payments on this entry can't be changed.");
    const [payment] = await tx.select().from(bookEntryPayments).where(and(eq(bookEntryPayments.id, paymentId), eq(bookEntryPayments.entryId, entryId), isNull(bookEntryPayments.voidedAt))).for("update");
    if (!payment) throw AppError.notFound("Payment not found");
    await tx.update(bookEntryPayments).set({ voidedAt: new Date() }).where(eq(bookEntryPayments.id, paymentId));
    const [updated] = await tx.update(bookEntries).set({ paidMinor: Math.max(0, entry.paidMinor - payment.amountMinor), updatedBy: actor.id, updatedAt: new Date() }).where(eq(bookEntries.id, entryId)).returning();
    return { entry, updated: updated!, payment };
  });
  await recordAudit({ actorUserId: actor.id, tenantId: result.entry.tenantId, action: "book.payment_void", label: "Took back a recorded payment", entityType: "book_entry", entityId: entryId, metadata: { businessId, amountMinor: result.payment.amountMinor } });
  return view(result.updated);
}

// ---------------------------------------------------------------- loans

async function repaidByLoan(loanIds: string[]) {
  if (loanIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ loanId: bookEntries.loanId, total: sql<string>`coalesce(sum(${bookEntries.amountMinor}), 0)` })
    .from(bookEntries)
    .where(and(inArray(bookEntries.loanId, loanIds), inArray(bookEntries.kind, ["loan_repayment_in", "loan_repayment_out"]), isNull(bookEntries.voidedAt)))
    .groupBy(bookEntries.loanId);
  return new Map(rows.map((r) => [r.loanId!, n(r.total)]));
}

function loanView(loan: Loan, repaidMinor: number, today: string) {
  const interestPercent = Number(loan.interestPercent);
  const figures = loanBalance({ principalMinor: loan.principalMinor, interestPercent, repaidMinor, status: loan.status, dueOn: loan.dueOn }, today);
  return {
    id: loan.id,
    direction: loan.direction as "lent" | "borrowed",
    partyName: loan.partyName,
    partyPhone: loan.partyPhone,
    principalMinor: loan.principalMinor,
    interestPercent,
    interestMinor: figures.interestMinor,
    totalDueMinor: figures.totalDueMinor,
    repaidMinor,
    balanceMinor: loan.status === "open" ? figures.balanceMinor : 0,
    issuedOn: loan.issuedOn,
    dueOn: loan.dueOn,
    purpose: loan.purpose,
    status: loan.status,
    overdue: figures.overdue,
    createdAt: loan.createdAt,
  };
}

export async function createLoan(actor: Actor, businessId: string, input: LoanInput) {
  const business = await businessOf(businessId);
  const loan = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(bookLoans)
      .values({
        businessId,
        tenantId: business.tenantId,
        direction: input.direction,
        partyName: input.partyName,
        partyPhone: input.partyPhone ?? null,
        principalMinor: input.principalMinor,
        interestPercent: String(input.interestPercent),
        issuedOn: input.issuedOn,
        dueOn: input.dueOn ?? null,
        purpose: input.purpose ?? null,
        createdBy: actor.id,
      })
      .returning();
    // The money moving is its own entry in the cash book, tied to the loan.
    const [entry] = await tx
      .insert(bookEntries)
      .values({
        businessId,
        tenantId: business.tenantId,
        kind: loanEntryKind(input.direction),
        entryDate: input.issuedOn,
        amountMinor: input.principalMinor,
        paidMinor: input.principalMinor,
        category: "Loan",
        description: input.purpose ?? null,
        partyName: input.partyName,
        partyPhone: input.partyPhone ?? null,
        paymentMethod: input.paymentMethod,
        loanId: row!.id,
        voiceNoteId: input.voiceNoteId ?? null,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    await insertPayment(tx, entry!, { amountMinor: input.principalMinor, paidOn: input.issuedOn, method: input.paymentMethod }, actor.id);
    await claimVoiceNote(tx, businessId, input.voiceNoteId, entry!.id);
    return row!;
  });
  await recordAudit({ actorUserId: actor.id, tenantId: business.tenantId, action: "book.loan_add", label: input.direction === "lent" ? "Wrote down money lent" : "Wrote down money borrowed", entityType: "book_loan", entityId: loan.id, metadata: { businessId, direction: input.direction, principalMinor: input.principalMinor, interestPercent: input.interestPercent } });
  return loanView(loan, 0, todayString());
}

export async function listLoans(businessId: string, query: { status?: string; direction?: string; from?: string; to?: string }) {
  const conditions: SQL[] = [eq(bookLoans.businessId, businessId)];
  if (query.status && query.status !== "all") conditions.push(eq(bookLoans.status, query.status));
  if (query.direction) conditions.push(eq(bookLoans.direction, query.direction));
  if (query.from) conditions.push(gte(bookLoans.issuedOn, query.from));
  if (query.to) conditions.push(lte(bookLoans.issuedOn, query.to));
  const rows = await db.select().from(bookLoans).where(and(...conditions)).orderBy(desc(bookLoans.issuedOn), desc(bookLoans.createdAt)).limit(500);
  const repaid = await repaidByLoan(rows.map((r) => r.id));
  const today = todayString();
  return rows.map((r) => loanView(r, repaid.get(r.id) ?? 0, today));
}

export async function getLoan(businessId: string, loanId: string) {
  const [loan] = await db.select().from(bookLoans).where(and(eq(bookLoans.id, loanId), eq(bookLoans.businessId, businessId))).limit(1);
  if (!loan) throw AppError.notFound("Loan not found");
  const entries = await db.select().from(bookEntries).where(eq(bookEntries.loanId, loanId)).orderBy(asc(bookEntries.entryDate), asc(bookEntries.createdAt));
  const repayments = entries.filter((e) => e.kind === "loan_repayment_in" || e.kind === "loan_repayment_out");
  const repaid = repayments.filter((e) => !e.voidedAt).reduce((sum, e) => sum + e.amountMinor, 0);
  return { ...loanView(loan, repaid, todayString()), repayments: repayments.map(view) };
}

export async function updateLoan(actor: Actor, businessId: string, loanId: string, update: { dueOn?: string | null; purpose?: string | null; partyPhone?: string | null; interestPercent?: number }) {
  const [before] = await db.select().from(bookLoans).where(and(eq(bookLoans.id, loanId), eq(bookLoans.businessId, businessId))).limit(1);
  if (!before) throw AppError.notFound("Loan not found");
  if (before.status !== "open") throw AppError.conflict("A closed loan can't be changed.");
  await db
    .update(bookLoans)
    .set({
      dueOn: update.dueOn === undefined ? before.dueOn : update.dueOn,
      purpose: update.purpose === undefined ? before.purpose : update.purpose || null,
      partyPhone: update.partyPhone === undefined ? before.partyPhone : update.partyPhone || null,
      interestPercent: update.interestPercent === undefined ? before.interestPercent : String(update.interestPercent),
      updatedAt: new Date(),
    })
    .where(eq(bookLoans.id, loanId));
  await recordAudit({ actorUserId: actor.id, tenantId: before.tenantId, action: "book.loan_edit", label: "Changed a loan", entityType: "book_loan", entityId: loanId, metadata: { businessId, interestPercent: update.interestPercent, dueOn: update.dueOn } });
  return getLoan(businessId, loanId);
}

export async function addRepayment(actor: Actor, businessId: string, loanId: string, input: { amountMinor: number; paidOn?: string; method: string; note?: string }) {
  const result = await db.transaction(async (tx) => {
    const [loan] = await tx.select().from(bookLoans).where(and(eq(bookLoans.id, loanId), eq(bookLoans.businessId, businessId))).for("update");
    if (!loan) throw AppError.notFound("Loan not found");
    if (loan.status !== "open") throw AppError.conflict("This loan is closed.");
    const [repaidRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${bookEntries.amountMinor}), 0)` })
      .from(bookEntries)
      .where(and(eq(bookEntries.loanId, loanId), inArray(bookEntries.kind, ["loan_repayment_in", "loan_repayment_out"]), isNull(bookEntries.voidedAt)));
    const repaid = n(repaidRow?.total);
    const figures = loanBalance({ principalMinor: loan.principalMinor, interestPercent: Number(loan.interestPercent), repaidMinor: repaid, status: loan.status, dueOn: loan.dueOn }, todayString());
    if (input.amountMinor > figures.balanceMinor) throw AppError.validation(`Only ${figures.balanceMinor / 100} is left to pay on this loan.`);
    const paidOn = input.paidOn ?? todayString();
    const [entry] = await tx
      .insert(bookEntries)
      .values({
        businessId,
        tenantId: loan.tenantId,
        kind: repaymentKind(loan.direction as "lent" | "borrowed"),
        entryDate: paidOn,
        amountMinor: input.amountMinor,
        paidMinor: input.amountMinor,
        category: "Loan",
        description: input.note ?? null,
        partyName: loan.partyName,
        partyPhone: loan.partyPhone,
        paymentMethod: input.method,
        loanId,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    await insertPayment(tx, entry!, { amountMinor: input.amountMinor, paidOn, method: input.method, note: input.note }, actor.id);
    const closed = repaid + input.amountMinor >= figures.totalDueMinor;
    if (closed) await tx.update(bookLoans).set({ status: "paid", closedAt: new Date(), updatedAt: new Date() }).where(eq(bookLoans.id, loanId));
    return { loan, closed, entry: entry! };
  });
  await recordAudit({ actorUserId: actor.id, tenantId: result.loan.tenantId, action: "book.loan_repayment", label: result.loan.direction === "lent" ? "Recorded a loan being paid back to the business" : "Recorded a loan payment by the business", entityType: "book_loan", entityId: loanId, metadata: { businessId, amountMinor: input.amountMinor, loanClosed: result.closed } });
  return getLoan(businessId, loanId);
}

/** Closes a loan nobody will pay back. What was repaid stays; the rest stops counting as owed. */
export async function writeOffLoan(actor: Actor, businessId: string, loanId: string, reason: string) {
  const [loan] = await db.select().from(bookLoans).where(and(eq(bookLoans.id, loanId), eq(bookLoans.businessId, businessId))).limit(1);
  if (!loan) throw AppError.notFound("Loan not found");
  if (loan.status !== "open") throw AppError.conflict("This loan is already closed.");
  await db.update(bookLoans).set({ status: "written_off", closedAt: new Date(), purpose: loan.purpose ? `${loan.purpose} (written off: ${reason})` : `Written off: ${reason}`, updatedAt: new Date() }).where(eq(bookLoans.id, loanId));
  await recordAudit({ actorUserId: actor.id, tenantId: loan.tenantId, action: "book.loan_write_off", label: "Wrote off a loan", entityType: "book_loan", entityId: loanId, metadata: { businessId, reason } });
  return getLoan(businessId, loanId);
}

/** Cancels a loan that was written down by mistake: allowed only while nothing has been paid back. */
export async function cancelLoan(actor: Actor, businessId: string, loanId: string, reason: string) {
  const [loan] = await db.select().from(bookLoans).where(and(eq(bookLoans.id, loanId), eq(bookLoans.businessId, businessId))).limit(1);
  if (!loan) throw AppError.notFound("Loan not found");
  if (loan.status !== "open") throw AppError.conflict("This loan is already closed.");
  const repaid = (await repaidByLoan([loanId])).get(loanId) ?? 0;
  if (repaid > 0) throw AppError.conflict("Money has been paid back on this loan, so it can't be cancelled. Write it off instead.");
  await db.transaction(async (tx) => {
    await tx.update(bookLoans).set({ status: "cancelled", closedAt: new Date(), updatedAt: new Date() }).where(eq(bookLoans.id, loanId));
    await tx.update(bookEntries).set({ voidedAt: new Date(), voidedBy: actor.id, voidReason: `Loan cancelled: ${reason}`, updatedAt: new Date() }).where(and(eq(bookEntries.loanId, loanId), isNull(bookEntries.voidedAt)));
    await tx.update(bookEntryPayments).set({ voidedAt: new Date() }).where(and(inArray(bookEntryPayments.entryId, tx.select({ id: bookEntries.id }).from(bookEntries).where(eq(bookEntries.loanId, loanId))), isNull(bookEntryPayments.voidedAt)));
  });
  await recordAudit({ actorUserId: actor.id, tenantId: loan.tenantId, action: "book.loan_cancel", label: "Cancelled a loan", entityType: "book_loan", entityId: loanId, metadata: { businessId, reason } });
  return getLoan(businessId, loanId);
}

// ---------------------------------------------------------------- voice notes

type VoiceNote = typeof bookVoiceNotes.$inferSelect;

const voiceView = (note: VoiceNote) => ({
  id: note.id,
  audioUrl: note.audioUrl,
  durationSeconds: note.durationSeconds,
  caption: note.caption,
  transcript: note.transcript,
  status: note.status as "new" | "done",
  entryId: note.entryId,
  createdAt: note.createdAt,
});

export async function createVoiceNote(actor: Actor, businessId: string, input: { audioUrl: string; mimeType?: string; durationSeconds?: number; caption?: string; transcript?: string }) {
  const business = await businessOf(businessId);
  const [row] = await db
    .insert(bookVoiceNotes)
    .values({ businessId, tenantId: business.tenantId, audioUrl: input.audioUrl, mimeType: input.mimeType ?? null, durationSeconds: input.durationSeconds ?? null, caption: input.caption ?? null, transcript: input.transcript ?? null, createdBy: actor.id })
    .returning();
  await recordAudit({ actorUserId: actor.id, tenantId: business.tenantId, action: "book.voice_add", label: "Recorded a voice note", entityType: "voice_note", entityId: row!.id, metadata: { businessId, durationSeconds: input.durationSeconds } });
  return voiceView(row!);
}

export async function listVoiceNotes(businessId: string, query: { status?: string; page: number; pageSize: number }) {
  const conditions: SQL[] = [eq(bookVoiceNotes.businessId, businessId), isNull(bookVoiceNotes.voidedAt)];
  if (query.status && query.status !== "all") conditions.push(eq(bookVoiceNotes.status, query.status));
  const where = and(...conditions);
  const [items, [total]] = await Promise.all([
    db.select().from(bookVoiceNotes).where(where).orderBy(desc(bookVoiceNotes.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(bookVoiceNotes).where(where),
  ]);
  return buildPaginatedResult(items.map(voiceView), total?.n ?? 0, { page: query.page, pageSize: query.pageSize });
}

export async function updateVoiceNote(actor: Actor, businessId: string, noteId: string, update: { caption?: string | null; transcript?: string | null; status?: "new" | "done" }) {
  const [note] = await db.select().from(bookVoiceNotes).where(and(eq(bookVoiceNotes.id, noteId), eq(bookVoiceNotes.businessId, businessId), isNull(bookVoiceNotes.voidedAt))).limit(1);
  if (!note) throw AppError.notFound("Voice note not found");
  const [row] = await db
    .update(bookVoiceNotes)
    .set({
      caption: update.caption === undefined ? note.caption : update.caption || null,
      transcript: update.transcript === undefined ? note.transcript : update.transcript || null,
      status: update.status ?? note.status,
    })
    .where(eq(bookVoiceNotes.id, noteId))
    .returning();
  await recordAudit({ actorUserId: actor.id, tenantId: note.tenantId, action: "book.voice_edit", label: "Changed a voice note", entityType: "voice_note", entityId: noteId, metadata: { businessId, status: update.status } });
  return voiceView(row!);
}

/** A voice note is a record, so it is hidden rather than deleted. */
export async function voidVoiceNote(actor: Actor, businessId: string, noteId: string) {
  const [note] = await db.select().from(bookVoiceNotes).where(and(eq(bookVoiceNotes.id, noteId), eq(bookVoiceNotes.businessId, businessId), isNull(bookVoiceNotes.voidedAt))).limit(1);
  if (!note) throw AppError.notFound("Voice note not found");
  if (note.entryId) throw AppError.conflict("This voice note was used for an entry, so it has to stay with it.");
  await db.update(bookVoiceNotes).set({ voidedAt: new Date() }).where(eq(bookVoiceNotes.id, noteId));
  await recordAudit({ actorUserId: actor.id, tenantId: note.tenantId, action: "book.voice_remove", label: "Removed a voice note", entityType: "voice_note", entityId: noteId, metadata: { businessId } });
}

export const voiceNoteBelongs = async (businessId: string, noteId: string) => {
  const [row] = await db.select({ id: bookVoiceNotes.id }).from(bookVoiceNotes).where(and(eq(bookVoiceNotes.id, noteId), eq(bookVoiceNotes.businessId, businessId))).limit(1);
  return Boolean(row);
};

export { REVENUE_KINDS };
