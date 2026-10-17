import { strongPassword } from "../../lib/passwordPolicy.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../lib/response.js";
import { issueGoogleNonce, verifyGoogleCredential } from "./google.js";
import * as votersService from "./service.js";

const authLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
const voteLimit = { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } };

const pollSlug = z.string().trim().min(1).max(200);
const email = z.string().trim().email("Enter a valid email address").max(254);

const registerSchema = z.object({
  pollSlug,
  name: z.string().trim().min(2, "Enter your full name").max(200),
  email,
  password: strongPassword,
});
const loginSchema = z.object({ pollSlug, email, password: z.string().min(1).max(128) });
const verifySchema = z.object({ pollSlug, email, code: z.string().trim().min(4).max(12) });
const resendSchema = z.object({ pollSlug, email });
const forgotSchema = z.object({ pollSlug, email });
const resetSchema = z.object({
  pollSlug,
  email,
  code: z.string().trim().min(4).max(12),
  password: strongPassword,
});
const googleSchema = z.object({ pollSlug, credential: z.string().min(20).max(5000) });
const voteSchema = z.object({ candidateId: z.string().uuid() });
const payVotesSchema = z.object({ amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() });

type SlugParams = { slug: string };

/**
 * Everything a voter touches: the public poll, its live results, voter sign-up/sign-in (a
 * separate account system from staff), and casting votes. Mounted at /api/voter.
 */
export async function voterRoutes(app: FastifyInstance) {
  app.get<{ Params: SlugParams }>("/polls/:slug", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await votersService.getPublicPoll(request.params.slug));
  });

  app.get<{ Params: SlugParams }>("/polls/:slug/results", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await votersService.getPublicResults(request.params.slug));
  });

  app.get<{ Params: SlugParams }>("/polls/:slug/session", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await votersService.session(request, request.params.slug));
  });

  app.post<{ Params: SlugParams & { positionId: string } }>(
    "/polls/:slug/positions/:positionId/vote",
    voteLimit,
    async (request, reply) => {
      const { candidateId } = voteSchema.parse(request.body);
      const result = await votersService.castVote(request, {
        slug: request.params.slug,
        positionId: request.params.positionId,
        candidateId,
      });
      return sendSuccess(reply, result, "Your vote has been recorded");
    },
  );

  // Paid voting: pay for the votes of one position, then use them on a candidate.
  app.post<{ Params: SlugParams & { positionId: string } }>("/polls/:slug/positions/:positionId/pay", authLimit, async (request, reply) => {
    const { amountMinor } = payVotesSchema.parse(request.body ?? {});
    const started = await votersService.startVotePayment(request, { slug: request.params.slug, positionId: request.params.positionId, amountMinor });
    return sendSuccess(reply, started, "Payment started", 201);
  });

  app.post<{ Params: SlugParams & { paymentId: string } }>("/polls/:slug/credits/:paymentId/vote", voteLimit, async (request, reply) => {
    const { candidateId } = voteSchema.parse(request.body);
    const result = await votersService.castPaidVotes(request, { slug: request.params.slug, paymentId: request.params.paymentId, candidateId });
    return sendSuccess(reply, result, "Your votes have been recorded");
  });

  app.post("/auth/register", authLimit, async (request, reply) => {
    return sendSuccess(reply, await votersService.register(registerSchema.parse(request.body)), "Check your email for a code");
  });

  app.post("/auth/login", authLimit, async (request, reply) => {
    return sendSuccess(reply, await votersService.login(reply, loginSchema.parse(request.body)));
  });

  app.post("/auth/verify", authLimit, async (request, reply) => {
    return sendSuccess(reply, await votersService.verifyEmail(reply, verifySchema.parse(request.body)), "Email confirmed");
  });

  app.post("/auth/resend", authLimit, async (request, reply) => {
    return sendSuccess(reply, await votersService.resendCode(resendSchema.parse(request.body)), "A new code is on its way");
  });

  app.post("/auth/forgot-password", authLimit, async (request, reply) => {
    return sendSuccess(reply, await votersService.forgotPassword(forgotSchema.parse(request.body)), "If that email has an account, a code is on its way");
  });

  app.post("/auth/reset-password", authLimit, async (request, reply) => {
    return sendSuccess(reply, await votersService.resetPassword(resetSchema.parse(request.body)), "Your password has been changed");
  });

  // A fresh single-use value the Google sign-in must carry, so a captured Google token cannot be replayed.
  app.get("/auth/google/nonce", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (_request, reply) => sendSuccess(reply, { nonce: issueGoogleNonce() }));

  app.post("/auth/google", authLimit, async (request, reply) => {
    const input = googleSchema.parse(request.body);
    const profile = await verifyGoogleCredential(input.credential, { requireNonce: true });
    return sendSuccess(reply, await votersService.googleSignIn(reply, { pollSlug: input.pollSlug, profile }));
  });

  app.post("/auth/logout", async (_request, reply) => {
    votersService.clearSession(reply);
    return sendSuccess(reply, null, "Signed out");
  });
}
