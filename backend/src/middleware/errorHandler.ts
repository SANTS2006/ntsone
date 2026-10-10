import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { maskSecretsInUrl } from "../lib/logRedact.js";

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    request.log.warn({ err: error }, error.message);
    return reply.status(error.statusCode).send({
      success: false,
      requestId: request.id,
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      requestId: request.id,
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: error.flatten() },
    });
  }

  const fastifyErr = error as FastifyError;

  if (fastifyErr.validation) {
    return reply.status(400).send({
      success: false,
      requestId: request.id,
      error: { code: "VALIDATION_ERROR", message: fastifyErr.message, details: fastifyErr.validation },
    });
  }

  if (fastifyErr.statusCode === 429) {
    request.log.warn({ ip: request.ip, url: maskSecretsInUrl(request.url.split("?")[0] ?? "") }, "rate limit hit");
    return reply.status(429).send({
      success: false,
      requestId: request.id,
      error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
    });
  }

  if (fastifyErr.statusCode === 413) {
    return reply.status(413).send({
      success: false,
      requestId: request.id,
      error: { code: "PAYLOAD_TOO_LARGE", message: "The request is too large." },
    });
  }

  // Malformed requests (bad JSON, empty body, wrong content type) are the caller's mistake, not a server fault.
  if (fastifyErr.statusCode && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
    return reply.status(fastifyErr.statusCode).send({
      success: false,
      requestId: request.id,
      error: { code: "BAD_REQUEST", message: "The request could not be understood." },
    });
  }

  request.log.error({ err: error }, "Unhandled error");
  return reply.status(500).send({
    success: false,
    requestId: request.id,
    error: {
      code: "INTERNAL_ERROR",
      message: isProduction ? "An unexpected error occurred" : error.message,
      // Quote this to find the matching log line without exposing any internals.
      requestId: request.id,
    },
  });
}
