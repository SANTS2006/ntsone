import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { date, exportFormatSchema, sendTableExport, type ExportSheet } from "../../lib/tableExport.js";
import { requireBusinessAccess } from "../businesses/access.js";
import { createUploadSignature, VOICE_UPLOAD_FORMATS } from "../uploads/service.js";
import { cashFlow, debts, profitAndLoss, resolvePeriod, summary } from "./reports.js";
import { KIND_LABEL } from "./rules.js";
import { entriesQuerySchema, entryInputSchema, entryPaymentSchema, entryUpdateSchema, loanInputSchema, loanUpdateSchema, periodQuerySchema, repaymentSchema, voiceNoteInputSchema, voiceNoteUpdateSchema, voidSchema } from "./schemas.js";
import * as books from "./service.js";

type BusinessParams = { businessId: string };

const actorOf = (request: FastifyRequest) => {
  if (!request.user) throw AppError.unauthorized();
  return { id: request.user.id };
};

const noStore = (reply: { header: (name: string, value: string) => unknown }) => reply.header("Cache-Control", "no-store");
const money = (minor: number) => minor / 100;
const MONEY_FORMAT = "#,##0.00";

const listVoiceQuery = z.object({ status: z.enum(["new", "done", "all"]).default("all"), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
const loansQuery = periodQuerySchema.extend({ status: z.enum(["open", "paid", "written_off", "cancelled", "all"]).default("open"), direction: z.enum(["lent", "borrowed"]).optional() });
const writeOffSchema = z.object({ reason: z.string().trim().min(3, "Say why").max(300) });
const exportQuery = exportFormatSchema.and(periodQuerySchema);

/**
 * Bookkeeping for a business: the cash book, credit, loans, reports and voice notes. Anyone with access to the
 * business can read the books; changing them needs admin access to the business. Nothing is ever deleted.
 */
export async function bookkeepingRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requireBusinessAccess("viewer") };
  const admin = { preHandler: requireBusinessAccess("admin") };
  const writeLimit = { ...admin, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };

  // ---- the first screen and the reports
  app.get<{ Params: BusinessParams }>("/:businessId/books/summary", viewer, async (request, reply) => {
    noStore(reply);
    const q = periodQuerySchema.parse(request.query);
    const [data, settings] = await Promise.all([summary(request.params.businessId, resolvePeriod(q.from, q.to)), books.bookSettings(request.params.businessId)]);
    return sendSuccess(reply, { ...data, currency: settings.currency });
  });

  app.get<{ Params: BusinessParams }>("/:businessId/books/reports/profit-loss", viewer, async (request, reply) => {
    noStore(reply);
    const q = periodQuerySchema.parse(request.query);
    const [data, settings] = await Promise.all([profitAndLoss(request.params.businessId, resolvePeriod(q.from, q.to)), books.bookSettings(request.params.businessId)]);
    return sendSuccess(reply, { ...data, currency: settings.currency });
  });

  app.get<{ Params: BusinessParams }>("/:businessId/books/reports/cash-flow", viewer, async (request, reply) => {
    noStore(reply);
    const q = periodQuerySchema.parse(request.query);
    const [data, settings] = await Promise.all([cashFlow(request.params.businessId, resolvePeriod(q.from, q.to)), books.bookSettings(request.params.businessId)]);
    return sendSuccess(reply, { ...data, currency: settings.currency });
  });

  app.get<{ Params: BusinessParams }>("/:businessId/books/reports/debts", viewer, async (request, reply) => {
    noStore(reply);
    const [data, settings] = await Promise.all([debts(request.params.businessId), books.bookSettings(request.params.businessId)]);
    return sendSuccess(reply, { ...data, currency: settings.currency });
  });

  app.get<{ Params: BusinessParams }>("/:businessId/books/reports/export", viewer, async (request, reply) => {
    const { format, from, to } = exportQuery.parse(request.query);
    const period = resolvePeriod(from, to);
    const [pl, flow, owed] = await Promise.all([profitAndLoss(request.params.businessId, period), cashFlow(request.params.businessId, period), debts(request.params.businessId)]);
    const plRows = [
      ...pl.revenue.map((r) => ({ section: "Money earned", item: r.category, amount: money(r.totalMinor) })),
      { section: "Money earned", item: "Total earned", amount: money(pl.revenueMinor) },
      ...pl.costOfGoods.map((r) => ({ section: "Stock bought", item: r.category, amount: money(r.totalMinor) })),
      { section: "Profit before expenses", item: "Gross profit", amount: money(pl.grossProfitMinor) },
      ...pl.expenses.map((r) => ({ section: "Expenses", item: r.category, amount: money(r.totalMinor) })),
      { section: "Expenses", item: "Total expenses", amount: money(pl.expensesMinor) },
      { section: "Result", item: pl.netProfitMinor >= 0 ? "Profit" : "Loss", amount: money(pl.netProfitMinor) },
    ];
    const sheets: ExportSheet<any>[] = [
      {
        name: "Profit and loss",
        rows: plRows,
        columns: [
          { label: "Part", value: (r) => r.section },
          { label: "Item", value: (r) => r.item },
          { label: "Amount", value: (r) => r.amount, numFmt: MONEY_FORMAT },
        ],
      },
      {
        name: "Cash flow",
        rows: [
          { item: "Cash at the start", amount: money(flow.openingMinor) },
          ...flow.lines.map((l) => ({ item: `${l.moneyIn ? "In" : "Out"}: ${l.label}`, amount: money(l.moneyIn ? l.totalMinor : -l.totalMinor) })),
          { item: "Cash at the end", amount: money(flow.closingMinor) },
        ],
        columns: [
          { label: "Item", value: (r: { item: string }) => r.item },
          { label: "Amount", value: (r: { amount: number }) => r.amount, numFmt: MONEY_FORMAT },
        ],
      },
      {
        name: "Owed to you",
        rows: owed.owedToYou,
        columns: [
          { label: "Who", value: (r: (typeof owed.owedToYou)[number]) => r.party },
          { label: "Phone", value: (r: (typeof owed.owedToYou)[number]) => r.phone },
          { label: "Owes you", value: (r: (typeof owed.owedToYou)[number]) => money(r.owingMinor), numFmt: MONEY_FORMAT },
          { label: "Since", value: (r: (typeof owed.owedToYou)[number]) => r.since },
        ],
      },
      {
        name: "You owe",
        rows: owed.youOwe,
        columns: [
          { label: "Who", value: (r: (typeof owed.youOwe)[number]) => r.party },
          { label: "Phone", value: (r: (typeof owed.youOwe)[number]) => r.phone },
          { label: "You owe", value: (r: (typeof owed.youOwe)[number]) => money(r.owingMinor), numFmt: MONEY_FORMAT },
          { label: "Since", value: (r: (typeof owed.youOwe)[number]) => r.since },
        ],
      },
    ];
    return sendTableExport(reply, format, `Books ${period.from} to ${period.to}`, sheets);
  });

  // ---- the cash book
  app.get<{ Params: BusinessParams }>("/:businessId/books/entries", viewer, async (request, reply) => {
    noStore(reply);
    const query = entriesQuerySchema.parse(request.query);
    return sendSuccess(reply, await books.listEntries(request.params.businessId, query));
  });

  app.get<{ Params: BusinessParams }>("/:businessId/books/entries/export", viewer, async (request, reply) => {
    const { format, ...rest } = exportFormatSchema.and(entriesQuerySchema.omit({ page: true, pageSize: true })).parse(request.query);
    const rows = await books.entriesForExport(request.params.businessId, rest);
    const sheet: ExportSheet<(typeof rows)[number]> = {
      name: "Cash book",
      rows,
      columns: [
        { label: "Date", value: (e) => e.entryDate },
        { label: "What", value: (e) => KIND_LABEL[e.kind] },
        { label: "Category", value: (e) => e.category },
        { label: "Details", value: (e) => e.description },
        { label: "With", value: (e) => e.partyName },
        { label: "Phone", value: (e) => e.partyPhone },
        { label: "Money in", value: (e) => (e.moneyIn && !e.voided ? money(e.amountMinor) : null), numFmt: MONEY_FORMAT },
        { label: "Money out", value: (e) => (!e.moneyIn && !e.voided ? money(e.amountMinor) : null), numFmt: MONEY_FORMAT },
        { label: "Paid so far", value: (e) => money(e.paidMinor), numFmt: MONEY_FORMAT },
        { label: "Still unpaid", value: (e) => money(e.outstandingMinor), numFmt: MONEY_FORMAT },
        { label: "Paid by", value: (e) => e.paymentMethod },
        { label: "Reference", value: (e) => e.reference },
        { label: "Voided", value: (e) => (e.voided ? `Yes: ${e.voidReason ?? ""}` : "") },
        { label: "Written on", value: (e) => date(e.createdAt) },
      ],
    };
    return sendTableExport(reply, format, "Cash book", [sheet]);
  });

  app.post<{ Params: BusinessParams }>("/:businessId/books/entries", writeLimit, async (request, reply) => {
    const entry = await books.createEntry(actorOf(request), request.params.businessId, entryInputSchema.parse(request.body));
    return sendSuccess(reply, entry, "Written in the books", 201);
  });

  app.get<{ Params: BusinessParams & { entryId: string } }>("/:businessId/books/entries/:entryId", viewer, async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await books.getEntry(request.params.businessId, request.params.entryId));
  });

  app.patch<{ Params: BusinessParams & { entryId: string } }>("/:businessId/books/entries/:entryId", writeLimit, async (request, reply) => {
    const entry = await books.updateEntry(actorOf(request), request.params.businessId, request.params.entryId, entryUpdateSchema.parse(request.body));
    return sendSuccess(reply, entry, "Entry changed");
  });

  app.post<{ Params: BusinessParams & { entryId: string } }>("/:businessId/books/entries/:entryId/void", writeLimit, async (request, reply) => {
    const { reason } = voidSchema.parse(request.body);
    await books.voidEntry(actorOf(request), request.params.businessId, request.params.entryId, reason);
    return sendSuccess(reply, null, "Entry voided");
  });

  app.post<{ Params: BusinessParams & { entryId: string } }>("/:businessId/books/entries/:entryId/payments", writeLimit, async (request, reply) => {
    const entry = await books.addEntryPayment(actorOf(request), request.params.businessId, request.params.entryId, entryPaymentSchema.parse(request.body));
    return sendSuccess(reply, entry, "Payment written down", 201);
  });

  app.post<{ Params: BusinessParams & { entryId: string; paymentId: string } }>("/:businessId/books/entries/:entryId/payments/:paymentId/void", writeLimit, async (request, reply) => {
    const entry = await books.voidEntryPayment(actorOf(request), request.params.businessId, request.params.entryId, request.params.paymentId);
    return sendSuccess(reply, entry, "Payment taken back");
  });

  // ---- loans
  app.get<{ Params: BusinessParams }>("/:businessId/books/loans", viewer, async (request, reply) => {
    noStore(reply);
    const query = loansQuery.parse(request.query);
    return sendSuccess(reply, await books.listLoans(request.params.businessId, query));
  });

  app.post<{ Params: BusinessParams }>("/:businessId/books/loans", writeLimit, async (request, reply) => {
    return sendSuccess(reply, await books.createLoan(actorOf(request), request.params.businessId, loanInputSchema.parse(request.body)), "Loan written down", 201);
  });

  app.get<{ Params: BusinessParams & { loanId: string } }>("/:businessId/books/loans/:loanId", viewer, async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await books.getLoan(request.params.businessId, request.params.loanId));
  });

  app.patch<{ Params: BusinessParams & { loanId: string } }>("/:businessId/books/loans/:loanId", writeLimit, async (request, reply) => {
    return sendSuccess(reply, await books.updateLoan(actorOf(request), request.params.businessId, request.params.loanId, loanUpdateSchema.parse(request.body)), "Loan changed");
  });

  app.post<{ Params: BusinessParams & { loanId: string } }>("/:businessId/books/loans/:loanId/repayments", writeLimit, async (request, reply) => {
    return sendSuccess(reply, await books.addRepayment(actorOf(request), request.params.businessId, request.params.loanId, repaymentSchema.parse(request.body)), "Payment written down", 201);
  });

  app.post<{ Params: BusinessParams & { loanId: string } }>("/:businessId/books/loans/:loanId/write-off", writeLimit, async (request, reply) => {
    const { reason } = writeOffSchema.parse(request.body);
    return sendSuccess(reply, await books.writeOffLoan(actorOf(request), request.params.businessId, request.params.loanId, reason), "Loan written off");
  });

  app.post<{ Params: BusinessParams & { loanId: string } }>("/:businessId/books/loans/:loanId/cancel", writeLimit, async (request, reply) => {
    const { reason } = voidSchema.parse(request.body);
    return sendSuccess(reply, await books.cancelLoan(actorOf(request), request.params.businessId, request.params.loanId, reason), "Loan cancelled");
  });

  // ---- voice notes
  app.post<{ Params: BusinessParams }>("/:businessId/books/voice/signature", admin, async (request, reply) => {
    actorOf(request);
    return sendSuccess(reply, createUploadSignature(`books/${request.params.businessId}/voice`, VOICE_UPLOAD_FORMATS));
  });

  app.get<{ Params: BusinessParams }>("/:businessId/books/voice", viewer, async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await books.listVoiceNotes(request.params.businessId, listVoiceQuery.parse(request.query)));
  });

  app.post<{ Params: BusinessParams }>("/:businessId/books/voice", writeLimit, async (request, reply) => {
    return sendSuccess(reply, await books.createVoiceNote(actorOf(request), request.params.businessId, voiceNoteInputSchema.parse(request.body)), "Voice note saved", 201);
  });

  app.patch<{ Params: BusinessParams & { noteId: string } }>("/:businessId/books/voice/:noteId", writeLimit, async (request, reply) => {
    return sendSuccess(reply, await books.updateVoiceNote(actorOf(request), request.params.businessId, request.params.noteId, voiceNoteUpdateSchema.parse(request.body)), "Voice note changed");
  });

  app.post<{ Params: BusinessParams & { noteId: string } }>("/:businessId/books/voice/:noteId/remove", writeLimit, async (request, reply) => {
    await books.voidVoiceNote(actorOf(request), request.params.businessId, request.params.noteId);
    return sendSuccess(reply, null, "Voice note removed");
  });
}
