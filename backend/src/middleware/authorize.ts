import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../lib/errors.js";
import { assertProgramAccess } from "../modules/programs/access.js";
import type { UserRole } from "../modules/users/types.js";

export function requireRole(...roles: UserRole[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) throw AppError.unauthorized();
    if (!roles.includes(request.user.role)) {
      throw AppError.forbidden();
    }
  };
}

/**
 * Reads :programId from the route params and verifies the authenticated user
 * has at least `minRole` access to that specific program. This must be applied
 * to every program-scoped route -- the programId in the URL is never trusted
 * on its own.
 */
export function requireProgramAccess(minRole: "viewer" | "admin" = "viewer") {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) throw AppError.unauthorized();
    const { programId } = request.params as { programId?: string };
    if (!programId) throw AppError.validation("programId route parameter is required");
    await assertProgramAccess(request.user, programId, minRole);
  };
}
