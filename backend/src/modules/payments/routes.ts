import type { FastifyInstance } from "fastify";
import { requireProgramAccess, requireRole } from "../../middleware/authorize.js";
import {
  addAccountHandler,
  cancelPayoutHandler,
  fundsEntriesHandler,
  fundsPayoutsHandler,
  fundsSummaryHandler,
  listProgramPaymentsHandler,
  monimeWebhookHandler,
  paymentStatusHandler,
  paymentTermsHandler,
  fundsRefundsHandler,
  listPaymentRefundsHandler,
  refundPaymentHandler,
  reviewRefundHandler,
  programPaymentAnalyticsHandler,
  platformPaymentsOverviewHandler,
  recheckPaymentHandler,
  removeAccountHandler,
  requestPayoutHandler,
  retryPaymentHandler,
  reviewPayoutHandler,
  updatePaymentConfigHandler,
  waivePaymentHandler,
  confirmPaidInPersonHandler,
} from "./controller.js";

/** What a payer sees: the state of their payment, and trying again. Reached by a private link, no account. */
export async function publicPaymentRoutes(app: FastifyInstance) {
  app.get("/payments/:token", { config: { rateLimit: { max: 90, timeWindow: "1 minute" } } }, paymentStatusHandler);
  app.post("/payments/:token/retry", { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } }, retryPaymentHandler);
}

/**
 * Monime's notifications. Public on purpose (Monime has no login to ours); it is protected by the signature, by
 * recording every event once, and above all by never trusting the message: it only prompts a direct check with Monime.
 * It gets its own JSON reader so the exact bytes that were signed are available.
 */
export async function webhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 256 * 1024 }, (request, body, done) => {
    try {
      (request as unknown as { rawBody: string }).rawBody = body as string;
      done(null, JSON.parse(body as string));
    } catch {
      // A body that isn't JSON is the sender's mistake (400), not a fault of ours.
      done(Object.assign(new Error("Invalid JSON"), { statusCode: 400 }), undefined);
    }
  });
  app.post("/monime", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, monimeWebhookHandler);
}

/** A program's payment settings and its payments table. */
export async function programPaymentRoutes(app: FastifyInstance) {
  app.get("/:programId/payments", { preHandler: requireProgramAccess("viewer") }, listProgramPaymentsHandler);
  app.get("/:programId/analytics/payments", { preHandler: requireProgramAccess("viewer") }, programPaymentAnalyticsHandler);
  app.post("/:programId/payments/:paymentId/refund", { preHandler: requireProgramAccess("admin"), config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, refundPaymentHandler);
  app.get("/:programId/payments/:paymentId/refunds", { preHandler: requireProgramAccess("viewer") }, listPaymentRefundsHandler);
  app.get("/:programId/payment-terms", { preHandler: requireProgramAccess("viewer") }, paymentTermsHandler);
  app.put("/:programId/payment-config", { preHandler: requireProgramAccess("admin") }, updatePaymentConfigHandler);
  app.post("/:programId/registrations/:registrationId/paid-in-person", { preHandler: requireProgramAccess("admin") }, confirmPaidInPersonHandler);
  app.post("/:programId/registrations/:registrationId/waive-payment", { preHandler: requireProgramAccess("admin") }, waivePaymentHandler);
}

/** The payment fund: an organization's balance, where it withdraws to, and its withdrawals. Organization admins only. */
export async function fundsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("admin"));
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
  app.get("/", fundsSummaryHandler);
  app.get("/entries", fundsEntriesHandler);
  app.get("/payouts", fundsPayoutsHandler);
  app.get("/refunds", fundsRefundsHandler);
  app.post("/accounts", strict, addAccountHandler);
  app.post("/accounts/:accountId/remove", strict, removeAccountHandler);
  app.post("/payouts", strict, requestPayoutHandler);
  app.post("/payouts/:payoutId/cancel", strict, cancelPayoutHandler);
}

/** For the platform's super admin: withdrawals waiting for approval, payments that need a look, and Monime balances. */
export async function platformPaymentRoutes(app: FastifyInstance) {
  app.get("/payments", platformPaymentsOverviewHandler);
  app.post("/payments/payouts/:payoutId/review", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, reviewPayoutHandler);
  app.post("/payments/refunds/:refundId/review", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, reviewRefundHandler);
  app.post("/payments/payments/:paymentId/recheck", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, recheckPaymentHandler);
}
