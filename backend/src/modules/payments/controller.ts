import type { FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { paymentEvents, payments, payouts, tenants } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { leonesToMinor } from "../../lib/money.js";
import { paginationSchema } from "../../lib/pagination.js";
import { dateRangeQuery } from "../../lib/dateRange.js";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import * as programsRepo from "../programs/repository.js";
import { getProgramPaymentAnalytics } from "./insights.js";
import { diagnoseMonime, getFinancialAccount, isMonimeConfigured, listFinancialAccounts, MonimeError } from "./monime.js";
import { assertCanAgreeToFee, currentFeeTerms, resolveFeeAcceptance } from "./fees.js";
import { paymentConfigInputSchema, resolvePaymentConfig } from "./pricing.js";
import * as payoutsService from "./payouts.js";
import * as refundsService from "./refunds.js";
import * as paymentsService from "./service.js";
import { verifyWebhookSignature } from "./webhookSignature.js";
import * as wallet from "./wallet.js";

const noStore = (reply: FastifyReply) => reply.header("Cache-Control", "no-store");

function actorOf(request: FastifyRequest) {
  if (!request.user) throw AppError.unauthorized();
  if (!request.user.tenantId) throw AppError.forbidden("Funds belong to an organization account.");
  return { id: request.user.id, tenantId: request.user.tenantId };
}

// ---------------------------------------------------------------- the payer (no account)

export async function paymentStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { token } = request.params as { token: string };
  const { refresh } = request.query as { refresh?: string };
  noStore(reply);
  return sendSuccess(reply, await paymentsService.paymentStatusForToken(token, { refresh: refresh === "1" }));
}

export async function retryPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { token } = request.params as { token: string };
  noStore(reply);
  return sendSuccess(reply, await paymentsService.retryPaymentForToken(token, { ip: request.ip, userAgent: request.headers["user-agent"] }));
}

// ---------------------------------------------------------------- a program's payments

const configBodySchema = paymentConfigInputSchema;

export async function updatePaymentConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { programId } = request.params as { programId: string };
  const config = configBodySchema.parse(request.body);
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");

  if (config.enabled) {
    if (!isMonimeConfigured()) throw AppError.conflict("Payments are not set up on this platform yet. Ask the platform administrator to connect Monime.");
    if (program.kind !== "order_form") {
      const charges = config.registrationFeeMinor > 0 || (program.idCardEnabled && config.idCardPriceMinor > 0) || (program.ticketEnabled && config.ticketPriceMinor > 0);
      if (!charges) throw AppError.validation("Set a price for the registration, the ID card or the ticket before turning payments on.");
    }
  }
  const { acceptFee, ...settings } = config;
  assertCanAgreeToFee(request.user.role, acceptFee);
  const existing = resolvePaymentConfig(program.paymentConfig);
  // Turning payments on (or keeping them on) means agreeing to the platform's fee.
  const feeAccepted = settings.enabled ? resolveFeeAcceptance(existing.feeAccepted, acceptFee, request.user.id) : existing.feeAccepted;
  const updated = await programsRepo.updateProgramRow(programId, { paymentConfig: { ...settings, ...(feeAccepted ? { feeAccepted } : {}) } });
  await recordAudit({ actorUserId: request.user.id, action: "program.payment_config", entityType: "program", entityId: programId, metadata: { enabled: config.enabled, ...(acceptFee ? { acceptedFeePercent: env.PAYMENTS_FEE_PERCENT } : {}) }, ipAddress: request.ip });
  return sendSuccess(reply, { paymentConfig: resolvePaymentConfig(updated.paymentConfig) });
}

/** The fee a program is asked to agree to, and whether it already has. */
export async function paymentTermsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  const accepted = resolvePaymentConfig(program.paymentConfig).feeAccepted;
  return sendSuccess(reply, { ...currentFeeTerms(), accepted: accepted ? { percent: accepted.percent, at: accepted.at } : null });
}

const listQuerySchema = paginationSchema.extend({ status: z.enum(["pending", "completed", "failed", "expired", "cancelled", "review"]).optional(), ...dateRangeQuery });

export async function listProgramPaymentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const query = listQuerySchema.parse(request.query);
  return sendSuccess(reply, await paymentsService.listProgramPayments(programId, query));
}

export async function programPaymentAnalyticsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  return sendSuccess(reply, await getProgramPaymentAnalytics(programId));
}

export async function confirmPaidInPersonHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { programId, registrationId } = request.params as { programId: string; registrationId: string };
  await paymentsService.confirmDocumentsPaidInPerson(programId, registrationId, request.user.id);
  return sendSuccess(reply, null, "Marked as paid in person");
}

export async function waivePaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { programId, registrationId } = request.params as { programId: string; registrationId: string };
  const { note } = z.object({ note: z.string().max(500).optional() }).parse(request.body ?? {});
  await paymentsService.waiveRegistrationPayment(programId, registrationId, request.user.id, note);
  return sendSuccess(reply, null, "Payment waived");
}

// ---------------------------------------------------------------- the payment fund

export async function fundsSummaryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = actorOf(request);
  noStore(reply);
  const [balances, providers, accounts] = await Promise.all([wallet.balancesFor(tenantId), payoutsService.payoutProviders(), payoutsService.listPayoutAccounts(tenantId)]);
  return sendSuccess(reply, {
    configured: isMonimeConfigured(),
    balances,
    accounts,
    providers,
    limits: {
      minMinor: leonesToMinor(env.PAYOUT_MIN_AMOUNT),
      dailyLimitMinor: leonesToMinor(env.PAYOUT_DAILY_LIMIT),
      reviewAboveMinor: leonesToMinor(env.PAYOUT_REVIEW_ABOVE),
      holdMinutes: env.PAYMENTS_HOLD_MINUTES,
      newAccountMinutes: env.PAYOUT_NEW_ACCOUNT_MINUTES,
      feePercent: env.PAYMENTS_FEE_PERCENT,
      feeFixedMinor: leonesToMinor(env.PAYMENTS_FEE_FIXED),
    },
  });
}

export async function fundsEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = actorOf(request);
  noStore(reply);
  const query = paginationSchema.extend(dateRangeQuery).parse(request.query);
  return sendSuccess(reply, await wallet.listEntries(tenantId, query, { dateFrom: query.dateFrom, dateTo: query.dateTo }));
}

export async function fundsPayoutsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = actorOf(request);
  noStore(reply);
  const query = paginationSchema.extend(dateRangeQuery).parse(request.query);
  return sendSuccess(reply, await payoutsService.listPayouts(tenantId, query, { dateFrom: query.dateFrom, dateTo: query.dateTo }));
}

const accountBodySchema = z.object({
  type: z.enum(["momo", "bank"]),
  providerId: z.string().min(1).max(20),
  accountNumber: z.string().min(5).max(30),
  accountName: z.string().trim().min(2).max(100),
  password: z.string().min(1).max(128),
});

export async function addAccountHandler(request: FastifyRequest, reply: FastifyReply) {
  const actor = actorOf(request);
  const body = accountBodySchema.parse(request.body);
  await payoutsService.addPayoutAccount(actor, body, request.ip);
  return sendSuccess(reply, await payoutsService.listPayoutAccounts(actor.tenantId), "Account added", 201);
}

export async function removeAccountHandler(request: FastifyRequest, reply: FastifyReply) {
  const actor = actorOf(request);
  const { accountId } = request.params as { accountId: string };
  const { password } = z.object({ password: z.string().min(1).max(128) }).parse(request.body);
  await payoutsService.removePayoutAccount(actor, accountId, password, request.ip);
  return sendSuccess(reply, await payoutsService.listPayoutAccounts(actor.tenantId), "Account removed");
}

const payoutBodySchema = z.object({
  accountId: z.string().uuid(),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  password: z.string().min(1).max(128),
});

export async function requestPayoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const actor = actorOf(request);
  const body = payoutBodySchema.parse(request.body);
  const payout = await payoutsService.requestPayout(actor, body, request.ip);
  return sendSuccess(reply, { id: payout.id, status: payout.status }, "Withdrawal requested", 201);
}

export async function cancelPayoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const actor = actorOf(request);
  const { payoutId } = request.params as { payoutId: string };
  await payoutsService.cancelPayout(actor, payoutId, request.ip);
  return sendSuccess(reply, null, "Withdrawal cancelled");
}

// ---------------------------------------------------------------- refunds

const refundBodySchema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(3).max(300),
  providerId: z.string().min(1).max(20),
  phoneNumber: z.string().min(5).max(30),
  password: z.string().min(1).max(128),
});

export async function refundPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { programId, paymentId } = request.params as { programId: string; paymentId: string };
  const body = refundBodySchema.parse(request.body);
  const refund = await refundsService.requestRefund({ id: request.user.id, role: request.user.role, tenantId: request.user.tenantId }, { ...body, paymentId, programId }, request.ip);
  return sendSuccess(reply, { id: refund.id, status: refund.status }, refund.status === "pending_review" ? "Refund requested. It needs approval first." : "Refund requested. The money is on its way.", 201);
}

export async function listPaymentRefundsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId, paymentId } = request.params as { programId: string; paymentId: string };
  noStore(reply);
  return sendSuccess(reply, await refundsService.listRefundsForPayment({ programId }, paymentId));
}

export async function fundsRefundsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = actorOf(request);
  noStore(reply);
  return sendSuccess(reply, await refundsService.listTenantRefunds(tenantId, paginationSchema.parse(request.query)));
}

export async function refundPollPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { pollId, paymentId } = request.params as { pollId: string; paymentId: string };
  const body = refundBodySchema.parse(request.body);
  const refund = await refundsService.requestRefund({ id: request.user.id, role: request.user.role, tenantId: request.user.tenantId }, { ...body, paymentId, pollId }, request.ip);
  return sendSuccess(reply, { id: refund.id, status: refund.status }, refund.status === "pending_review" ? "Refund requested. It needs approval first." : "Refund requested. The money is on its way.", 201);
}

export async function listPollPaymentRefundsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { pollId, paymentId } = request.params as { pollId: string; paymentId: string };
  noStore(reply);
  return sendSuccess(reply, await refundsService.listRefundsForPayment({ pollId }, paymentId));
}

const refundReviewSchema = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(300).optional() });

export async function reviewRefundHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { refundId } = request.params as { refundId: string };
  const { decision, note } = refundReviewSchema.parse(request.body);
  await refundsService.reviewRefund({ id: request.user.id }, refundId, decision, note, request.ip);
  return sendSuccess(reply, null, decision === "approve" ? "Refund approved" : "Refund declined");
}

// ---------------------------------------------------------------- the platform team

export async function platformPaymentsOverviewHandler(_request: FastifyRequest, reply: FastifyReply) {
  noStore(reply);
  const [awaiting, awaitingRefunds, flagged, totals] = await Promise.all([
    payoutsService.listPayoutsAwaitingReview(),
    refundsService.listRefundsAwaitingReview(),
    db
      .select({
        id: payments.id,
        amountMinor: payments.amountMinor,
        failureReason: payments.failureReason,
        createdAt: payments.createdAt,
        tenantName: tenants.name,
        payerEmail: payments.payerEmail,
      })
      .from(payments)
      .innerJoin(tenants, eq(tenants.id, payments.tenantId))
      .where(eq(payments.status, "review"))
      .orderBy(desc(payments.createdAt))
      .limit(50),
    db
      .select({
        paid: sql<string>`coalesce(sum(case when ${payments.status} = 'completed' then ${payments.amountMinor} else 0 end), 0)`,
        fees: sql<string>`coalesce(sum(case when ${payments.status} = 'completed' then ${payments.feeMinor} else 0 end), 0)`,
        count: sql<number>`count(*) filter (where ${payments.status} = 'completed')::int`,
      })
      .from(payments),
  ]);
  let monime: {
    configured: boolean;
    accounts: { id: string; name: string; currency: string; availableMinor: number | null; fields?: string }[];
    error?: string;
    status?: number;
    detail?: string;
    requestId?: string;
  } = { configured: isMonimeConfigured(), accounts: [] };
  if (monime.configured) {
    try {
      const accounts = await listFinancialAccounts();
      const balanceOf = (a: { balance?: { available?: { value?: unknown } | null } | null }) => {
        const n = Number(a.balance?.available?.value);
        return a.balance?.available?.value === undefined || a.balance?.available?.value === null || !Number.isFinite(n) ? null : n;
      };
      monime = {
        configured: true,
        accounts: await Promise.all(
          accounts.map(async (a) => {
            let balance = balanceOf(a);
            let seen = a as unknown as Record<string, unknown>;
            // The list may leave the balance out; the single account has it.
            if (balance === null) {
              const full = await getFinancialAccount(a.id).catch(() => null);
              if (full) {
                seen = full as unknown as Record<string, unknown>;
                balance = balanceOf(full);
              }
            }
            return { id: a.id, name: a.name, currency: a.currency, availableMinor: balance, ...(balance === null ? { fields: Object.keys(seen).join(", ") } : {}) };
          }),
        ),
      };
    } catch (err) {
      // Say what is actually wrong (a rejected token reads very differently from an unreachable server).
      const diagnosis = err instanceof MonimeError ? await diagnoseMonime() : null;
      monime = {
        configured: true,
        accounts: [],
        error: diagnosis?.hint ?? "Could not read Monime balances",
        status: diagnosis?.status,
        detail: diagnosis?.detail,
        requestId: diagnosis?.requestId,
      };
    }
  }
  const t = totals[0];
  return sendSuccess(reply, {
    awaitingReview: awaiting,
    refundsAwaitingReview: awaitingRefunds,
    paymentsInReview: flagged,
    totals: { paidMinor: Number(t?.paid ?? 0), feesMinor: Number(t?.fees ?? 0), paymentCount: t?.count ?? 0 },
    monime,
  });
}

export async function reviewPayoutHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { payoutId } = request.params as { payoutId: string };
  const { decision, note } = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).optional() }).parse(request.body);
  await payoutsService.reviewPayout({ id: request.user.id }, payoutId, decision, note, request.ip);
  return sendSuccess(reply, null, decision === "approve" ? "Withdrawal approved" : "Withdrawal declined");
}

export async function recheckPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { paymentId } = request.params as { paymentId: string };
  const payment = await paymentsService.refreshPayment(paymentId);
  await recordAudit({ actorUserId: request.user.id, action: "payment.recheck", entityType: "payment", entityId: paymentId, ipAddress: request.ip });
  return sendSuccess(reply, { status: payment.status });
}

// ---------------------------------------------------------------- Monime's notifications

const webhookSchema = z.object({
  event: z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(100), timestamp: z.union([z.string(), z.number()]).optional() }),
  object: z.object({ id: z.string().min(1).max(200), type: z.string().max(100).optional() }).optional(),
  data: z.record(z.unknown()).optional(),
});

/**
 * Monime tells us something happened. We treat that as a prompt, never as proof: the signature is checked when it can
 * be, the event is recorded once (a replay does nothing), and then the platform asks Monime itself what the facts are.
 * A forged message can therefore at worst cause one harmless lookup.
 */
export async function monimeWebhookHandler(request: FastifyRequest & { rawBody?: string }, reply: FastifyReply) {
  const raw = request.rawBody ?? "";
  const signature = verifyWebhookSignature({
    rawBody: raw,
    secret: env.MONIME_WEBHOOK_SECRET,
    header: request.headers["monime-signature"] as string | undefined,
    timestampHeader: request.headers["monime-timestamp"] as string | undefined,
  });
  if (env.MONIME_WEBHOOK_STRICT && signature !== "valid") {
    request.log.warn({ signature }, "Monime webhook refused: signature not verified");
    return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid signature" } });
  }
  if (signature === "invalid") request.log.warn("Monime webhook signature did not verify; relying on a direct check with Monime");

  const parsed = webhookSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ success: false, error: { code: "VALIDATION_ERROR", message: "Unrecognised event" } });
  const { event, object, data } = parsed.data;

  const inserted = await db
    .insert(paymentEvents)
    .values({ eventId: event.id, name: event.name, objectId: object?.id ?? null, signatureValid: signature === "absent" ? null : signature === "valid", ipAddress: request.ip })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });
  if (inserted.length === 0) {
    // Seen before: done, unless the last try failed, in which case Monime's retry is what we wanted.
    const [seen] = await db.select({ outcome: paymentEvents.outcome }).from(paymentEvents).where(eq(paymentEvents.eventId, event.id)).limit(1);
    if (seen?.outcome !== "error") return sendSuccess(reply, { received: true, duplicate: true });
  }

  let outcome = "ignored";
  try {
    if (event.name.startsWith("checkout_session.") && object?.id) {
      const [payment] = await db.select({ id: payments.id }).from(payments).where(eq(payments.checkoutSessionId, object.id)).limit(1);
      if (payment) {
        await paymentsService.refreshPayment(payment.id);
        outcome = "checked";
      }
    } else if (event.name.startsWith("payment.") && typeof data?.orderNumber === "string") {
      const [payment] = await db.select({ id: payments.id }).from(payments).where(eq(payments.providerOrderNumber, data.orderNumber)).limit(1);
      if (payment) {
        await paymentsService.refreshPayment(payment.id);
        outcome = "checked";
      }
    } else if (event.name.startsWith("payout.") && object?.id) {
      const [payout] = await db.select({ id: payouts.id }).from(payouts).where(eq(payouts.providerPayoutId, object.id)).limit(1);
      if (payout) {
        await payoutsService.processPayouts();
        outcome = "checked";
      }
    }
    await db.update(paymentEvents).set({ outcome }).where(eq(paymentEvents.eventId, event.id));
  } catch (err) {
    request.log.error({ err: err instanceof MonimeError ? err.message : err }, "Monime webhook could not be processed");
    await db.update(paymentEvents).set({ outcome: "error" }).where(and(eq(paymentEvents.eventId, event.id)));
    // A failure code makes Monime send it again; the background check is the safety net either way.
    return reply.status(500).send({ success: false, error: { code: "INTERNAL_ERROR", message: "Could not process the event" } });
  }
  return sendSuccess(reply, { received: true });
}
