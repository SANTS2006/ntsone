import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { AuthenticatedUser } from "../modules/users/types.js";

// Someone still on a temporary password may only look at their own profile and choose a new password.
const PASSWORD_CHANGE_PATHS = new Set(["/api/auth/me", "/api/auth/me/change-password"]);

// Someone who signed up with Google and has not named their organization yet may only do that.
const SETUP_PATHS = new Set(["/api/auth/me", "/api/auth/me/complete-setup"]);

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/** Like authenticate, but for public routes: identifies a signed-in user if there is one, and never rejects. */
export async function optionalAuthenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.headers.authorization?.startsWith("Bearer ")) return;
  try {
    await authenticate(request, reply);
  } catch {
    request.user = undefined;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw AppError.unauthorized();
  }
  const token = header.slice("Bearer ".length);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw AppError.unauthorized("Invalid or expired access token");
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user || user.status !== "active") {
    throw AppError.unauthorized("Account is not active");
  }

  request.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    tenantId: user.tenantId,
    emailVerified: !!user.emailVerifiedAt,
    mustChangePassword: user.mustChangePassword,
    organizationSetupPending: user.organizationSetupPending,
  };
  if (user.organizationSetupPending && !SETUP_PATHS.has(request.url.split("?")[0] ?? "")) throw AppError.setupRequired();
  if (user.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(request.url.split("?")[0] ?? "")) throw AppError.passwordChangeRequired();
}
