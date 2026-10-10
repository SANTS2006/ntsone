import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../lib/response.js";
import { sendPdf, sendSvg, wantsSvg } from "../idcards/controller.js";
import { ticketConfigSchema } from "./schemas.js";
import * as ticketService from "./service.js";

export async function getTicketConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  return sendSuccess(reply, await ticketService.getConfig(programId));
}

export async function updateTicketConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const input = ticketConfigSchema.parse(request.body);
  return sendSuccess(reply, await ticketService.updateConfig(programId, input), "Ticket design updated");
}

export async function downloadAdminTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId, registrationId } = request.params as { programId: string; registrationId: string };
  const { svg, side } = wantsSvg(request);
  if (svg) return sendSvg(reply, await ticketService.svgForRegistrationInProgram(programId, registrationId, side));
  return sendPdf(reply, await ticketService.generateForRegistrationInProgram(programId, registrationId));
}

export async function downloadPublicTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug, registrationNumber } = request.params as { slug: string; registrationNumber: string };
  const { svg, side } = wantsSvg(request);
  if (svg) return sendSvg(reply, await ticketService.svgForPublicRegistration(slug, registrationNumber, side));
  return sendPdf(reply, await ticketService.generateForPublicRegistration(slug, registrationNumber));
}
