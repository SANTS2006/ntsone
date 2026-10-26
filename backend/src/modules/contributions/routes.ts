import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { date, MONEY_FORMAT, sendTableExport, type ExportColumn } from "../../lib/tableExport.js";
import {
  contributionInputSchema,
  contributionUpdateSchema,
  exportQuerySchema,
  fieldInputSchema,
  fieldUpdateSchema,
  paymentInputSchema,
  recordInputSchema,
  recordUpdateSchema,
  trackerQuerySchema,
  withdrawalInputSchema,
  withdrawalUpdateSchema,
} from "./schemas.js";
import { contributionsService as svc, type Actor } from "./service.js";

const idParams = z.object({ contributionId: z.string().uuid() });
const fieldParams = idParams.extend({ fieldId: z.string().uuid() });
const recordParams = idParams.extend({ recordId: z.string().uuid() });
const paymentParams = recordParams.extend({ year: z.coerce.number().int().min(2000).max(2200), month: z.coerce.number().int().min(1).max(12) });
const withdrawalParams = idParams.extend({ withdrawalId: z.string().uuid() });

const actorOf = (request: FastifyRequest): Actor => {
  if (!request.user) throw AppError.unauthorized();
  return { id: request.user.id, tenantId: request.user.tenantId };
};
const noStore = (reply: { header: (name: string, value: string) => unknown }) => reply.header("Cache-Control", "no-store");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (minor: number | null | undefined) => (minor === null || minor === undefined ? null : minor / 100);

/** The Contributions module: money collected for a purpose, tracked by row or by month. Private to the person who keeps it. */
export async function contributionRoutes(app: FastifyInstance) {
  const write = { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } };

  app.get("/", async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await svc.list(actorOf(request)));
  });

  app.post("/", write, async (request, reply) => {
    const created = await svc.create(actorOf(request), contributionInputSchema.parse(request.body));
    reply.status(201);
    return sendSuccess(reply, created, "Contribution created");
  });

  app.get("/:contributionId", async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await svc.get(actorOf(request), idParams.parse(request.params).contributionId));
  });

  app.patch("/:contributionId", write, async (request, reply) => {
    const { contributionId } = idParams.parse(request.params);
    return sendSuccess(reply, await svc.update(actorOf(request), contributionId, contributionUpdateSchema.parse(request.body)), "Saved");
  });

  app.delete("/:contributionId", write, async (request, reply) => {
    await svc.remove(actorOf(request), idParams.parse(request.params).contributionId);
    return sendSuccess(reply, null, "Contribution removed");
  });

  // ---- columns
  app.post("/:contributionId/fields", write, async (request, reply) => {
    const { contributionId } = idParams.parse(request.params);
    reply.status(201);
    return sendSuccess(reply, await svc.addField(actorOf(request), contributionId, fieldInputSchema.parse(request.body).label), "Column added");
  });
  app.patch("/:contributionId/fields/:fieldId", write, async (request, reply) => {
    const { contributionId, fieldId } = fieldParams.parse(request.params);
    return sendSuccess(reply, await svc.renameField(actorOf(request), contributionId, fieldId, fieldUpdateSchema.parse(request.body).label), "Column renamed");
  });
  app.delete("/:contributionId/fields/:fieldId", write, async (request, reply) => {
    const { contributionId, fieldId } = fieldParams.parse(request.params);
    await svc.removeField(actorOf(request), contributionId, fieldId);
    return sendSuccess(reply, null, "Column removed");
  });

  // ---- rows (one-time) and contributors (recurring)
  app.get("/:contributionId/records", async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await svc.listRecords(actorOf(request), idParams.parse(request.params).contributionId));
  });
  app.post("/:contributionId/records", write, async (request, reply) => {
    const { contributionId } = idParams.parse(request.params);
    reply.status(201);
    return sendSuccess(reply, await svc.addRecord(actorOf(request), contributionId, recordInputSchema.parse(request.body)), "Row saved");
  });
  app.patch("/:contributionId/records/:recordId", write, async (request, reply) => {
    const { contributionId, recordId } = recordParams.parse(request.params);
    return sendSuccess(reply, await svc.updateRecord(actorOf(request), contributionId, recordId, recordUpdateSchema.parse(request.body)), "Row saved");
  });
  app.delete("/:contributionId/records/:recordId", write, async (request, reply) => {
    const { contributionId, recordId } = recordParams.parse(request.params);
    await svc.removeRecord(actorOf(request), contributionId, recordId);
    return sendSuccess(reply, null, "Row removed");
  });

  // ---- recurring: one payment per contributor per month
  app.put("/:contributionId/records/:recordId/payments", write, async (request, reply) => {
    const { contributionId, recordId } = recordParams.parse(request.params);
    return sendSuccess(reply, await svc.setPayment(actorOf(request), contributionId, recordId, paymentInputSchema.parse(request.body)), "Payment saved");
  });
  app.delete("/:contributionId/records/:recordId/payments/:year/:month", write, async (request, reply) => {
    const { contributionId, recordId, year, month } = paymentParams.parse(request.params);
    await svc.removePayment(actorOf(request), contributionId, recordId, year, month);
    return sendSuccess(reply, null, "Payment removed");
  });
  app.get("/:contributionId/tracker", async (request, reply) => {
    noStore(reply);
    const { contributionId } = idParams.parse(request.params);
    return sendSuccess(reply, await svc.tracker(actorOf(request), contributionId, trackerQuerySchema.parse(request.query).year));
  });
  app.get("/:contributionId/summary", async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await svc.summary(actorOf(request), idParams.parse(request.params).contributionId));
  });

  // ---- money taken out
  app.get("/:contributionId/withdrawals", async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await svc.listWithdrawals(actorOf(request), idParams.parse(request.params).contributionId));
  });
  app.post("/:contributionId/withdrawals", write, async (request, reply) => {
    const { contributionId } = idParams.parse(request.params);
    reply.status(201);
    return sendSuccess(reply, await svc.addWithdrawal(actorOf(request), contributionId, withdrawalInputSchema.parse(request.body)), "Saved");
  });
  app.patch("/:contributionId/withdrawals/:withdrawalId", write, async (request, reply) => {
    const { contributionId, withdrawalId } = withdrawalParams.parse(request.params);
    return sendSuccess(reply, await svc.updateWithdrawal(actorOf(request), contributionId, withdrawalId, withdrawalUpdateSchema.parse(request.body)), "Saved");
  });
  app.delete("/:contributionId/withdrawals/:withdrawalId", write, async (request, reply) => {
    const { contributionId, withdrawalId } = withdrawalParams.parse(request.params);
    await svc.removeWithdrawal(actorOf(request), contributionId, withdrawalId);
    return sendSuccess(reply, null, "Removed");
  });

  app.get("/:contributionId/activity", async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await svc.activity(actorOf(request), idParams.parse(request.params).contributionId));
  });

  app.get("/:contributionId/export", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { contributionId } = idParams.parse(request.params);
    const { format, year } = exportQuerySchema.parse(request.query);
    const data = await svc.exportData(actorOf(request), contributionId, year);
    const fieldColumns = (get: (row: { values: Record<string, string> }) => Record<string, string>): ExportColumn<any>[] =>
      data.fields.map((f) => ({ label: f.label, value: (r: { values: Record<string, string> }) => get(r)[f.id] ?? "" }));
    const withdrawals = {
      name: "Money taken",
      rows: data.withdrawals.items,
      columns: [
        { label: "Date taken", value: (w: (typeof data.withdrawals.items)[number]) => date(w.takenAt) },
        { label: "Amount", value: (w: (typeof data.withdrawals.items)[number]) => money(w.amountMinor), numFmt: MONEY_FORMAT },
        { label: "Total taken so far", value: (w: (typeof data.withdrawals.items)[number]) => money(w.cumulativeMinor), numFmt: MONEY_FORMAT },
        { label: "Note", value: (w: (typeof data.withdrawals.items)[number]) => w.note },
        { label: "Entered", value: (w: (typeof data.withdrawals.items)[number]) => date(w.createdAt) },
        { label: "Last changed", value: (w: (typeof data.withdrawals.items)[number]) => date(w.updatedAt) },
      ] as ExportColumn<any>[],
    };
    if (data.tracker) {
      const t = data.tracker;
      return sendTableExport(reply, format, `Contribution ${data.row.name} ${t.year}`, [
        {
          name: String(t.year),
          rows: t.members,
          columns: [
            ...fieldColumns((r) => r.values),
            ...MONTHS.map((month, i) => ({
              label: month,
              value: (m: (typeof t.members)[number]) => {
                const cell = m.cells[i]!;
                return cell.amountMinor !== null ? money(cell.amountMinor) : cell.status === "unpaid" ? "Not paid" : "";
              },
              numFmt: MONEY_FORMAT,
            })),
            { label: "Total paid", value: (m: (typeof t.members)[number]) => money(m.totalMinor), numFmt: MONEY_FORMAT },
            { label: "Months not paid", value: (m: (typeof t.members)[number]) => m.unpaidMonths },
          ] as ExportColumn<any>[],
        },
        withdrawals,
      ]);
    }
    return sendTableExport(reply, format, `Contribution ${data.row.name}`, [
      {
        name: "Contributions",
        rows: data.records,
        columns: [
          ...fieldColumns((r) => r.values),
          { label: "Amount", value: (r: (typeof data.records)[number]) => money(r.amountMinor), numFmt: MONEY_FORMAT },
          { label: "Entered", value: (r: (typeof data.records)[number]) => date(r.createdAt) },
          { label: "Last changed", value: (r: (typeof data.records)[number]) => date(r.updatedAt) },
        ] as ExportColumn<any>[],
      },
      withdrawals,
    ]);
  });
}
