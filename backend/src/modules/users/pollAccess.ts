import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { pollMembers, polls } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import * as usersService from "./service.js";

const grantSchema = z.object({ pollId: z.string().uuid(), roleOnPoll: z.enum(["admin", "viewer"]) });

function listForUser(userId: string, tenantId: string) {
  return db
    .select({ pollId: pollMembers.pollId, roleOnPoll: pollMembers.roleOnPoll, pollName: polls.name, pollSlug: polls.slug })
    .from(pollMembers)
    .innerJoin(polls, eq(polls.id, pollMembers.pollId))
    .where(and(eq(pollMembers.userId, userId), eq(polls.tenantId, tenantId), isNull(polls.deletedAt)));
}

/** A tenant admin gives teammates admin or viewer access to individual polls. */
export async function pollAccessRoutes(app: FastifyInstance) {
  app.get<{ Params: { userId: string } }>("/:userId/polls", async (request, reply) => {
    await usersService.getUser(request.user!.tenantId!, request.params.userId);
    return sendSuccess(reply, await listForUser(request.params.userId, request.user!.tenantId!));
  });

  app.post<{ Params: { userId: string } }>("/:userId/polls", async (request, reply) => {
    const tenantId = request.user!.tenantId!;
    await usersService.getUser(tenantId, request.params.userId);
    const input = grantSchema.parse(request.body);
    const [poll] = await db
      .select({ id: polls.id })
      .from(polls)
      .where(and(eq(polls.id, input.pollId), eq(polls.tenantId, tenantId), isNull(polls.deletedAt)))
      .limit(1);
    if (!poll) throw AppError.notFound("Poll not found");
    await db
      .insert(pollMembers)
      .values({ userId: request.params.userId, pollId: input.pollId, roleOnPoll: input.roleOnPoll })
      .onConflictDoUpdate({ target: [pollMembers.userId, pollMembers.pollId], set: { roleOnPoll: input.roleOnPoll } });
    return sendSuccess(reply, await listForUser(request.params.userId, request.user!.tenantId!), "Poll access granted");
  });

  app.delete<{ Params: { userId: string; pollId: string } }>("/:userId/polls/:pollId", async (request, reply) => {
    await usersService.getUser(request.user!.tenantId!, request.params.userId);
    await db.delete(pollMembers).where(and(eq(pollMembers.userId, request.params.userId), eq(pollMembers.pollId, request.params.pollId)));
    return sendSuccess(reply, null, "Poll access removed");
  });
}
