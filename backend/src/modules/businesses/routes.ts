import type { FastifyInstance, FastifyRequest } from "fastify";
import { attachmentDisposition } from "../../lib/downloadName.js";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { requireRole } from "../../middleware/authorize.js";
import { DOCUMENT_WORDING, type BusinessDocumentKind } from "../../shared/designs/index.js";
import { recordAudit } from "../audit/recorder.js";
import * as registrationsRepo from "../registrations/repository.js";
import { createUploadSignature } from "../uploads/service.js";
import { getBusinessRole, requireBusinessAccess } from "./access.js";
import * as cards from "./cards.js";
import * as documents from "./documents.js";
import {
  createBusinessSchema,
  documentSettingsSchema,
  listBusinessesQuerySchema,
  listCardsQuerySchema,
  saveCardSchema,
  sendCardSchema,
  listDocumentsQuerySchema,
  saveDocumentSchema,
  sendDocumentSchema,
  statusConfigSchema,
  updateBusinessSchema,
} from "./schemas.js";
import * as businessService from "./service.js";
import { businessExportRoutes } from "./exports.js";

type BusinessParams = { businessId: string };
type KindParams = BusinessParams & { kind: string };
type DocParams = KindParams & { documentId: string };

/** "invoices" / "receipts" in the URL. */
function kindOf(value: string): BusinessDocumentKind {
  if (value === "invoices") return "invoice";
  if (value === "receipts") return "receipt";
  if (value === "quotations") return "quotation";
  throw AppError.notFound("Not found");
}

async function audit(request: FastifyRequest, action: string, entityType: string, entityId: string) {
  await recordAudit({ actorUserId: request.user?.id, action, entityType, entityId, ipAddress: request.ip });
}

/** The business with its order form's state and the signed-in user's role. */
async function businessView(request: FastifyRequest, business: businessService.BusinessRow) {
  const [myRole, orderForm] = await Promise.all([
    request.user ? getBusinessRole(request.user, business.id) : null,
    businessService.findOrderForm(business.id),
  ]);
  return {
    ...business,
    myRole,
    invoiceSettings: businessService.documentSettings(business, "invoice"),
    receiptSettings: businessService.documentSettings(business, "receipt"),
    quotationSettings: businessService.documentSettings(business, "quotation"),
    statusConfig: businessService.allBusinessStatuses(business),
    orderForm: orderForm
      ? {
          id: orderForm.id,
          slug: orderForm.slug,
          status: orderForm.status,
          registrationEnabled: orderForm.registrationEnabled,
          notifyOnRegistration: orderForm.notifyOnRegistration,
        }
      : null,
  };
}

export async function businessRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requireBusinessAccess("viewer") };
  const admin = { preHandler: requireBusinessAccess("admin") };

  await app.register(businessExportRoutes);

  app.get("/", async (request, reply) => {
    return sendSuccess(reply, await businessService.listBusinesses(request.user!, listBusinessesQuerySchema.parse(request.query)));
  });

  app.post("/", { preHandler: requireRole("super_admin", "admin", "program_admin") }, async (request, reply) => {
    const business = await businessService.createBusiness(request.user!, createBusinessSchema.parse(request.body));
    await audit(request, "business.create", "business", business.id);
    return sendSuccess(reply, await businessView(request, business), "Business created", 201);
  });

  app.get<{ Params: BusinessParams }>("/:businessId", viewer, async (request, reply) => {
    return sendSuccess(reply, await businessView(request, await businessService.getBusiness(request.params.businessId)));
  });

  app.patch<{ Params: BusinessParams }>("/:businessId", admin, async (request, reply) => {
    const business = await businessService.updateBusiness(request.params.businessId, updateBusinessSchema.parse(request.body));
    await audit(request, "business.update", "business", business.id);
    return sendSuccess(reply, await businessView(request, business), "Business updated");
  });

  app.delete<{ Params: BusinessParams }>("/:businessId", admin, async (request, reply) => {
    await businessService.deleteBusiness(request.params.businessId);
    await audit(request, "business.delete", "business", request.params.businessId);
    return sendSuccess(reply, null, "Business deleted");
  });

  app.post<{ Params: BusinessParams }>("/:businessId/uploads/signature", admin, async (request, reply) => {
    return sendSuccess(reply, createUploadSignature(`businesses/${request.params.businessId}`));
  });

  app.get<{ Params: BusinessParams }>("/:businessId/order-form/share", viewer, async (request, reply) => {
    return sendSuccess(reply, await businessService.orderShareInfo(request.params.businessId));
  });

  /** Orders, invoices, and receipts at a glance. */
  app.get<{ Params: BusinessParams }>("/:businessId/analytics", viewer, async (request, reply) => {
    const form = await businessService.findOrderForm(request.params.businessId);
    const [invoices, receipts, quotations, orders] = await Promise.all([
      documents.documentAnalytics(request.params.businessId, "invoice"),
      documents.documentAnalytics(request.params.businessId, "receipt"),
      documents.documentAnalytics(request.params.businessId, "quotation"),
      form ? registrationsRepo.getProgramStats(form.id) : null,
    ]);
    return sendSuccess(reply, { invoices, receipts, quotations, orders });
  });

  // How invoices and receipts look and which extra fields they ask for.
  app.put<{ Params: BusinessParams }>("/:businessId/statuses", admin, async (request, reply) => {
    const business = await businessService.saveStatusConfig(request.params.businessId, statusConfigSchema.parse(request.body));
    await audit(request, "business.statuses_update", "business", business.id);
    return sendSuccess(reply, await businessView(request, business), "Statuses saved");
  });

  app.put<{ Params: KindParams }>("/:businessId/settings/:kind", admin, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    const settings = await businessService.saveDocumentSettings(request.params.businessId, kind, documentSettingsSchema.parse(request.body));
    await audit(request, `business.${kind}_settings_update`, "business", request.params.businessId);
    return sendSuccess(reply, settings, "Settings saved");
  });

  // Invoices and receipts. Viewers can create, edit, print, and send them too.
  // Business cards. These fixed paths win over the generic /:kind routes below.
  type CardParams = BusinessParams & { cardId: string };
  app.get<{ Params: BusinessParams }>("/:businessId/cards", viewer, async (request, reply) => {
    const query = listCardsQuerySchema.parse(request.query);
    return sendSuccess(reply, await cards.listCards(request.params.businessId, query, query));
  });
  app.post<{ Params: BusinessParams }>("/:businessId/cards", viewer, async (request, reply) => {
    const card = await cards.createCard(request.params.businessId, saveCardSchema.parse(request.body), request.user!.id);
    await audit(request, "business.card_create", "business_card", card.id);
    return sendSuccess(reply, card, "Card saved", 201);
  });
  app.get<{ Params: CardParams }>("/:businessId/cards/:cardId", viewer, async (request, reply) => {
    return sendSuccess(reply, await cards.findCard(request.params.businessId, request.params.cardId));
  });
  app.put<{ Params: CardParams }>("/:businessId/cards/:cardId", viewer, async (request, reply) => {
    const card = await cards.updateCard(request.params.businessId, request.params.cardId, saveCardSchema.parse(request.body));
    await audit(request, "business.card_update", "business_card", card.id);
    return sendSuccess(reply, card, "Card updated");
  });
  app.delete<{ Params: CardParams }>("/:businessId/cards/:cardId", admin, async (request, reply) => {
    await cards.deleteCard(request.params.businessId, request.params.cardId);
    await audit(request, "business.card_delete", "business_card", request.params.cardId);
    return sendSuccess(reply, null, "Card deleted");
  });
  app.get<{ Params: CardParams }>("/:businessId/cards/:cardId/pdf", viewer, async (request, reply) => {
    const { buffer, fileName } = await cards.cardPdf(request.params.businessId, request.params.cardId);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", attachmentDisposition(fileName))
      .header("X-Download-Name", encodeURIComponent(fileName))
      .header("Cache-Control", "no-store")
      .send(buffer);
  });
  app.get<{ Params: CardParams }>("/:businessId/cards/:cardId/pages", viewer, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await cards.cardSvgPages(request.params.businessId, request.params.cardId));
  });
  app.post<{ Params: CardParams }>(
    "/:businessId/cards/:cardId/send",
    { preHandler: requireBusinessAccess("viewer"), config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const card = await cards.sendCard(request.params.businessId, request.params.cardId, sendCardSchema.parse(request.body));
      await audit(request, "business.card_send", "business_card", card.id);
      return sendSuccess(reply, card, "Card sent");
    },
  );

  app.get<{ Params: KindParams }>("/:businessId/:kind", viewer, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    const query = listDocumentsQuerySchema.parse(request.query);
    return sendSuccess(reply, await documents.listDocuments(request.params.businessId, kind, query, query));
  });

  app.post<{ Params: KindParams }>("/:businessId/:kind", viewer, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    const doc = await documents.createDocument(request.params.businessId, kind, saveDocumentSchema.parse(request.body), request.user!.id);
    await audit(request, `business.${kind}_create`, kind, doc.id);
    return sendSuccess(reply, doc, `${DOCUMENT_WORDING[kind].noun} saved`, 201);
  });

  app.get<{ Params: DocParams }>("/:businessId/:kind/:documentId", viewer, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    return sendSuccess(reply, documents.toView(await documents.findDocument(request.params.businessId, kind, request.params.documentId)));
  });

  app.put<{ Params: DocParams }>("/:businessId/:kind/:documentId", viewer, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    const doc = await documents.updateDocument(
      request.params.businessId,
      kind,
      request.params.documentId,
      saveDocumentSchema.parse(request.body),
      request.user!.id,
    );
    await audit(request, `business.${kind}_update`, kind, doc.id);
    return sendSuccess(reply, doc, `${DOCUMENT_WORDING[kind].noun} updated`);
  });

  app.delete<{ Params: DocParams }>("/:businessId/:kind/:documentId", admin, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    await documents.deleteDocument(request.params.businessId, kind, request.params.documentId);
    await audit(request, `business.${kind}_delete`, kind, request.params.documentId);
    return sendSuccess(reply, null, "Deleted");
  });

  app.get<{ Params: DocParams }>("/:businessId/:kind/:documentId/pdf", viewer, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    const { buffer, fileName } = await documents.documentPdf(request.params.businessId, kind, request.params.documentId);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", attachmentDisposition(fileName))
      .header("Cache-Control", "no-store")
      .send(buffer);
  });

  /** The pages as SVG, with the logo embedded, for saving as images. */
  app.get<{ Params: DocParams }>("/:businessId/:kind/:documentId/pages", viewer, async (request, reply) => {
    const kind = kindOf(request.params.kind);
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await documents.documentSvgPages(request.params.businessId, kind, request.params.documentId));
  });

  app.post<{ Params: DocParams }>(
    "/:businessId/:kind/:documentId/send",
    { ...viewer, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const kind = kindOf(request.params.kind);
      const doc = await documents.sendDocument(request.params.businessId, kind, request.params.documentId, sendDocumentSchema.parse(request.body ?? {}));
      await audit(request, `business.${kind}_send`, kind, doc.id);
      return sendSuccess(reply, doc, `Sent to ${doc.lastSentTo}`);
    },
  );
}
