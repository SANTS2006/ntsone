import { dateRangeQuery } from "../../lib/dateRange.js";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { date, EXPORT_ROW_LIMIT, exportFormatSchema, MONEY_FORMAT, sendTableExport, type ExportSheet } from "../../lib/tableExport.js";
import { DOCUMENT_WORDING, lineAmount, type BusinessDocumentKind } from "../../shared/designs/index.js";
import * as registrationsRepo from "../registrations/repository.js";
import { requireBusinessAccess } from "./access.js";
import * as cards from "./cards.js";
import * as documents from "./documents.js";
import { listDocumentsQuerySchema } from "./schemas.js";
import * as businessService from "./service.js";

type DocView = ReturnType<typeof documents.toView>;
type ItemRow = DocView["items"][number] & { number: string; clientName: string };
type Analytics = Awaited<ReturnType<typeof documents.documentAnalytics>>;

/** key -> the business's own label for it. */
const labelsOf = (defs: { key: string; label: string }[]) => new Map(defs.map((d) => [d.key, d.label]));

function kindOf(value: string): BusinessDocumentKind {
  if (value === "invoices") return "invoice";
  if (value === "receipts") return "receipt";
  if (value === "quotations") return "quotation";
  throw AppError.notFound("Not found");
}

/** CSV/Excel downloads of a business's invoices, receipts, and analysis. */
export async function businessExportRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requireBusinessAccess("viewer") };

  app.get<{ Params: { businessId: string } }>("/:businessId/cards/export", viewer, async (request, reply) => {
    const { format, dateFrom, dateTo } = exportFormatSchema.extend(dateRangeQuery).parse(request.query);
    const [business, { items }] = await Promise.all([
      businessService.getBusiness(request.params.businessId),
      cards.listCards(request.params.businessId, { dateFrom, dateTo }, { page: 1, pageSize: EXPORT_ROW_LIMIT }),
    ]);
    const sheet: ExportSheet<(typeof items)[number]> = {
      name: "Business cards",
      rows: items,
      columns: [
        { label: "Name", value: (c) => c.name },
        { label: "Job title", value: (c) => c.jobTitle },
        { label: "Company", value: (c) => c.company },
        { label: "Phone", value: (c) => c.phone },
        { label: "Email", value: (c) => c.email },
        { label: "Website", value: (c) => c.website },
        { label: "Address", value: (c) => c.address },
        { label: "Layout", value: (c) => c.template },
        { label: "Last sent to", value: (c) => c.lastSentTo },
        { label: "Created", value: (c) => date(c.createdAt) },
      ],
    };
    return sendTableExport(reply, format, `${business.name} business cards`, [sheet]);
  });

  app.get<{ Params: { businessId: string; kind: string } }>("/:businessId/:kind/export", viewer, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    const query = listDocumentsQuerySchema.merge(exportFormatSchema).parse(request.query);
    const [business, { items }] = await Promise.all([
      businessService.getBusiness(request.params.businessId),
      documents.listDocuments(request.params.businessId, kind, query, { page: 1, pageSize: EXPORT_ROW_LIMIT }),
    ]);
    const settings = businessService.documentSettings(business, kind);
    const statusLabels = labelsOf(businessService.businessStatuses(business, kind));
    const noun = DOCUMENT_WORDING[kind].noun;

    const list: ExportSheet<DocView> = {
      name: `${noun}s`,
      rows: items,
      columns: [
        { label: `${noun} number`, value: (d) => d.number },
        { label: "Status", value: (d) => statusLabels.get(d.status) ?? d.status },
        { label: "Updated", value: (d) => d.updated },
        { label: "Client", value: (d) => d.clientName },
        { label: "Client email", value: (d) => d.clientEmail },
        { label: "Client phone", value: (d) => d.clientPhone },
        { label: "Client address", value: (d) => d.clientAddress },
        { label: DOCUMENT_WORDING[kind].dateLabel, value: (d) => date(d.issueDate) },
        { label: DOCUMENT_WORDING[kind].endLabel, value: (d) => date(d.dueDate) },
        { label: "Payment method", value: (d) => d.paymentMethod },
        { label: "Currency", value: (d) => d.currency },
        { label: "Subtotal", value: (d) => d.subtotal, numFmt: MONEY_FORMAT },
        { label: "Discount", value: (d) => d.discount, numFmt: MONEY_FORMAT },
        { label: `${settings.taxLabel} (%)`, value: (d) => d.taxRate },
        { label: settings.taxLabel, value: (d) => d.taxAmount, numFmt: MONEY_FORMAT },
        { label: "Total", value: (d) => d.total, numFmt: MONEY_FORMAT },
        { label: "Amount paid", value: (d) => d.amountPaid, numFmt: MONEY_FORMAT },
        { label: "Balance", value: (d) => Math.round((d.total - d.amountPaid) * 100) / 100, numFmt: MONEY_FORMAT },
        ...settings.customFields.map((f) => ({ label: f.label, value: (d: DocView) => d.customFields[f.key] ?? "" })),
        { label: "Last sent to", value: (d) => d.lastSentTo },
        { label: "Sent at", value: (d) => date(d.sentAt) },
        { label: "Created", value: (d) => date(d.createdAt) },
      ],
    };
    const lines: ExportSheet<ItemRow> = {
      name: "Line items",
      rows: items.flatMap((d) => d.items.map((item) => ({ ...item, number: d.number, clientName: d.clientName }))),
      columns: [
        { label: `${noun} number`, value: (r) => r.number },
        { label: "Client", value: (r) => r.clientName },
        { label: "Description", value: (r) => r.description },
        { label: "Quantity", value: (r) => r.quantity },
        { label: "Unit price", value: (r) => r.unitPrice, numFmt: MONEY_FORMAT },
        { label: "Amount", value: (r) => lineAmount(r), numFmt: MONEY_FORMAT },
      ],
    };
    return sendTableExport(reply, query.format, `${business.name} ${noun.toLowerCase()}s`, [list, lines]);
  });

  app.get<{ Params: { businessId: string } }>("/:businessId/analytics/export", viewer, async (request, reply) => {
    const { format } = exportFormatSchema.parse(request.query);
    const business = await businessService.getBusiness(request.params.businessId);
    const form = await businessService.findOrderForm(business.id);
    const [invoices, receipts, orders] = await Promise.all([
      documents.documentAnalytics(business.id, "invoice"),
      documents.documentAnalytics(business.id, "receipt"),
      form ? registrationsRepo.getProgramStats(form.id) : null,
    ]);

    const statusSheet = (name: string, data: Analytics, kind: "invoice" | "receipt"): ExportSheet<Analytics["byStatus"][number]> => ({
      name,
      rows: data.byStatus,
      columns: [
        { label: "Status", value: (s) => labelsOf(businessService.businessStatuses(business, kind)).get(s.status) ?? s.status },
        { label: "Count", value: (s) => s.count },
        { label: "Share (%)", value: (s) => (data.count ? Math.round((s.count / data.count) * 100) : 0) },
        { label: "Amount", value: (s) => s.total, numFmt: MONEY_FORMAT },
        { label: "Paid", value: (s) => s.paid, numFmt: MONEY_FORMAT },
      ],
    });
    const summary: ExportSheet<{ label: string; value: number }> = {
      name: "Summary",
      rows: [
        { label: "Orders", value: orders?.total ?? 0 },
        { label: "Orders this month", value: orders?.thisMonth ?? 0 },
        { label: `Invoiced (${business.currency})`, value: invoices.total },
        { label: `Invoices paid (${business.currency})`, value: invoices.paid },
        { label: `Outstanding (${business.currency})`, value: invoices.outstanding },
        { label: `Receipts issued (${business.currency})`, value: receipts.total },
      ],
      columns: [
        { label: "Measure", value: (r) => r.label },
        { label: "Value", value: (r) => r.value },
      ],
    };
    const orderStatuses: ExportSheet<[string, number]> = {
      name: "Orders by status",
      rows: Object.entries(orders?.byStatus ?? {}),
      columns: [
        { label: "Status", value: ([status]) => labelsOf(businessService.businessStatuses(business, "order")).get(status) ?? status },
        { label: "Orders", value: ([, count]) => count },
        { label: "Share (%)", value: ([, count]) => (orders?.total ? Math.round((count / orders.total) * 100) : 0) },
      ],
    };
    const monthly: ExportSheet<Analytics["byMonth"][number] & { received: number }> = {
      name: "By month",
      rows: invoices.byMonth.map((m, i) => ({ ...m, received: receipts.byMonth[i]?.total ?? 0 })),
      columns: [
        { label: "Month", value: (m) => m.month },
        { label: "Invoices", value: (m) => m.count },
        { label: "Invoiced", value: (m) => m.total, numFmt: MONEY_FORMAT },
        { label: "Received (receipts)", value: (m) => m.received, numFmt: MONEY_FORMAT },
      ],
    };
    const clients: ExportSheet<Analytics["topClients"][number]> = {
      name: "Top clients",
      rows: invoices.topClients,
      columns: [
        { label: "Client", value: (c) => c.client },
        { label: "Invoices", value: (c) => c.count },
        { label: "Invoiced", value: (c) => c.total, numFmt: MONEY_FORMAT },
      ],
    };
    return sendTableExport(reply, format, `${business.name} analysis`, [
      summary,
      orderStatuses,
      statusSheet("Invoices by status", invoices, "invoice"),
      statusSheet("Receipts by status", receipts, "receipt"),
      monthly,
      clients,
    ]);
  });
}
