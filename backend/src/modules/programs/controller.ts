import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import { getProgramRole } from "./access.js";
import * as programsService from "./service.js";
import { createProgramSchema, listProgramsQuerySchema, updateProgramSchema } from "./schemas.js";

async function auditProgramAction(request: FastifyRequest, action: string, programId: string) {
  await recordAudit({
    actorUserId: request.user?.id,
    action,
    entityType: "program",
    entityId: programId,
    ipAddress: request.ip,
  });
}

export async function createProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const input = createProgramSchema.parse(request.body);
  const program = await programsService.createProgram(request.user, input);
  await auditProgramAction(request, "program.create", program.id);
  return sendSuccess(reply, program, "Program created", 201);
}

export async function listProgramsHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const query = listProgramsQuerySchema.parse(request.query);
  const result = await programsService.listPrograms(request.user, query);
  return sendSuccess(reply, result);
}

export async function getProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { programId } = request.params as { programId: string };
  const program = await programsService.getProgram(programId);
  // Lets the UI show only the actions this user can actually perform.
  const myRole = await getProgramRole(request.user, programId);
  return sendSuccess(reply, { ...program, myRole });
}

export async function updateProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const input = updateProgramSchema.parse(request.body);
  const program = await programsService.updateProgram(programId, input);
  await auditProgramAction(request, "program.update", programId);
  return sendSuccess(reply, program, "Program updated");
}

export async function deleteProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  await programsService.deleteProgram(programId);
  await auditProgramAction(request, "program.delete", programId);
  return sendSuccess(reply, null, "Program deleted");
}

export async function publishProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const program = await programsService.publishProgram(programId);
  await auditProgramAction(request, "program.publish", programId);
  return sendSuccess(reply, program, "Program published");
}

export async function unpublishProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const program = await programsService.unpublishProgram(programId);
  await auditProgramAction(request, "program.unpublish", programId);
  return sendSuccess(reply, program, "Program unpublished");
}

export async function closeRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const program = await programsService.closeRegistration(programId);
  await auditProgramAction(request, "program.registration_closed", programId);
  return sendSuccess(reply, program, "Registration closed");
}

export async function reopenRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const program = await programsService.reopenRegistration(programId);
  await auditProgramAction(request, "program.registration_reopened", programId);
  return sendSuccess(reply, program, "Registration reopened");
}

export async function archiveProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const program = await programsService.archiveProgram(programId);
  await auditProgramAction(request, "program.archive", programId);
  return sendSuccess(reply, program, "Program archived");
}

export async function duplicateProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { programId } = request.params as { programId: string };
  const program = await programsService.duplicateProgram(request.user, programId);
  await auditProgramAction(request, "program.duplicate", program.id);
  return sendSuccess(reply, program, "Program duplicated", 201);
}

export async function setThumbnailHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const { thumbnailUrl } = request.body as { thumbnailUrl: string };
  if (!thumbnailUrl) throw AppError.validation("thumbnailUrl is required");
  const program = await programsService.setThumbnail(programId, thumbnailUrl);
  return sendSuccess(reply, program, "Thumbnail updated");
}
