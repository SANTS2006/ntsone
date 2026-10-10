import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { listAccessibleProgramIds } from "../programs/access.js";
import { getFieldAnalytics } from "./fieldAnalytics.js";
import * as analyticsService from "./service.js";

const trendQuerySchema = z.object({ days: z.coerce.number().int().min(7).max(180).default(30) });

export async function getProgramTrendHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const { days } = trendQuerySchema.parse(request.query);
  const trend = await analyticsService.getRegistrationTrend(programId, days);
  return sendSuccess(reply, trend);
}

export async function getProgramDemographicsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const breakdowns = await analyticsService.getDemographics(programId);
  return sendSuccess(reply, breakdowns);
}

export async function getProgramFieldAnalyticsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  return sendSuccess(reply, await getFieldAnalytics(programId));
}

export async function getDashboardTrendHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { days } = trendQuerySchema.parse(request.query);
  const accessible = await listAccessibleProgramIds(request.user);
  const trend = await analyticsService.getCrossProgramTrend(accessible, days);
  return sendSuccess(reply, trend);
}
