import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/jwt.js";
import type { AuthenticatedUser } from "../modules/users/types.js";

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
  };
}
