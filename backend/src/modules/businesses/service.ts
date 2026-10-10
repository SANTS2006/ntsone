import { and, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import QRCode from "qrcode";
import slugify from "slugify";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { businessDocuments, businesses, businessMembers, programs, registrations } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { buildPaginatedResult, toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";
import { resolveAllStatuses, resolveDocumentSettings, resolveStatuses, type BusinessDocumentKind, type DocumentSettings, type StatusKind } from "../../shared/designs/index.js";
import * as programsRepo from "../programs/repository.js";
import type { AuthenticatedUser } from "../users/types.js";
import { listAccessibleBusinessIds } from "./access.js";
import type { CreateBusinessInput, UpdateBusinessInput } from "./schemas.js";

export type BusinessRow = typeof businesses.$inferSelect;

async function uniqueSlug(name: string) {
  const base = slugify(name, { lower: true, strict: true }).slice(0, 160) || "business";
  const taken = async (slug: string) =>
    (await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1)).length > 0;
  let candidate = base;
  for (let n = 2; await taken(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

async function uniqueProgramSlug(base: string) {
  let candidate = base;
  for (let n = 2; await programsRepo.slugExists(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

export async function getBusiness(businessId: string): Promise<BusinessRow> {
  const [row] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound("Business not found");
  return row;
}

/** The business's order page: a program of kind "order_form" that reuses the form tools. */
export async function findOrderForm(businessId: string) {
  const [row] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.businessId, businessId), eq(programs.kind, "order_form"), isNull(programs.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function createBusiness(user: AuthenticatedUser, input: CreateBusinessInput) {
  let tenantId = user.tenantId;
  if (user.role === "super_admin") {
    if (!input.tenantId) throw AppError.validation("Choose the account this business belongs to");
    tenantId = input.tenantId;
  }
  if (!tenantId || user.role === "viewer") throw AppError.forbidden("This account cannot create businesses");

  const slug = await uniqueSlug(input.name);
  const [business] = await db
    .insert(businesses)
    .values({ tenantId, createdBy: user.id, name: input.name, slug, description: input.description, email: input.email, phone: input.phone, address: input.address })
    .returning();

  // Every business starts with its own order form, ready to build and publish.
  await programsRepo.insertProgram({
    name: `${input.name} Orders`,
    slug: await uniqueProgramSlug(`${slug}-order`),
    shortDescription: `Place an order with ${input.name}`,
    kind: "order_form",
    businessId: business!.id,
    tenantId,
    createdBy: user.id,
    registrationNumberConfig: { prefix: "ORD", separator: "-", includeYear: true, digits: 5, startAt: 1 },
  });

  if (user.role !== "admin" && user.role !== "super_admin") {
    await db.insert(businessMembers).values({ userId: user.id, businessId: business!.id, roleOnBusiness: "admin" }).onConflictDoNothing();
  }
  return business!;
}

export async function listBusinesses(user: AuthenticatedUser, query: { page: number; pageSize: number; search?: string }) {
  const ids = await listAccessibleBusinessIds(user);
  const pagination: PaginationInput = { page: query.page, pageSize: query.pageSize };
  const conditions = [isNull(businesses.deletedAt)];
  if (ids !== "all") {
    if (ids.length === 0) return buildPaginatedResult([], 0, pagination);
    conditions.push(inArray(businesses.id, ids));
  }
  if (query.search) conditions.push(or(ilike(businesses.name, `%${query.search}%`), ilike(businesses.slug, `%${query.search}%`))!);
  const where = and(...conditions);
  const { limit, offset } = toOffsetLimit(pagination);
  const [rows, [total]] = await Promise.all([
    db.select().from(businesses).where(where).orderBy(desc(businesses.createdAt)).limit(limit).offset(offset),
    db.select({ value: count() }).from(businesses).where(where),
  ]);

  const businessIds = rows.map((r) => r.id);
  const [orderCounts, documentCounts] = businessIds.length
    ? await Promise.all([
        db
          .select({ businessId: programs.businessId, value: count(registrations.id) })
          .from(programs)
          .leftJoin(registrations, eq(registrations.programId, programs.id))
          .where(and(inArray(programs.businessId, businessIds), eq(programs.kind, "order_form")))
          .groupBy(programs.businessId),
        db
          .select({ businessId: businessDocuments.businessId, kind: businessDocuments.kind, value: count() })
          .from(businessDocuments)
          .where(and(inArray(businessDocuments.businessId, businessIds), isNull(businessDocuments.deletedAt)))
          .groupBy(businessDocuments.businessId, businessDocuments.kind),
      ])
    : [[], []];

  const items = rows.map((b) => ({
    ...b,
    orderCount: Number(orderCounts.find((o) => o.businessId === b.id)?.value ?? 0),
    invoiceCount: Number(documentCounts.find((d) => d.businessId === b.id && d.kind === "invoice")?.value ?? 0),
    receiptCount: Number(documentCounts.find((d) => d.businessId === b.id && d.kind === "receipt")?.value ?? 0),
    quotationCount: Number(documentCounts.find((d) => d.businessId === b.id && d.kind === "quotation")?.value ?? 0),
  }));
  return buildPaginatedResult(items, Number(total?.value ?? 0), pagination);
}

export async function updateBusiness(businessId: string, input: UpdateBusinessInput) {
  await getBusiness(businessId);
  const [row] = await db.update(businesses).set({ ...input, updatedAt: new Date() }).where(eq(businesses.id, businessId)).returning();
  return row!;
}

export async function deleteBusiness(businessId: string) {
  await getBusiness(businessId);
  const now = new Date();
  await db.update(businesses).set({ deletedAt: now }).where(eq(businesses.id, businessId));
  // Its order page goes too.
  await db.update(programs).set({ deletedAt: now, registrationEnabled: false }).where(eq(programs.businessId, businessId));
}

export function documentSettings(business: BusinessRow, kind: BusinessDocumentKind): DocumentSettings {
  const stored = kind === "invoice" ? business.invoiceSettings : kind === "receipt" ? business.receiptSettings : business.quotationSettings;
  return resolveDocumentSettings(kind, stored, business.brandColor);
}

export async function saveDocumentSettings(businessId: string, kind: BusinessDocumentKind, settings: DocumentSettings) {
  await getBusiness(businessId);
  const [row] = await db
    .update(businesses)
    .set({
      ...(kind === "invoice" ? { invoiceSettings: settings } : kind === "receipt" ? { receiptSettings: settings } : { quotationSettings: settings }),
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, businessId))
    .returning();
  return documentSettings(row!, kind);
}

/** The statuses this business uses for orders, invoices, and receipts. */
export function businessStatuses(business: Pick<BusinessRow, "statusConfig">, kind: StatusKind) {
  return resolveStatuses(business.statusConfig, kind);
}

export function allBusinessStatuses(business: Pick<BusinessRow, "statusConfig">) {
  return resolveAllStatuses(business.statusConfig);
}

export async function saveStatusConfig(businessId: string, config: Partial<Record<StatusKind, { key: string; label: string; color: string }[]>>) {
  await getBusiness(businessId);
  const [row] = await db.update(businesses).set({ statusConfig: config, updatedAt: new Date() }).where(eq(businesses.id, businessId)).returning();
  return row!;
}

export function orderFormUrl(slug: string) {
  return `${env.APP_URL.replace(/\/+$/, "")}/order/${encodeURIComponent(slug)}`;
}

/** The live order page link and QR code, once the order form is published and accepting orders. */
export async function orderShareInfo(businessId: string) {
  const form = await findOrderForm(businessId);
  if (!form) throw AppError.notFound("This business has no order form");
  const url = orderFormUrl(form.slug);
  const live = form.status === "published";
  return { url, live, acceptingOrders: live && form.registrationEnabled, qrCodeDataUrl: live ? await QRCode.toDataURL(url, { margin: 1, width: 320 }) : null };
}
