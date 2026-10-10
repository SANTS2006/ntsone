import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { businesses, businessMembers } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import * as usersService from "./service.js";

const grantSchema = z.object({ businessId: z.string().uuid(), roleOnBusiness: z.enum(["admin", "viewer"]) });

function listForUser(userId: string, tenantId: string) {
  return db
    .select({
      businessId: businessMembers.businessId,
      roleOnBusiness: businessMembers.roleOnBusiness,
      businessName: businesses.name,
    })
    .from(businessMembers)
    .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
    .where(and(eq(businessMembers.userId, userId), eq(businesses.tenantId, tenantId), isNull(businesses.deletedAt)));
}

/** A tenant admin gives teammates admin or viewer access to individual businesses. */
export async function businessAccessRoutes(app: FastifyInstance) {
  app.get<{ Params: { userId: string } }>("/:userId/businesses", async (request, reply) => {
    await usersService.getUser(request.user!.tenantId!, request.params.userId);
    return sendSuccess(reply, await listForUser(request.params.userId, request.user!.tenantId!));
  });

  app.post<{ Params: { userId: string } }>("/:userId/businesses", async (request, reply) => {
    const tenantId = request.user!.tenantId!;
    await usersService.getUser(tenantId, request.params.userId);
    const input = grantSchema.parse(request.body);
    const [business] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(and(eq(businesses.id, input.businessId), eq(businesses.tenantId, tenantId), isNull(businesses.deletedAt)))
      .limit(1);
    if (!business) throw AppError.notFound("Business not found");
    await db
      .insert(businessMembers)
      .values({ userId: request.params.userId, businessId: input.businessId, roleOnBusiness: input.roleOnBusiness })
      .onConflictDoUpdate({ target: [businessMembers.userId, businessMembers.businessId], set: { roleOnBusiness: input.roleOnBusiness } });
    return sendSuccess(reply, await listForUser(request.params.userId, request.user!.tenantId!), "Business access granted");
  });

  app.delete<{ Params: { userId: string; businessId: string } }>("/:userId/businesses/:businessId", async (request, reply) => {
    await usersService.getUser(request.user!.tenantId!, request.params.userId);
    await db
      .delete(businessMembers)
      .where(and(eq(businessMembers.userId, request.params.userId), eq(businessMembers.businessId, request.params.businessId)));
    return sendSuccess(reply, null, "Business access removed");
  });
}
