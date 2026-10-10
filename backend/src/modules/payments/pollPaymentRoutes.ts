import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { polls } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { dateRangeQuery } from "../../lib/dateRange.js";
import { paginationSchema } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import { requirePollAccess } from "../polls/access.js";
import { listPollPaymentRefundsHandler, refundPollPaymentHandler } from "./controller.js";
import { assertCanAgreeToFee, currentFeeTerms, resolveFeeAcceptance } from "./fees.js";
import { assertPollPaymentSettings, listPollPayments, pollPaymentConfigInputSchema, resolvePollPaymentConfig } from "./pollPayments.js";

type PollParams = { pollId: string };

const listQuery = paginationSchema.extend({ status: z.enum(["pending", "completed", "failed", "expired", "cancelled", "review"]).optional(), ...dateRangeQuery });

/** A poll's payments: the price of a vote, the fee the admin agrees to, and who paid. */
export async function pollPaymentRoutes(app: FastifyInstance) {
  const viewer = { preHandler: requirePollAccess("viewer") };
  const admin = { preHandler: requirePollAccess("admin") };

  app.get<{ Params: PollParams }>("/:pollId/payment-terms", viewer, async (request, reply) => {
    const [poll] = await db.select().from(polls).where(eq(polls.id, request.params.pollId)).limit(1);
    if (!poll) throw AppError.notFound("Poll not found");
    const accepted = resolvePollPaymentConfig(poll.paymentConfig).feeAccepted;
    return sendSuccess(reply, { ...currentFeeTerms(), accepted: accepted ? { percent: accepted.percent, at: accepted.at } : null });
  });

  app.put<{ Params: PollParams }>("/:pollId/payment-config", admin, async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    const { acceptFee, ...settings } = pollPaymentConfigInputSchema.parse(request.body);
    const [poll] = await db.select().from(polls).where(eq(polls.id, request.params.pollId)).limit(1);
    if (!poll) throw AppError.notFound("Poll not found");
    assertPollPaymentSettings(settings);
    assertCanAgreeToFee(request.user.role, acceptFee);
    const existing = resolvePollPaymentConfig(poll.paymentConfig);
    // Turning paid voting on (or keeping it on) means agreeing to the platform's fee.
    const feeAccepted = settings.enabled ? resolveFeeAcceptance(existing.feeAccepted, acceptFee, request.user.id) : existing.feeAccepted;
    const paymentConfig = { ...settings, ...(feeAccepted ? { feeAccepted } : {}) };
    const [updated] = await db.update(polls).set({ paymentConfig, updatedAt: new Date() }).where(eq(polls.id, poll.id)).returning();
    await recordAudit({
      actorUserId: request.user.id,
      action: "poll.payment_config",
      label: "Changed the poll's payment settings",
      entityType: "poll",
      entityId: poll.id,
      metadata: { enabled: settings.enabled, pricePerVoteMinor: settings.pricePerVoteMinor, allowAnyAmount: settings.allowAnyAmount, ...(acceptFee ? { acceptedFeePercent: env.PAYMENTS_FEE_PERCENT } : {}) },
      ipAddress: request.ip,
    });
    return sendSuccess(reply, { paymentConfig: resolvePollPaymentConfig(updated!.paymentConfig) });
  });

  app.get<{ Params: PollParams }>("/:pollId/payments", viewer, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const query = listQuery.parse(request.query);
    return sendSuccess(reply, await listPollPayments(request.params.pollId, query));
  });

  app.post<{ Params: PollParams & { paymentId: string } }>("/:pollId/payments/:paymentId/refund", { ...admin, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, refundPollPaymentHandler);
  app.get<{ Params: PollParams & { paymentId: string } }>("/:pollId/payments/:paymentId/refunds", viewer, listPollPaymentRefundsHandler);
}
