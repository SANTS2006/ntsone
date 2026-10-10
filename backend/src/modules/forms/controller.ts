import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import * as formsService from "./service.js";
import { upsertFormSchema } from "./schemas.js";

export async function getAdminFormHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const result = await formsService.getAdminForm(programId);
  return sendSuccess(reply, result);
}

export async function saveDraftHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const input = upsertFormSchema.parse(request.body);
  const result = await formsService.saveDraft(programId, input);
  return sendSuccess(reply, result, "Draft saved");
}

export async function publishFormHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const form = await formsService.publishForm(programId);
  await recordAudit({
    actorUserId: request.user?.id,
    action: "form.publish",
    entityType: "form",
    entityId: form.id,
    metadata: { programId, version: form.version },
    ipAddress: request.ip,
  });
  return sendSuccess(reply, form, "Form published");
}

export async function previewFormHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const result = await formsService.getAdminForm(programId);
  return sendSuccess(reply, result);
}

export async function getFormShareInfoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const result = await formsService.getShareInfo(programId);
  return sendSuccess(reply, result);
}
