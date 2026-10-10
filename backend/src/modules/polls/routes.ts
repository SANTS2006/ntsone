import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../middleware/authorize.js";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import { createUploadSignature } from "../uploads/service.js";
import { getPollRole, requirePollAccess } from "./access.js";
import { createPollSchema, listPollsQuerySchema, listVotersQuerySchema, saveBallotSchema, updatePollSchema, verifiedVotersSchema } from "./schemas.js";
import * as pollsService from "./service.js";
import * as pollsRepo from "./repository.js";
import { pollExportRoutes } from "./exports.js";

type PollParams = { pollId: string };

async function audit(request: FastifyRequest, action: string, pollId: string) {
  await recordAudit({ actorUserId: request.user?.id, action, entityType: "poll", entityId: pollId, ipAddress: request.ip });
}

/** A poll with its effective state and the signed-in user's role on it. */
async function pollView(request: FastifyRequest, poll: pollsRepo.PollRow) {
  const myRole = request.user ? await getPollRole(request.user, poll.id) : null;
  return { ...poll, state: pollsService.pollState(poll), myRole };
}

export async function pollRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requirePollAccess("viewer") };
  const admin = { preHandler: requirePollAccess("admin") };

  await app.register(pollExportRoutes);

  app.get("/", async (request, reply) => {
    const query = listPollsQuerySchema.parse(request.query);
    return sendSuccess(reply, await pollsService.listPolls(request.user!, query));
  });

  app.post("/", { preHandler: requireRole("super_admin", "admin", "program_admin") }, async (request, reply) => {
    const poll = await pollsService.createPoll(request.user!, createPollSchema.parse(request.body));
    await audit(request, "poll.create", poll.id);
    return sendSuccess(reply, await pollView(request, poll), "Poll created", 201);
  });

  app.get<{ Params: PollParams }>("/:pollId", viewer, async (request, reply) => {
    const poll = await pollsService.getPoll(request.params.pollId);
    return sendSuccess(reply, await pollView(request, poll));
  });

  app.patch<{ Params: PollParams }>("/:pollId", admin, async (request, reply) => {
    const poll = await pollsService.updatePoll(request.params.pollId, updatePollSchema.parse(request.body));
    await audit(request, "poll.update", poll.id);
    return sendSuccess(reply, await pollView(request, poll), "Poll updated");
  });

  app.delete<{ Params: PollParams }>("/:pollId", admin, async (request, reply) => {
    await pollsService.deletePoll(request.params.pollId);
    await audit(request, "poll.delete", request.params.pollId);
    return sendSuccess(reply, null, "Poll deleted");
  });

  app.post<{ Params: PollParams }>("/:pollId/open", admin, async (request, reply) => {
    const poll = await pollsService.openPoll(request.params.pollId);
    await audit(request, "poll.open", poll.id);
    return sendSuccess(reply, await pollView(request, poll), "Voting is open");
  });

  app.post<{ Params: PollParams }>("/:pollId/close", admin, async (request, reply) => {
    const poll = await pollsService.closePoll(request.params.pollId);
    await audit(request, "poll.close", poll.id);
    return sendSuccess(reply, await pollView(request, poll), "Voting is closed");
  });

  app.get<{ Params: PollParams }>("/:pollId/ballot", viewer, async (request, reply) => {
    return sendSuccess(reply, await pollsRepo.getBallot(request.params.pollId));
  });

  app.put<{ Params: PollParams }>("/:pollId/ballot", admin, async (request, reply) => {
    const ballot = await pollsService.saveBallot(request.params.pollId, saveBallotSchema.parse(request.body));
    await audit(request, "poll.ballot_update", request.params.pollId);
    return sendSuccess(reply, ballot, "Ballot saved");
  });

  app.get<{ Params: PollParams }>("/:pollId/results", viewer, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await pollsService.buildResults(request.params.pollId));
  });

  app.get<{ Params: PollParams }>("/:pollId/voters", viewer, async (request, reply) => {
    const query = listVotersQuerySchema.parse(request.query);
    return sendSuccess(reply, await pollsService.listVoters(request.params.pollId, query.search, query, { dateFrom: query.dateFrom, dateTo: query.dateTo }));
  });

  app.get<{ Params: PollParams }>("/:pollId/verified-voters", viewer, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await pollsService.getVerifiedVoters(request.params.pollId));
  });

  app.put<{ Params: PollParams }>("/:pollId/verified-voters", admin, async (request, reply) => {
    const result = await pollsService.saveVerifiedVoters(request.params.pollId, verifiedVotersSchema.parse(request.body));
    await audit(request, "poll.verified_voters_update", request.params.pollId);
    return sendSuccess(reply, result, "Verified voters saved");
  });

  app.get<{ Params: PollParams }>("/:pollId/share", viewer, async (request, reply) => {
    return sendSuccess(reply, await pollsService.shareInfo(request.params.pollId));
  });

  app.post<{ Params: PollParams }>("/:pollId/uploads/signature", admin, async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    return sendSuccess(reply, createUploadSignature(`polls/${request.params.pollId}`));
  });
}
