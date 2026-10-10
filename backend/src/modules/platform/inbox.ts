import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { dateRangeQuery } from "../../lib/dateRange.js";
import { AppError } from "../../lib/errors.js";
import { buildPaginatedResult, paginationSchema } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import * as supportRepo from "../support/repository.js";

const listQuerySchema = paginationSchema.extend({
  kind: z.enum(["feedback", "contact", "report"]).optional(),
  status: z.enum(["new", "read", "resolved"]).optional(),
  search: z.string().trim().max(200).optional(),
  ...dateRangeQuery,
});

export async function listSupportMessagesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = listQuerySchema.parse(request.query);
  const [{ items, total }, newCounts] = await Promise.all([
    supportRepo.listSupportMessages({ kind: query.kind, status: query.status, search: query.search || undefined, dateFrom: query.dateFrom, dateTo: query.dateTo }, query),
    supportRepo.countNewByKind(),
  ]);
  return sendSuccess(reply, { ...buildPaginatedResult(items, total, query), newCounts });
}

export async function getSupportMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params);
  const message = await supportRepo.findSupportMessage(messageId);
  if (!message) throw AppError.notFound("Message not found");
  // Opening a new message marks it as read.
  if (message.status === "new") {
    await supportRepo.updateSupportMessageStatus(messageId, "read");
    message.status = "read";
  }
  return sendSuccess(reply, message);
}

export async function updateSupportMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { messageId } = z.object({ messageId: z.string().uuid() }).parse(request.params);
  const { status } = z.object({ status: z.enum(["new", "read", "resolved"]) }).parse(request.body);
  const updated = await supportRepo.updateSupportMessageStatus(messageId, status);
  if (!updated) throw AppError.notFound("Message not found");
  return sendSuccess(reply, updated, "Message updated");
}
