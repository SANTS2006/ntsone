import { and, eq, isNull } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { businesses, businessMembers } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import type { AuthenticatedUser, ProgramRole } from "../users/types.js";

/** Same rules as programs and polls: account admins see all their businesses, others need access. */
export async function getBusinessRole(user: AuthenticatedUser, businessId: string): Promise<ProgramRole | null> {
  if (user.role === "super_admin") return "admin";
  const [business] = await db.select({ tenantId: businesses.tenantId }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return null;
  if (user.role === "admin" && business.tenantId === user.tenantId) return "admin";
  // Anyone given access to the business, from any account, has the role they were given.
  const [membership] = await db
    .select({ role: businessMembers.roleOnBusiness })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, user.id), eq(businessMembers.businessId, businessId)))
    .limit(1);
  return membership?.role ?? null;
}

export async function assertBusinessAccess(user: AuthenticatedUser, businessId: string, minRole: ProgramRole = "viewer") {
  const role = await getBusinessRole(user, businessId);
  if (!role) throw AppError.forbidden("You do not have access to this business");
  if (minRole === "admin" && role !== "admin") throw AppError.forbidden("You need admin access to this business to do this");
  return role;
}

export async function listAccessibleBusinessIds(user: AuthenticatedUser): Promise<string[] | "all"> {
  if (user.role === "super_admin") return "all";
  const shared = await db
    .select({ id: businessMembers.businessId })
    .from(businessMembers)
    .where(eq(businessMembers.userId, user.id));
  const ids = new Set(shared.map((r) => r.id));
  if (user.role === "admin") {
    const own = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.tenantId, user.tenantId!), isNull(businesses.deletedAt)));
    for (const r of own) ids.add(r.id);
  }
  return [...ids];
}

/** Route guard: the signed-in user needs at least `minRole` on the business in :businessId. */
export function requireBusinessAccess(minRole: ProgramRole = "viewer") {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    if (!request.user) throw AppError.unauthorized();
    const { businessId } = request.params as { businessId?: string };
    if (!businessId) throw AppError.validation("businessId route parameter is required");
    await assertBusinessAccess(request.user, businessId, minRole);
  };
}
