import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import { paginationSchema } from "../../lib/pagination.js";
import { dateRangeQuery } from "../../lib/dateRange.js";
import * as platformService from "./service.js";

export async function listTenantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = paginationSchema.extend(dateRangeQuery).parse(request.query);
  const result = await platformService.listTenants(query, { dateFrom: query.dateFrom, dateTo: query.dateTo });
  return sendSuccess(reply, result);
}

export async function getTenantHandler(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = request.params as { tenantId: string };
  const tenant = await platformService.getTenant(tenantId);
  return sendSuccess(reply, tenant);
}

export async function listTenantUsersHandler(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = request.params as { tenantId: string };
  const range = z.object(dateRangeQuery).parse(request.query);
  const users = await platformService.getTenantUsers(tenantId, range);
  return sendSuccess(reply, users);
}

const userStatusSchema = z.object({ status: z.enum(["active", "suspended"]) });

export async function updateUserStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { userId } = request.params as { userId: string };
  const { status } = userStatusSchema.parse(request.body);
  if (userId === request.user.id) throw AppError.validation("You can't change the status of your own account");

  const user = await platformService.setUserStatus(userId, status);
  await recordAudit({
    actorUserId: request.user.id,
    action: status === "suspended" ? "user.suspend" : "user.reactivate",
    entityType: "user",
    entityId: userId,
    ipAddress: request.ip,
  });
  return sendSuccess(reply, user, status === "suspended" ? "User suspended" : "User reactivated");
}

export async function listTenantProgramsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = request.params as { tenantId: string };
  const range = z.object(dateRangeQuery).parse(request.query);
  const programs = await platformService.getTenantPrograms(tenantId, range);
  return sendSuccess(reply, programs);
}
