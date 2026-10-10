import { dateRangeConditions } from "../../lib/dateRange.js";
import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { businessCards } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { buildPaginatedResult, toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";
import { CARD_HEIGHT, CARD_WIDTH, renderBusinessCard, type CardContent, type CardTemplate } from "../../shared/designs/index.js";
import { sendEmail } from "../email/service.js";
import { businessCardEmail } from "../email/templates.js";
import { fetchImageDataUri, LOGO_TRANSFORM, PHOTO_TRANSFORM, qrMatrix, svgPagesToPdf } from "../idcards/pdf.js";
import type { SaveCardInput } from "./schemas.js";
import { getBusiness, type BusinessRow } from "./service.js";

export type CardRow = typeof businessCards.$inferSelect;

export async function findCard(businessId: string, cardId: string): Promise<CardRow> {
  const [row] = await db
    .select()
    .from(businessCards)
    .where(and(eq(businessCards.id, cardId), eq(businessCards.businessId, businessId), isNull(businessCards.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound("Card not found");
  return row;
}

export async function listCards(businessId: string, query: { search?: string; dateFrom?: Date; dateTo?: Date }, pagination: PaginationInput) {
  const conditions = [eq(businessCards.businessId, businessId), isNull(businessCards.deletedAt), ...dateRangeConditions(businessCards.createdAt, query)];
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(or(ilike(businessCards.name, term), ilike(businessCards.jobTitle, term), ilike(businessCards.email, term))!);
  }
  const where = and(...conditions);
  const { limit, offset } = toOffsetLimit(pagination);
  const [rows, [total]] = await Promise.all([
    db.select().from(businessCards).where(where).orderBy(desc(businessCards.createdAt)).limit(limit).offset(offset),
    db.select({ value: count() }).from(businessCards).where(where),
  ]);
  return buildPaginatedResult(rows, Number(total?.value ?? 0), pagination);
}

export async function createCard(businessId: string, input: SaveCardInput, userId: string) {
  await getBusiness(businessId);
  const [row] = await db.insert(businessCards).values({ ...input, businessId, createdBy: userId }).returning();
  return row!;
}

export async function updateCard(businessId: string, cardId: string, input: SaveCardInput) {
  await findCard(businessId, cardId);
  const [row] = await db.update(businessCards).set({ ...input, updatedAt: new Date() }).where(eq(businessCards.id, cardId)).returning();
  return row!;
}

export async function deleteCard(businessId: string, cardId: string) {
  await findCard(businessId, cardId);
  await db.update(businessCards).set({ deletedAt: new Date() }).where(eq(businessCards.id, cardId));
}

/** The card's words and pictures, with the logo and photo embedded and a QR code of the website. */
async function cardContent(card: CardRow, business: BusinessRow): Promise<CardContent> {
  const [logo, photo] = await Promise.all([
    fetchImageDataUri(business.logoUrl ?? undefined, LOGO_TRANSFORM),
    fetchImageDataUri(card.photoUrl ?? undefined, PHOTO_TRANSFORM),
  ]);
  const site = card.website?.trim();
  const target = site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : null;
  return {
    name: card.name,
    title: card.jobTitle,
    company: card.company,
    phone: card.phone,
    email: card.email,
    website: card.website,
    address: card.address,
    tagline: card.tagline,
    photo,
    logo,
    qr: card.showQr && target ? qrMatrix(target) : null,
  };
}

async function renderPages(card: CardRow, business: BusinessRow) {
  return renderBusinessCard(await cardContent(card, business), {
    template: card.template as CardTemplate,
    primaryColor: card.primaryColor,
    secondaryColor: card.secondaryColor,
  });
}

export function cardFileName(card: CardRow, business: BusinessRow, extension: string) {
  const clean = (v: string) => v.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${clean(business.name)}-card-${clean(card.name)}.${extension}`;
}

export async function cardPdf(businessId: string, cardId: string) {
  const [business, card] = await Promise.all([getBusiness(businessId), findCard(businessId, cardId)]);
  const pages = await renderPages(card, business);
  return { buffer: await svgPagesToPdf(pages, CARD_WIDTH, CARD_HEIGHT), fileName: cardFileName(card, business, "pdf") };
}

/** Both sides as SVG (logo and photo embedded), for printing or saving as images in the browser. */
export async function cardSvgPages(businessId: string, cardId: string) {
  const [business, card] = await Promise.all([getBusiness(businessId), findCard(businessId, cardId)]);
  return { pages: await renderPages(card, business), fileBase: cardFileName(card, business, "").replace(/\.$/, "") };
}

export async function sendCard(businessId: string, cardId: string, input: { email: string; recipientName?: string; message?: string }) {
  const [business, card] = await Promise.all([getBusiness(businessId), findCard(businessId, cardId)]);
  const pages = await renderPages(card, business);
  const pdf = await svgPagesToPdf(pages, CARD_WIDTH, CARD_HEIGHT);
  const email = businessCardEmail({
    business: { name: business.name, logoUrl: business.logoUrl, email: business.email, phone: business.phone, brandColor: business.brandColor },
    recipientName: input.recipientName,
    cardName: card.name,
    cardTitle: card.jobTitle,
    message: input.message,
  });
  const sent = await sendEmail({
    to: input.email,
    toName: input.recipientName ?? input.email,
    subject: email.subject,
    html: email.html,
    replyTo: business.email ? { email: business.email, name: business.name } : undefined,
    fromName: business.name,
    attachments: [{ name: cardFileName(card, business, "pdf"), content: pdf.toString("base64") }],
  });
  if (!sent) throw AppError.validation("The email couldn't be sent. Please try again in a moment.");
  const [row] = await db.update(businessCards).set({ sentAt: new Date(), lastSentTo: input.email }).where(eq(businessCards.id, card.id)).returning();
  return row!;
}
