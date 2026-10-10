import type { FastifyReply, FastifyRequest } from "fastify";
import { attachmentDisposition } from "../../lib/downloadName.js";
import { sendSuccess } from "../../lib/response.js";
import * as idCardService from "./service.js";
import { documentOverridesSchema, idCardConfigSchema } from "./schemas.js";

interface DocumentQuery {
  format?: string;
  side?: string;
}

/** `?format=svg` returns the rendered card or ticket as an image instead of the PDF download. */
export function wantsSvg(request: FastifyRequest): { svg: boolean; side: idCardService.DocumentSide } {
  const { format, side } = (request.query ?? {}) as DocumentQuery;
  return { svg: format === "svg", side: side === "back" ? "back" : "front" };
}

export function sendSvg(reply: FastifyReply, { svg, fileName, sides }: idCardService.RenderedImage) {
  reply.header("Content-Type", "image/svg+xml; charset=utf-8");
  // The name the browser should give the image when it's saved as a PNG.
  reply.header("X-Download-Name", encodeURIComponent(fileName));
  reply.header("X-Document-Sides", String(sides ?? 1));
  // Never cached: a card or ticket changes as soon as an admin edits its settings or a registrant's role.
  reply.header("Cache-Control", "no-store");
  // Opened on its own, the image may only show itself: no scripts, no outside requests.
  reply.header("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  return reply.send(svg);
}

export async function getConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const result = await idCardService.getConfig(programId);
  return sendSuccess(reply, result);
}

export async function updateConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const input = idCardConfigSchema.parse(request.body);
  const config = await idCardService.updateConfig(programId, input);
  return sendSuccess(reply, config, "ID card design updated");
}

export function sendPdf(reply: FastifyReply, { pdf, fileName }: idCardService.GeneratedDocument) {
  reply.header("Content-Type", "application/pdf");
  reply.header("Content-Disposition", attachmentDisposition(fileName));
  return reply.send(pdf);
}

export async function updateDocumentOverridesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId, registrationId } = request.params as { programId: string; registrationId: string };
  const input = documentOverridesSchema.parse(request.body);
  const overrides = await idCardService.updateDocumentOverrides(programId, registrationId, input);
  return sendSuccess(reply, overrides, "ID card updated for this registrant");
}

export async function downloadAdminIdCardHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId, registrationId } = request.params as { programId: string; registrationId: string };
  const { svg, side } = wantsSvg(request);
  if (svg) return sendSvg(reply, await idCardService.svgForRegistrationInProgram(programId, registrationId, side));
  return sendPdf(reply, await idCardService.generateForRegistrationInProgram(programId, registrationId));
}

export async function downloadPublicIdCardHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug, registrationNumber } = request.params as { slug: string; registrationNumber: string };
  const { svg, side } = wantsSvg(request);
  if (svg) return sendSvg(reply, await idCardService.svgForPublicRegistration(slug, registrationNumber, side));
  return sendPdf(reply, await idCardService.generateForPublicRegistration(slug, registrationNumber));
}

const DOCUMENT_TYPES = { "id-card": "id_card", ticket: "ticket" } as const;

export async function verifyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug, registrationNumber } = request.params as { slug: string; registrationNumber: string };
  const { doc } = (request.query ?? {}) as { doc?: string };
  const result = await idCardService.verifyRegistration(slug, registrationNumber, {
    documentType: DOCUMENT_TYPES[doc as keyof typeof DOCUMENT_TYPES] ?? "link",
    user: request.user,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
  });
  return sendSuccess(reply, result);
}
