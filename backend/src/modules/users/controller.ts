import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import * as usersService from "./service.js";
import {
  addProgramMembershipSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from "./schemas.js";

export async function createUserHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) throw AppError.unauthorized();
  const input = createUserSchema.parse(request.body);
  const user = await usersService.createUser(request.user.tenantId, input, { name: request.user.name });
  await recordAudit({
    actorUserId: request.user?.id,
    action: "user.create",
    entityType: "user",
    entityId: (user as { id: string }).id,
    metadata: { role: input.role },
    ipAddress: request.ip,
  });
  return sendSuccess(reply, user, "User created", 201);
}

export async function listUsersHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) throw AppError.unauthorized();
  const query = listUsersQuerySchema.parse(request.query);
  const result = await usersService.listUsers(
    request.user.tenantId,
    query.search,
    { page: query.page, pageSize: query.pageSize },
    { dateFrom: query.dateFrom, dateTo: query.dateTo },
  );
  return sendSuccess(reply, result);
}

export async function getUserHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) throw AppError.unauthorized();
  const { userId } = request.params as { userId: string };
  const user = await usersService.getUser(request.user.tenantId, userId);
  return sendSuccess(reply, user);
}

export async function updateUserHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) throw AppError.unauthorized();
  const { userId } = request.params as { userId: string };
  const input = updateUserSchema.parse(request.body);
  const user = await usersService.updateUser(request.user.tenantId, userId, input);
  return sendSuccess(reply, user, "User updated");
}

export async function listMembershipsHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) throw AppError.unauthorized();
  const { userId } = request.params as { userId: string };
  const memberships = await usersService.listMemberships(request.user.tenantId, userId);
  return sendSuccess(reply, memberships);
}

export async function addMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) throw AppError.unauthorized();
  const { userId } = request.params as { userId: string };
  const input = addProgramMembershipSchema.parse(request.body);
  const memberships = await usersService.addMembership(request.user.tenantId, userId, input);
  return sendSuccess(reply, memberships, "Program access granted");
}

export async function removeMembershipHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) throw AppError.unauthorized();
  const { userId, programId } = request.params as { userId: string; programId: string };
  await usersService.removeMembership(request.user.tenantId, userId, programId);
  return sendSuccess(reply, null, "Program access revoked");
}

export async function removeTeamMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) throw AppError.unauthorized();
  const { userId } = request.params as { userId: string };
  await usersService.removeTeamMember(request.user.tenantId, userId);
  await recordAudit({ actorUserId: request.user.id, action: "user.remove_from_team", entityType: "user", entityId: userId, ipAddress: request.ip });
  return sendSuccess(reply, null, "Removed from your team");
}
