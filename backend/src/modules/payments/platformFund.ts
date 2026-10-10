import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { payments } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { leonesToMinor } from "../../lib/money.js";
import { dateRangeQuery } from "../../lib/dateRange.js";
import { paginationSchema } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import { isMonimeConfigured } from "./monime.js";
import * as payoutsService from "./payouts.js";
import * as wallet from "./wallet.js";

// The platform's own money: the fee it keeps from every payment, and what it takes out. It uses the same ledger,
// withdrawal accounts and withdrawal sending as an organization's payment fund (with no organization behind it),
// including the password check, the cooling-off period for a new account, and the daily limit.

const noStore = (reply: FastifyReply) => reply.header("Cache-Control", "no-store");

function actorOf(request: FastifyRequest) {
  if (!request.user || request.user.role !== "super_admin") throw AppError.forbidden("Only the platform team can use the platform fund.");
  return { id: request.user.id, tenantId: null as null };
}

async function summaryHandler(request: FastifyRequest, reply: FastifyReply) {
  actorOf(request);
  noStore(reply);
  const [balances, providers, accounts, [totals]] = await Promise.all([
    wallet.balancesFor(null),
    payoutsService.payoutProviders(),
    payoutsService.listPayoutAccounts(null),
    db
      .select({
        count: sql<number>`count(*) filter (where ${payments.status} = 'completed')::int`,
        fees: sql<string>`coalesce(sum(case when ${payments.status} = 'completed' then ${payments.feeMinor} else 0 end), 0)`,
      })
      .from(payments),
  ]);
  return sendSuccess(reply, {
    configured: isMonimeConfigured(),
    balances,
    accounts,
    providers,
    feesEarnedMinor: Number(totals?.fees ?? 0),
    paymentsCounted: totals?.count ?? 0,
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

const listQuery = paginationSchema.extend(dateRangeQuery);

async function entriesHandler(request: FastifyRequest, reply: FastifyReply) {
  actorOf(request);
  noStore(reply);
  const query = listQuery.parse(request.query);
  return sendSuccess(reply, await wallet.listEntries(null, query, { dateFrom: query.dateFrom, dateTo: query.dateTo }));
}

async function payoutsHandler(request: FastifyRequest, reply: FastifyReply) {
  actorOf(request);
  noStore(reply);
  const query = listQuery.parse(request.query);
  return sendSuccess(reply, await payoutsService.listPayouts(null, query, { dateFrom: query.dateFrom, dateTo: query.dateTo }));
}

const accountBody = z.object({
  type: z.enum(["momo", "bank"]),
  providerId: z.string().min(1).max(20),
  accountNumber: z.string().min(5).max(30),
  accountName: z.string().trim().min(2).max(100),
  password: z.string().min(1).max(128),
});

async function addAccountHandler(request: FastifyRequest, reply: FastifyReply) {
  const actor = actorOf(request);
  await payoutsService.addPayoutAccount(actor, accountBody.parse(request.body), request.ip);
  return sendSuccess(reply, await payoutsService.listPayoutAccounts(null), "Account added", 201);
}

async function removeAccountHandler(request: FastifyRequest, reply: FastifyReply) {
  const actor = actorOf(request);
  const { accountId } = request.params as { accountId: string };
  const { password } = z.object({ password: z.string().min(1).max(128) }).parse(request.body);
  await payoutsService.removePayoutAccount(actor, accountId, password, request.ip);
  return sendSuccess(reply, await payoutsService.listPayoutAccounts(null), "Account removed");
}

const payoutBody = z.object({
  accountId: z.string().uuid(),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  password: z.string().min(1).max(128),
});

async function requestPayoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const actor = actorOf(request);
  const payout = await payoutsService.requestPayout(actor, payoutBody.parse(request.body), request.ip);
  return sendSuccess(reply, { id: payout.id, status: payout.status }, "Withdrawal requested", 201);
}

async function cancelPayoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const actor = actorOf(request);
  const { payoutId } = request.params as { payoutId: string };
  await payoutsService.cancelPayout(actor, payoutId, request.ip);
  return sendSuccess(reply, null, "Withdrawal cancelled");
}

/** The platform's fund, for the super admin. */
export async function platformFundRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
  app.get("/fund", summaryHandler);
  app.get("/fund/entries", entriesHandler);
  app.get("/fund/payouts", payoutsHandler);
  app.post("/fund/accounts", strict, addAccountHandler);
  app.post("/fund/accounts/:accountId/remove", strict, removeAccountHandler);
  app.post("/fund/payouts", strict, requestPayoutHandler);
  app.post("/fund/payouts/:payoutId/cancel", strict, cancelPayoutHandler);
}

