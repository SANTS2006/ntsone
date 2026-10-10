import { dateRangeConditions } from "../../lib/dateRange.js";
import { and, count, desc, eq, gte, ilike, isNull, max, or, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { businessDocuments } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { buildPaginatedResult, toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";
import {
  computeTotals,
  DOCUMENT_WORDING,
  documentPageSize,
  formatDocDate,
  formatMoney,
  renderBusinessDocument,
  type BusinessDocumentKind,
  type DocumentContent,
  type LineItem,
} from "../../shared/designs/index.js";
import { sendEmail } from "../email/service.js";
import { businessDocumentEmail } from "../email/templates.js";
import { fetchImageDataUri, LOGO_TRANSFORM, svgPagesToPdf } from "../idcards/pdf.js";
import { businessStatuses, documentSettings, getBusiness, type BusinessRow } from "./service.js";
import type { SaveDocumentInput } from "./schemas.js";

export type DocumentRow = typeof businessDocuments.$inferSelect;

const num = (value: string | number | null | undefined) => Number(value ?? 0);

/** A document as the API returns it: amounts as numbers, plus whether it has been changed since saving. */
export function toView(doc: DocumentRow) {
  return {
    ...doc,
    discount: num(doc.discount),
    taxRate: num(doc.taxRate),
    subtotal: num(doc.subtotal),
    taxAmount: num(doc.taxAmount),
    total: num(doc.total),
    amountPaid: num(doc.amountPaid),
    items: doc.items as LineItem[],
    customFields: doc.customFields as Record<string, string>,
    updated: !!doc.editedAt,
  };
}

/** New documents start on the business's first status. */
function defaultStatus(business: BusinessRow, kind: BusinessDocumentKind) {
  return businessStatuses(business, kind)[0]!.key;
}

function checkStatus(business: BusinessRow, kind: BusinessDocumentKind, status: string | undefined) {
  if (status && !businessStatuses(business, kind).some((s) => s.key === status)) throw AppError.validation(`"${status}" isn't one of this business's ${kind} statuses`);
}

function amounts(input: SaveDocumentInput) {
  const totals = computeTotals(input.items, input.discount, input.taxRate, input.amountPaid);
  return {
    items: input.items,
    discount: totals.discount.toFixed(2),
    taxRate: String(input.taxRate),
    subtotal: totals.subtotal.toFixed(2),
    taxAmount: totals.taxAmount.toFixed(2),
    total: totals.total.toFixed(2),
    amountPaid: totals.amountPaid.toFixed(2),
  };
}

export async function createDocument(businessId: string, kind: BusinessDocumentKind, input: SaveDocumentInput, userId: string) {
  const business = await getBusiness(businessId);
  checkStatus(business, kind, input.status);
  const settings = documentSettings(business, kind);

  // Numbers run 1, 2, 3... per business; a clash from two saves at once just takes the next one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const [last] = await db
      .select({ value: max(businessDocuments.sequence) })
      .from(businessDocuments)
      .where(and(eq(businessDocuments.businessId, businessId), eq(businessDocuments.kind, kind)));
    const sequence = (last?.value ?? 0) + 1;
    try {
      const [row] = await db
        .insert(businessDocuments)
        .values({
          businessId,
          kind,
          sequence,
          number: `${settings.prefix.toUpperCase()}-${String(sequence).padStart(4, "0")}`,
          status: input.status ?? defaultStatus(business, kind),
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientPhone: input.clientPhone,
          clientAddress: input.clientAddress,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          paymentMethod: input.paymentMethod,
          currency: business.currency,
          notes: input.notes,
          terms: input.terms,
          customFields: input.customFields,
          createdBy: userId,
          updatedBy: userId,
          ...amounts(input),
        })
        .returning();
      return toView(row!);
    } catch (err) {
      const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
      if (code !== "23505") throw err;
    }
  }
  throw AppError.conflict("Couldn't give this document a number. Please try again.");
}

export async function findDocument(businessId: string, kind: BusinessDocumentKind, documentId: string): Promise<DocumentRow> {
  const [row] = await db
    .select()
    .from(businessDocuments)
    .where(
      and(
        eq(businessDocuments.id, documentId),
        eq(businessDocuments.businessId, businessId),
        eq(businessDocuments.kind, kind),
        isNull(businessDocuments.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw AppError.notFound(`${DOCUMENT_WORDING[kind].noun} not found`);
  return row;
}

/** Saves changes; the document then shows as "Updated". */
export async function updateDocument(businessId: string, kind: BusinessDocumentKind, documentId: string, input: SaveDocumentInput, userId: string) {
  await findDocument(businessId, kind, documentId);
  checkStatus(await getBusiness(businessId), kind, input.status);
  const [row] = await db
    .update(businessDocuments)
    .set({
      ...(input.status ? { status: input.status } : {}),
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone,
      clientAddress: input.clientAddress,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      terms: input.terms,
      customFields: input.customFields,
      updatedBy: userId,
      editedAt: new Date(),
      updatedAt: new Date(),
      ...amounts(input),
    })
    .where(eq(businessDocuments.id, documentId))
    .returning();
  return toView(row!);
}

export async function deleteDocument(businessId: string, kind: BusinessDocumentKind, documentId: string) {
  await findDocument(businessId, kind, documentId);
  await db.update(businessDocuments).set({ deletedAt: new Date() }).where(eq(businessDocuments.id, documentId));
}

export async function listDocuments(
  businessId: string,
  kind: BusinessDocumentKind,
  query: { search?: string; status?: string; dateFrom?: Date; dateTo?: Date },
  pagination: PaginationInput,
) {
  const conditions = [eq(businessDocuments.businessId, businessId), eq(businessDocuments.kind, kind), isNull(businessDocuments.deletedAt)];
  // The date on the document itself (when it was issued).
  conditions.push(...dateRangeConditions(businessDocuments.issueDate, query));
  if (query.status) conditions.push(eq(businessDocuments.status, query.status));
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(or(ilike(businessDocuments.number, term), ilike(businessDocuments.clientName, term), ilike(businessDocuments.clientEmail, term))!);
  }
  const where = and(...conditions);
  const { limit, offset } = toOffsetLimit(pagination);
  const [rows, [total]] = await Promise.all([
    db.select().from(businessDocuments).where(where).orderBy(desc(businessDocuments.sequence)).limit(limit).offset(offset),
    db.select({ value: count() }).from(businessDocuments).where(where),
  ]);
  return buildPaginatedResult(rows.map(toView), Number(total?.value ?? 0), pagination);
}

// ---------------------------------------------------------------------------
// Rendering, PDF, and email

export function documentContent(doc: DocumentRow, business: BusinessRow): DocumentContent {
  const settings = documentSettings(business, doc.kind);
  const answers = doc.customFields as Record<string, string>;
  return {
    kind: doc.kind,
    number: doc.number,
    status: doc.status,
    updatedOn: doc.editedAt,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    paymentMethod: doc.paymentMethod,
    client: { name: doc.clientName, email: doc.clientEmail, phone: doc.clientPhone, address: doc.clientAddress },
    items: doc.items as LineItem[],
    discount: num(doc.discount),
    taxRate: num(doc.taxRate),
    amountPaid: num(doc.amountPaid),
    notes: doc.notes,
    terms: doc.terms,
    customFields: settings.customFields.map((f) => ({ label: f.label, value: answers[f.key] ?? "" })),
    currency: doc.currency,
  };
}

async function renderPages(doc: DocumentRow, business: BusinessRow) {
  const logo = await fetchImageDataUri(business.logoUrl ?? undefined, LOGO_TRANSFORM);
  return renderBusinessDocument(documentContent(doc, business), { ...business, logo }, documentSettings(business, doc.kind));
}

export function documentFileName(doc: DocumentRow, business: BusinessRow, extension: string) {
  const clean = (v: string) => v.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${clean(business.name)}-${doc.number}-${clean(doc.clientName)}.${extension}`;
}

export async function documentPdf(businessId: string, kind: BusinessDocumentKind, documentId: string) {
  const [business, doc] = await Promise.all([getBusiness(businessId), findDocument(businessId, kind, documentId)]);
  const pages = await renderPages(doc, business);
  const size = documentPageSize(documentContent(doc, business), { ...business }, documentSettings(business, doc.kind));
  return { buffer: await svgPagesToPdf(pages, size.width, size.height), fileName: documentFileName(doc, business, "pdf") };
}

/** The pages as SVG (with the logo embedded), for downloading as images in the browser. */
export async function documentSvgPages(businessId: string, kind: BusinessDocumentKind, documentId: string) {
  const [business, doc] = await Promise.all([getBusiness(businessId), findDocument(businessId, kind, documentId)]);
  return { pages: await renderPages(doc, business), fileBase: documentFileName(doc, business, "").replace(/\.$/, "") };
}

/** Emails the document as a PDF to the client (or the address given), branded with the business. */
export async function sendDocument(businessId: string, kind: BusinessDocumentKind, documentId: string, input: { email?: string; message?: string }) {
  const [business, doc] = await Promise.all([getBusiness(businessId), findDocument(businessId, kind, documentId)]);
  const to = input.email?.trim() || doc.clientEmail;
  if (!to) throw AppError.validation("Enter the email address to send this to");

  const pages = await renderPages(doc, business);
  const size = documentPageSize(documentContent(doc, business), { ...business }, documentSettings(business, doc.kind));
  const pdf = await svgPagesToPdf(pages, size.width, size.height);
  const totals = computeTotals(doc.items as LineItem[], num(doc.discount), num(doc.taxRate), num(doc.amountPaid));
  const email = businessDocumentEmail({
    kind,
    business: { name: business.name, logoUrl: business.logoUrl, email: business.email, phone: business.phone, brandColor: business.brandColor },
    clientName: doc.clientName,
    number: doc.number,
    issueDate: formatDocDate(doc.issueDate),
    dueDate: kind !== "receipt" && doc.dueDate ? formatDocDate(doc.dueDate) : null,
    total: formatMoney(totals.total, doc.currency),
    balance: totals.balance > 0 && kind === "invoice" ? formatMoney(totals.balance, doc.currency) : null,
    updated: !!doc.editedAt,
    message: input.message,
  });
  const sent = await sendEmail({
    to,
    toName: doc.clientName,
    subject: email.subject,
    html: email.html,
    replyTo: business.email ? { email: business.email, name: business.name } : undefined,
    fromName: business.name,
    attachments: [{ name: documentFileName(doc, business, "pdf"), content: pdf.toString("base64") }],
  });
  if (!sent) throw AppError.validation("The email couldn't be sent. Please try again in a moment.");

  const [row] = await db
    .update(businessDocuments)
    .set({
      sentAt: new Date(),
      lastSentTo: to,
      // A draft invoice becomes "sent"; a receipt becomes "sent" unless it was voided.
      ...((doc.status === "draft" || doc.status === "issued") && businessStatuses(business, kind).some((s) => s.key === "sent") ? { status: "sent" } : {}),
    })
    .where(eq(businessDocuments.id, doc.id))
    .returning();
  return toView(row!);
}

// ---------------------------------------------------------------------------
// Analysis

/** Counts and amounts by status, the last 12 months, and the biggest clients. */
export async function documentAnalytics(businessId: string, kind: BusinessDocumentKind) {
  const scope = and(eq(businessDocuments.businessId, businessId), eq(businessDocuments.kind, kind), isNull(businessDocuments.deletedAt));
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 11, 1);
  since.setUTCHours(0, 0, 0, 0);

  const [byStatus, byMonth, topClients] = await Promise.all([
    db
      .select({
        status: businessDocuments.status,
        count: count(),
        total: sql<string>`coalesce(sum(${businessDocuments.total}), 0)`,
        paid: sql<string>`coalesce(sum(${businessDocuments.amountPaid}), 0)`,
      })
      .from(businessDocuments)
      .where(scope)
      .groupBy(businessDocuments.status),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${businessDocuments.issueDate}), 'YYYY-MM')`,
        count: count(),
        total: sql<string>`coalesce(sum(${businessDocuments.total}), 0)`,
      })
      .from(businessDocuments)
      .where(and(scope, gte(businessDocuments.issueDate, since)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ client: businessDocuments.clientName, count: count(), total: sql<string>`coalesce(sum(${businessDocuments.total}), 0)` })
      .from(businessDocuments)
      .where(scope)
      .groupBy(businessDocuments.clientName)
      .orderBy(sql`3 desc`)
      .limit(5),
  ]);

  const statuses = byStatus.map((s) => ({ status: s.status, count: Number(s.count), total: num(s.total), paid: num(s.paid) }));
  const live = statuses.filter((s) => s.status !== "cancelled" && s.status !== "void");
  const total = live.reduce((sum, s) => sum + s.total, 0);
  const paid = kind === "quotation" ? statuses.filter((s) => s.status === "accepted").reduce((sum, s) => sum + s.total, 0) : kind === "receipt" ? live.reduce((sum, s) => sum + s.paid, 0) : statuses.filter((s) => s.status === "paid").reduce((sum, s) => sum + s.total, 0) + statuses.filter((s) => s.status === "partially_paid").reduce((sum, s) => sum + s.paid, 0);

  // Fill the months with no documents so the chart has a bar for every month.
  const months: { month: string; count: number; total: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(since);
    d.setUTCMonth(since.getUTCMonth() + i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const found = byMonth.find((m) => m.month === key);
    months.push({ month: key, count: Number(found?.count ?? 0), total: num(found?.total) });
  }

  return {
    count: statuses.reduce((sum, s) => sum + s.count, 0),
    total,
    paid,
    outstanding: kind === "invoice" ? Math.max(0, total - paid) : 0,
    byStatus: statuses,
    byMonth: months,
    topClients: topClients.map((c) => ({ client: c.client, count: Number(c.count), total: num(c.total) })),
  };
}
