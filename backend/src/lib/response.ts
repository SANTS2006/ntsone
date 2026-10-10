import type { FastifyReply } from "fastify";

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  message = "Operation completed successfully",
  statusCode = 200,
) {
  return reply.status(statusCode).send({ success: true, data, message });
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function sendPaginated<T>(reply: FastifyReply, result: PaginatedResult<T>, message?: string) {
  return sendSuccess(reply, result, message);
}
