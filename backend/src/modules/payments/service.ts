import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { dateRangeConditions } from "../../lib/dateRange.js";
import { db } from "../../db/client.js";
import { forms, payments, pollPositions, polls, programs, registrations } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { formatMinor } from "../../lib/money.js";
import { buildPaginatedResult, toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";
import { recordAudit } from "../audit/recorder.js";
import { queueEmail } from "../email/outbox.js";
import { paymentReceivedEmail } from "../email/templates.js";
import { signSubmissionToken } from "../registrations/summary.js";
import { riskFlagsFor, type PaymentActor } from "./fraud.js";
import {
  createCheckoutSession,
  getCheckoutSession,
  isMonimeConfigured,
  isTrustedCheckoutUrl,
  listPaymentsForOrder,
  MonimeError,
  type MonimePayment,
} from "./monime.js";
import { assertChargeable, type LineItem } from "./pricing.js";
import { refundableAt } from "./refunds.js";
import { creditPayment } from "./wallet.js";

export type PaymentRow = typeof payments.$inferSelect;
type ProgramRow = typeof programs.$inferSelect;
type RegistrationRow = typeof registrations.$inferSelect;

// ---------------------------------------------------------------- private links

const PAYMENT_KEY = createHmac("sha256", env.JWT_SECRET).update("payment-status-token").digest();

/**
 * A private link that lets the payer see, resume and retry one payment without an account.
 * It is kept short on purpose: Monime only accepts return addresses up to 255 characters, and the link is part of them.
 * Form: <payment id>.<expiry>.<signature>
 */
const TOKEN_LIFETIME_MS = 14 * 24 * 60 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenSignature = (paymentId: string, expiry: string) => createHmac("sha256", PAYMENT_KEY).update(`${paymentId}.${expiry}`).digest("base64url").slice(0, 32);

export function signPaymentToken(paymentId: string): string {
  const expiry = Math.floor((Date.now() + TOKEN_LIFETIME_MS) / 1000).toString(36);
  return `${paymentId}.${expiry}.${tokenSignature(paymentId, expiry)}`;
}

export function readPaymentToken(token: string): string {
  const [id, expiry, signature, extra] = token.split(".");
  const valid =
    extra === undefined &&
    id !== undefined &&
    expiry !== undefined &&
    signature !== undefined &&
    UUID_RE.test(id) &&
    timingSafeEqual(Buffer.from(signature.padEnd(32, "~")), Buffer.from(tokenSignature(id, expiry).padEnd(32, "~"))) &&
    signature.length === 32 &&
    parseInt(expiry, 36) * 1000 > Date.now();
  if (!valid) throw AppError.notFound("This payment link has expired or isn't valid");
  return id;
}

export function assertPaymentsAvailable() {
  if (!isMonimeConfigured()) throw AppError.paymentUnavailable("Payments are not set up on this platform yet.");
}

// ---------------------------------------------------------------- starting a payment

export interface PaymentStart {
  token: string;
  status: "pending" | "failed";
  /** Where to send the payer to pay; null if the payment page could not be opened (they can retry from the status page). */
  redirectUrl: string | null;
  amountMinor: number;
  currency: string;
}

/** Keeps what Monime said when a payment page could not be opened (the payer only sees a general message). */
function noteCheckoutFailure(payment: PaymentRow, err: unknown) {
  const monime = err instanceof MonimeError;
  const reason = monime ? `${err.reason ?? err.message}${err.status ? ` (Monime answered ${err.status})` : ""}` : err instanceof AppError ? err.message : "Unexpected error";
  console.error("Could not open a Monime payment page:", reason, monime && err.requestId ? `request ${err.requestId}` : "");
  void recordAudit({
    action: "payment.checkout_failed",
    label: "A payment page could not be opened",
    actorType: "system",
    tenantId: payment.tenantId,
    entityType: "payment",
    entityId: payment.id,
    outcome: "failed",
    metadata: { programId: payment.programId, reason, ...(monime && err.requestId ? { requestId: err.requestId } : {}) },
  });
  return reason;
}

export async function openCheckout(payment: PaymentRow, programName: string): Promise<PaymentRow> {
  try {
    return await openCheckoutUnchecked(payment, programName);
  } catch (err) {
    noteCheckoutFailure(payment, err);
    throw err;
  }
}

async function openCheckoutUnchecked(payment: PaymentRow, programName: string): Promise<PaymentRow> {
  const token = signPaymentToken(payment.id);
  const base = env.APP_URL.replace(/\/$/, "");
  const lines = payment.lineItems as LineItem[];
  const session = await createCheckoutSession({
    // The payment's own id: asking twice for the same payment can never create a second checkout.
    idempotencyKey: payment.id,
    name: programName,
    description: lines.map((l) => (l.quantity > 1 ? `${l.quantity} x ${l.name}` : l.name)).join(", "),
    reference: payment.id,
    successUrl: `${base}/payment/${token}?result=success`,
    cancelUrl: `${base}/payment/${token}?result=cancelled`,
    lineItems: lines.map((l) => ({ name: l.name, unitMinor: l.unitMinor, quantity: l.quantity, reference: l.id })),
    metadata: { paymentId: payment.id, ...(payment.programId ? { programId: payment.programId } : {}), ...(payment.pollId ? { pollId: payment.pollId } : {}) },
  });
  // Only ever send a payer to Monime's own pages.
  if (!isTrustedCheckoutUrl(session.redirectUrl)) {
    console.error("Monime returned an untrusted checkout address; refusing to use it");
    throw AppError.paymentUnavailable();
  }
  const [updated] = await db
    .update(payments)
    .set({
      checkoutSessionId: session.id,
      providerOrderNumber: session.orderNumber ?? null,
      redirectUrl: session.redirectUrl,
      expiresAt: session.expireTime ? new Date(session.expireTime) : new Date(Date.now() + 30 * 60_000),
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id))
    .returning();
  return updated!;
}

/** Records what has to be paid for a saved registration or order and opens Monime's payment page for it. */
export async function startPayment(input: {
  program: ProgramRow;
  registration: RegistrationRow;
  purpose: "registration" | "order";
  lines: LineItem[];
  totalMinor: number;
  payer: { name: string | null; email: string | null; phone: string | null };
  context: { ip?: string | null; userAgent?: string | null };
}): Promise<PaymentStart> {
  assertChargeable(input.totalMinor);
  const actor: PaymentActor = { ip: input.context.ip, email: input.payer.email, phone: input.payer.phone };
  const flags = await riskFlagsFor(actor, input.totalMinor);

  const [created] = await db
    .insert(payments)
    .values({
      tenantId: input.program.tenantId,
      programId: input.program.id,
      registrationId: input.registration.id,
      purpose: input.purpose,
      amountMinor: input.totalMinor,
      lineItems: input.lines,
      payerName: input.payer.name,
      payerEmail: input.payer.email?.toLowerCase() ?? null,
      payerPhone: input.payer.phone,
      risk: { flags },
      ipAddress: input.context.ip ?? null,
      userAgent: input.context.userAgent?.slice(0, 300) ?? null,
    })
    .returning();
  await db.update(registrations).set({ paymentStatus: "pending", amountDueMinor: input.totalMinor }).where(eq(registrations.id, input.registration.id));

  const token = signPaymentToken(created!.id);
  void recordAudit({
    action: "payment.started",
    actorType: "visitor",
    tenantId: input.program.tenantId,
    entityType: "payment",
    entityId: created!.id,
    metadata: { registrationNumber: input.registration.registrationNumber, amountMinor: input.totalMinor, purpose: input.purpose, flags: flags.length ? flags : undefined },
  });
  try {
    const opened = await openCheckout(created!, input.program.name);
    return { token, status: "pending", redirectUrl: opened.redirectUrl, amountMinor: input.totalMinor, currency: "SLE" };
  } catch (err) {
    // The registration is saved either way; the payer can come back to the payment link and try again.
    await db.update(payments).set({ status: "failed", failureReason: "The payment page could not be opened", updatedAt: new Date() }).where(eq(payments.id, created!.id));
    console.error("Could not open a checkout session", err instanceof MonimeError ? { status: err.status, requestId: err.requestId } : err);
    return { token, status: "failed", redirectUrl: null, amountMinor: input.totalMinor, currency: "SLE" };
  }
}

// ---------------------------------------------------------------- what the payer sees

async function paymentWithContext(paymentId: string) {
  const [row] = await db
    .select({
      payment: payments,
      registration: registrations,
      programName: programs.name,
      programSlug: programs.slug,
      programKind: programs.kind,
      idCardEnabled: programs.idCardEnabled,
      ticketEnabled: programs.ticketEnabled,
      idCardConfig: programs.idCardConfig,
      ticketConfig: programs.ticketConfig,
      allowSubmissionCopy: programs.allowSubmissionCopy,
      confirmationMessage: forms.confirmationMessage,
      showRegistrationNumber: forms.showRegistrationNumber,
    })
    .from(payments)
    .innerJoin(registrations, eq(registrations.id, payments.registrationId))
    .innerJoin(programs, eq(programs.id, payments.programId))
    .innerJoin(forms, eq(forms.id, registrations.formId))
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!row) throw AppError.notFound("Payment not found");
  return row;
}

const lastRefresh = new Map<string, number>();

/** Asks Monime about an open payment (at most every few seconds per payment) and returns the fresh row. */
async function refreshIfOpen(payment: PaymentRow, refresh: boolean | undefined): Promise<PaymentRow> {
  if (!refresh || payment.status !== "pending" || !payment.checkoutSessionId) return payment;
  const last = lastRefresh.get(payment.id) ?? 0;
  if (Date.now() - last <= 3_000) return payment;
  lastRefresh.set(payment.id, Date.now());
  try {
    return await refreshPayment(payment.id);
  } catch (err) {
    console.error("Could not refresh a payment from the status page", err instanceof MonimeError ? err.message : err);
    return payment;
  }
}

/** The status page of a payment for votes: what was bought, whether it is paid, and where to go to use the votes. */
async function pollPaymentStatus(initial: PaymentRow, options: { refresh?: boolean }) {
  const payment = await refreshIfOpen(initial, options.refresh);
  const [row] = await db
    .select({ name: polls.name, slug: polls.slug, closesAt: polls.closesAt, status: polls.status, positionTitle: pollPositions.title })
    .from(polls)
    .leftJoin(pollPositions, eq(pollPositions.id, payment.pollPositionId ?? sql`null`))
    .where(eq(polls.id, payment.pollId!))
    .limit(1);
  if (!row) throw AppError.notFound("Payment not found");
  const open = payment.status === "pending" && (!payment.expiresAt || payment.expiresAt > new Date());
  const paid = payment.status === "completed";
  return {
    status: payment.status,
    registrationPaymentStatus: paid ? "paid" : payment.status === "review" ? "review" : "pending",
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    lineItems: payment.lineItems as LineItem[],
    registrationNumber: "",
    programName: row.name,
    programSlug: row.slug,
    kind: "poll" as const,
    paidAt: payment.paidAt,
    redirectUrl: open ? payment.redirectUrl : null,
    expiresAt: payment.expiresAt,
    canRetry: payment.status !== "pending" && payment.status !== "completed" && payment.status !== "review" && !payment.redeemedAt,
    registrationStatus: "",
    confirmationMessage: null,
    showRegistrationNumber: false,
    idCardAvailable: false,
    ticketAvailable: false,
    poll: {
      slug: row.slug,
      name: row.name,
      positionTitle: row.positionTitle ?? "this position",
      votes: payment.votesBought ?? 0,
      used: Boolean(payment.redeemedAt),
      refunded: payment.refundedMinor > 0,
    },
  };
}

/** The state of a payment for the payer's status page. While it is still open, asks Monime (at most every few seconds). */
export async function paymentStatusForToken(token: string, options: { refresh?: boolean } = {}) {
  const paymentId = readPaymentToken(token);
  const [raw] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (raw?.pollId) return pollPaymentStatus(raw, options);
  let ctx = await paymentWithContext(paymentId);
  if (options.refresh && ctx.payment.status === "pending" && ctx.payment.checkoutSessionId) {
    const last = lastRefresh.get(paymentId) ?? 0;
    if (Date.now() - last > 3_000) {
      lastRefresh.set(paymentId, Date.now());
      try {
        await refreshPayment(paymentId);
        ctx = await paymentWithContext(paymentId);
      } catch (err) {
        console.error("Could not refresh a payment from the status page", err instanceof MonimeError ? err.message : err);
      }
    }
  }
  if (lastRefresh.size > 5_000) lastRefresh.clear();
  const { payment, registration } = ctx;
  const open = payment.status === "pending" && (!payment.expiresAt || payment.expiresAt > new Date());
  return {
    status: payment.status,
    // What the registration as a whole is waiting on: pending, paid, review or waived.
    registrationPaymentStatus: registration.paymentStatus,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    lineItems: payment.lineItems as LineItem[],
    registrationNumber: registration.registrationNumber,
    programName: ctx.programName,
    programSlug: ctx.programSlug,
    kind: ctx.programKind,
    paidAt: payment.paidAt,
    // Only offered while the payment can still be completed there.
    redirectUrl: open ? payment.redirectUrl : null,
    expiresAt: payment.expiresAt,
    canRetry: registration.paymentStatus !== "paid" && registration.paymentStatus !== "waived" && payment.status !== "pending",
    registrationStatus: registration.status,
    confirmationMessage: ctx.confirmationMessage,
    showRegistrationNumber: ctx.showRegistrationNumber,
    // Not offered for download when the registrant chose to buy them in person.
    idCardAvailable: ctx.idCardEnabled && (ctx.idCardConfig as { showOnConfirmation?: boolean } | null)?.showOnConfirmation !== false && !registration.documentsInPerson,
    ticketAvailable: ctx.ticketEnabled && (ctx.ticketConfig as { showOnConfirmation?: boolean } | null)?.showOnConfirmation !== false && !registration.documentsInPerson,
    documentsInPerson: registration.documentsInPerson,
    // Lets them view and keep a copy of what they submitted, once it is paid (orders always get one).
    receiptToken: ctx.programKind === "order_form" || ctx.allowSubmissionCopy ? signSubmissionToken(registration.id) : undefined,
  };
}

/** Starts a fresh payment for the same registration (same items and total) after one failed, expired or was cancelled. */
export async function retryPaymentForToken(token: string, context: { ip?: string | null; userAgent?: string | null }) {
  assertPaymentsAvailable();
  const paymentId = readPaymentToken(token);
  const [raw] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (raw?.pollId) return retryVotePayment(raw, token, context);
  const ctx = await paymentWithContext(paymentId);
  const { payment, registration } = ctx;
  if (registration.paymentStatus === "paid" || registration.paymentStatus === "waived") throw AppError.conflict("This has already been paid.");
  if (registration.paymentStatus === "review") throw AppError.conflict("This payment is being checked by the organizer. Please wait or contact them.");

  // A payment that is still open is simply resumed.
  if (payment.status === "pending" && payment.redirectUrl && (!payment.expiresAt || payment.expiresAt > new Date())) {
    return { token, status: "pending" as const, redirectUrl: payment.redirectUrl, amountMinor: payment.amountMinor, currency: payment.currency };
  }

  const [attempts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.registrationId, registration.id), sql`${payments.createdAt} > now() - interval '24 hours'`));
  if ((attempts?.n ?? 0) >= 6) throw new AppError("RATE_LIMITED", "Too many payment attempts for this registration today. Please try again tomorrow or contact the organizer.", 429);

  const flags = await riskFlagsFor({ ip: context.ip, email: payment.payerEmail, phone: payment.payerPhone }, payment.amountMinor);
  const [created] = await db
    .insert(payments)
    .values({
      tenantId: payment.tenantId,
      programId: payment.programId,
      registrationId: payment.registrationId,
      purpose: payment.purpose,
      amountMinor: payment.amountMinor,
      lineItems: payment.lineItems,
      payerName: payment.payerName,
      payerEmail: payment.payerEmail,
      payerPhone: payment.payerPhone,
      risk: { flags },
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
    })
    .returning();
  const newToken = signPaymentToken(created!.id);
  try {
    const opened = await openCheckout(created!, ctx.programName);
    return { token: newToken, status: "pending" as const, redirectUrl: opened.redirectUrl, amountMinor: payment.amountMinor, currency: payment.currency };
  } catch (err) {
    await db.update(payments).set({ status: "failed", failureReason: "The payment page could not be opened", updatedAt: new Date() }).where(eq(payments.id, created!.id));
    if (err instanceof AppError) throw err;
    throw AppError.paymentUnavailable();
  }
}

/** Starts the same vote purchase again after it failed, expired or was cancelled (same votes, same price). */
async function retryVotePayment(payment: PaymentRow, token: string, context: { ip?: string | null; userAgent?: string | null }) {
  if (payment.status === "completed" || payment.status === "review") throw AppError.conflict("This has already been paid.");
  if (payment.status === "pending" && payment.redirectUrl && (!payment.expiresAt || payment.expiresAt > new Date())) {
    return { token, status: "pending" as const, redirectUrl: payment.redirectUrl, amountMinor: payment.amountMinor, currency: payment.currency };
  }
  const [poll] = await db.select().from(polls).where(eq(polls.id, payment.pollId!)).limit(1);
  if (!poll || poll.deletedAt || poll.status !== "open" || (poll.closesAt && poll.closesAt <= new Date())) throw AppError.conflict("Voting is not open for this poll.");
  const [attempts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.voterId, payment.voterId!), eq(payments.pollId, payment.pollId!), sql`${payments.createdAt} > now() - interval '24 hours'`));
  if ((attempts?.n ?? 0) >= 10) throw new AppError("RATE_LIMITED", "Too many payment attempts today. Please try again tomorrow.", 429);
  const flags = await riskFlagsFor({ ip: context.ip, email: payment.payerEmail, phone: payment.payerPhone }, payment.amountMinor);
  const [created] = await db
    .insert(payments)
    .values({
      tenantId: payment.tenantId,
      pollId: payment.pollId,
      voterId: payment.voterId,
      pollPositionId: payment.pollPositionId,
      votesBought: payment.votesBought,
      purpose: "vote",
      amountMinor: payment.amountMinor,
      lineItems: payment.lineItems,
      payerName: payment.payerName,
      payerEmail: payment.payerEmail,
      risk: { flags },
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
    })
    .returning();
  try {
    const opened = await openCheckout(created!, poll.name);
    return { token: signPaymentToken(created!.id), status: "pending" as const, redirectUrl: opened.redirectUrl, amountMinor: payment.amountMinor, currency: payment.currency };
  } catch (err) {
    await db.update(payments).set({ status: "failed", failureReason: "The payment page could not be opened", updatedAt: new Date() }).where(eq(payments.id, created!.id));
    if (err instanceof AppError) throw err;
    throw AppError.paymentUnavailable();
  }
}

// ---------------------------------------------------------------- settling a payment

/** What Monime says was paid for a payment, worked out from the checkout session and its payments. */
export interface ProviderVerdict {
  outcome: "completed" | "underpaid" | "cancelled" | "expired" | "pending" | "mismatch";
  receivedMinor?: number;
  payment?: MonimePayment;
  detail?: string;
}

export async function verifyWithProvider(payment: PaymentRow): Promise<ProviderVerdict> {
  if (!payment.checkoutSessionId) return { outcome: "pending" };
  const session = await getCheckoutSession(payment.checkoutSessionId);
  // The session must be the one we made for this very payment.
  if (session.reference && session.reference !== payment.id) return { outcome: "mismatch", detail: "The checkout belongs to a different payment" };
  if (session.status === "cancelled") return { outcome: "cancelled" };
  if (session.status === "expired") return { outcome: "expired" };
  if (session.status !== "completed") return { outcome: "pending" };
  if (!session.orderNumber) return { outcome: "pending" };

  const found = await listPaymentsForOrder(session.orderNumber);
  const done = found.filter((p) => p.status === "completed" && p.amount?.currency === payment.currency);
  if (done.length === 0) return { outcome: "pending" };
  const received = done.reduce((sum, p) => sum + p.amount.value, 0);
  if (received < payment.amountMinor) return { outcome: "underpaid", receivedMinor: received, payment: done[0] };
  return { outcome: "completed", receivedMinor: received, payment: done[0] };
}

async function setRegistrationStatus(registrationId: string, status: string, paidAt?: Date) {
  await db.update(registrations).set({ paymentStatus: status, ...(paidAt ? { paidAt } : {}) }).where(eq(registrations.id, registrationId));
}

function channelOf(p: MonimePayment | undefined) {
  if (!p?.channel) return null;
  // Keep only what helps a person recognise the payment; the provider already masks phone and account numbers.
  const { type, provider, reference, phoneNumber, accountNumber, scheme, last4 } = p.channel;
  return { type, provider, reference, phoneNumber, accountNumber, scheme, last4 };
}

/** Marks a payment paid, once, and credits the organization. Safe to run twice for the same payment. */
async function completePayment(paymentId: string, verdict: ProviderVerdict): Promise<{ firstTime: boolean }> {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!row) throw AppError.notFound("Payment not found");
    if (row.status === "completed") return { firstTime: false, row };

    const { feeMinor, netMinor } = await creditPayment(tx, row);
    const risk = row.risk as { flags?: string[] };
    const flags = [...(risk.flags ?? [])];
    if ((verdict.receivedMinor ?? row.amountMinor) > row.amountMinor) flags.push("overpaid");
    const now = new Date();
    const [updated] = await tx
      .update(payments)
      .set({
        status: "completed",
        paidAt: now,
        updatedAt: now,
        feeMinor,
        netMinor,
        channel: channelOf(verdict.payment),
        providerPaymentId: verdict.payment?.id ?? null,
        providerFees: verdict.payment?.fees ?? null,
        risk: { ...risk, flags },
        failureReason: null,
      })
      .where(eq(payments.id, paymentId))
      .returning();
    if (row.registrationId) await tx.update(registrations).set({ paymentStatus: "paid", paidAt: now }).where(eq(registrations.id, row.registrationId));
    return { firstTime: true, row: updated! };
  });

  if (result.firstTime) {
    const row = result.row;
    void recordAudit({ action: "payment.completed", actorType: "system", tenantId: row.tenantId, entityType: "payment", entityId: row.id, metadata: { programId: row.programId, amountMinor: row.amountMinor, registrationId: row.registrationId } });
    if (row.payerEmail) {
      const email = paymentReceivedEmail({
        payerName: row.payerName ?? "there",
        amount: formatMinor(row.amountMinor, row.currency),
        lines: (row.lineItems as LineItem[]).map((l) => ({ label: l.quantity > 1 ? `${l.quantity} x ${l.name}` : l.name, value: formatMinor(l.totalMinor, row.currency) })),
        reference: row.providerOrderNumber ?? row.id.slice(0, 8).toUpperCase(),
      });
      void queueEmail({ to: row.payerEmail, toName: row.payerName ?? row.payerEmail, subject: email.subject, html: email.html });
    }
  }
  return { firstTime: result.firstTime };
}

async function markPayment(paymentId: string, status: "failed" | "expired" | "cancelled" | "review", reason?: string) {
  const [row] = await db
    .update(payments)
    .set({ status, failureReason: reason ?? null, updatedAt: new Date() })
    .where(and(eq(payments.id, paymentId), inArray(payments.status, ["pending", "review"])))
    .returning();
  if (!row) return;
  void recordAudit({
    action: `payment.${status}`,
    actorType: "system",
    tenantId: row.tenantId,
    entityType: "payment",
    entityId: row.id,
    outcome: status === "review" || status === "failed" ? "failed" : "success",
    metadata: { reason: reason ?? undefined, amountMinor: row.amountMinor },
  });
  // The registration keeps waiting for payment unless the amount needs a person's look.
  if (!row.registrationId) return; // a payment for votes has no registration to update
  if (status === "review") await setRegistrationStatus(row.registrationId, "review");
  else {
    const [paid] = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.registrationId, row.registrationId), eq(payments.status, "completed"))).limit(1);
    if (!paid) await setRegistrationStatus(row.registrationId, "pending");
  }
}

/** Records why a payer's attempt failed on Monime's page, once per reason, without changing the payment's state. */
async function noteFailedAttempts(payment: PaymentRow) {
  if (!payment.providerOrderNumber) return;
  try {
    const attempts = await listPaymentsForOrder(payment.providerOrderNumber);
    const failed = attempts.filter((a) => !["pending", "processing", "completed"].includes(String(a.status)));
    const latest = failed[failed.length - 1];
    if (!latest) return;
    const why = `Monime attempt ${String(latest.status)}${latest.failureDetail?.code ? ` (${latest.failureDetail.code})` : ""}${latest.failureDetail?.message ? `: ${latest.failureDetail.message}` : ""}`.slice(0, 280);
    if (payment.failureReason === why) return;
    await db.update(payments).set({ failureReason: why, updatedAt: new Date() }).where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
    void recordAudit({
      action: "payment.attempt_failed",
      label: "A payment attempt failed on Monime's page",
      actorType: "system",
      tenantId: payment.tenantId,
      entityType: "payment",
      entityId: payment.id,
      outcome: "failed",
      metadata: { reason: why, attempts: failed.length, amountMinor: payment.amountMinor },
    });
  } catch (err) {
    console.error("Could not read failed attempts", payment.id, err instanceof MonimeError ? err.message : err);
  }
}

/**
 * Asks Monime what happened to a payment and settles it. This is the only place a payment becomes "paid":
 * webhooks, the return from Monime's page and the background check all end up here, so nothing a browser or a
 * forged message says can mark money as received.
 */
export async function refreshPayment(paymentId: string): Promise<PaymentRow> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) throw AppError.notFound("Payment not found");
  if (payment.status !== "pending" && payment.status !== "review") return payment;
  if (!payment.checkoutSessionId) {
    if (Date.now() - payment.createdAt.getTime() > 15 * 60_000) await markPayment(paymentId, "failed", "The payment page was never opened");
    return (await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0]!;
  }

  const verdict = await verifyWithProvider(payment);
  switch (verdict.outcome) {
    case "completed":
      await completePayment(paymentId, verdict);
      break;
    case "underpaid":
      await markPayment(paymentId, "review", `Received ${formatMinor(verdict.receivedMinor ?? 0)} of ${formatMinor(payment.amountMinor)}`);
      break;
    case "mismatch":
      await markPayment(paymentId, "review", verdict.detail);
      break;
    case "cancelled":
      await markPayment(paymentId, "cancelled");
      break;
    case "expired":
      await markPayment(paymentId, "expired");
      break;
    case "pending":
      // Still open. If the payer's attempts have been failing on Monime's page ("transaction error"), keep Monime's reason
      // so the team can see it next to the payment instead of guessing.
      await noteFailedAttempts(payment);
      break;
  }
  return (await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0]!;
}

/** Background check: settles open payments Monime has news about, and closes ones that were abandoned. */
export async function reconcilePendingPayments(limit = 25): Promise<number> {
  if (!isMonimeConfigured()) return 0;
  const open = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.status, "pending"), lt(payments.createdAt, new Date(Date.now() - 45_000)), sql`${payments.createdAt} > now() - interval '3 days'`))
    .orderBy(payments.createdAt)
    .limit(limit);
  let handled = 0;
  for (const { id } of open) {
    try {
      await refreshPayment(id);
      handled++;
    } catch (err) {
      console.error("Could not check a payment", id, err instanceof MonimeError ? err.message : err);
    }
  }
  // Anything still open long after its checkout lapsed is closed (Monime will have said so; this is the safety net).
  await db
    .update(payments)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(payments.status, "pending"), lt(payments.createdAt, new Date(Date.now() - 3 * 24 * 3_600_000))));
  return handled;
}

// ---------------------------------------------------------------- for the team

export async function listProgramPayments(programId: string, query: { status?: string; dateFrom?: Date; dateTo?: Date } & PaginationInput) {
  const { offset, limit } = toOffsetLimit(query);
  const where = and(eq(payments.programId, programId), query.status ? eq(payments.status, query.status) : undefined, ...dateRangeConditions(payments.createdAt, query));
  const [items, totals] = await Promise.all([
    db
      .select({
        id: payments.id,
        status: payments.status,
        amountMinor: payments.amountMinor,
        feeMinor: payments.feeMinor,
        refundedMinor: payments.refundedMinor,
        providerOrderNumber: payments.providerOrderNumber,
        currency: payments.currency,
        purpose: payments.purpose,
        payerName: payments.payerName,
        payerEmail: payments.payerEmail,
        payerPhone: payments.payerPhone,
        channel: payments.channel,
        failureReason: payments.failureReason,
        risk: payments.risk,
        createdAt: payments.createdAt,
        paidAt: payments.paidAt,
        registrationId: payments.registrationId,
        registrationNumber: registrations.registrationNumber,
      })
      .from(payments)
      .innerJoin(registrations, eq(registrations.id, payments.registrationId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        paid: sql<string>`coalesce(sum(case when ${payments.status} = 'completed' then ${payments.amountMinor} else 0 end), 0)`,
        pending: sql<string>`coalesce(sum(case when ${payments.status} = 'pending' then ${payments.amountMinor} else 0 end), 0)`,
      })
      .from(payments)
      .where(where),
  ]);
  const t = totals[0];
  return { ...buildPaginatedResult(items.map((i) => ({ ...i, refundableAt: refundableAt(i.paidAt) })), t?.count ?? 0, query), summary: { paidMinor: Number(t?.paid ?? 0), pendingMinor: Number(t?.pending ?? 0) } };
}

/** An admin confirms the registrant paid for their ID card and ticket in person: they are unlocked from now on. */
export async function confirmDocumentsPaidInPerson(programId: string, registrationId: string, actorId: string) {
  const [registration] = await db.select().from(registrations).where(and(eq(registrations.id, registrationId), eq(registrations.programId, programId))).limit(1);
  if (!registration) throw AppError.notFound("Registration not found");
  if (!registration.documentsInPerson) throw AppError.conflict("This person has not chosen to pay in person.");
  await db.update(registrations).set({ documentsInPerson: false, updatedAt: new Date() }).where(eq(registrations.id, registrationId));
  await recordAudit({ actorUserId: actorId, action: "payment.paid_in_person", entityType: "registration", entityId: registrationId, metadata: { programId } });
}

/** An admin lets a registration through without payment (for example it was paid in cash). */
export async function waiveRegistrationPayment(programId: string, registrationId: string, actorId: string, note?: string) {
  const [registration] = await db.select().from(registrations).where(and(eq(registrations.id, registrationId), eq(registrations.programId, programId))).limit(1);
  if (!registration) throw AppError.notFound("Registration not found");
  if (registration.paymentStatus === "paid") throw AppError.conflict("This has already been paid.");
  await db.transaction(async (tx) => {
    await tx.update(registrations).set({ paymentStatus: "waived", documentsInPerson: false }).where(eq(registrations.id, registrationId));
    await tx
      .update(payments)
      .set({ status: "cancelled", failureReason: "Waived by an administrator", updatedAt: new Date() })
      .where(and(eq(payments.registrationId, registrationId), inArray(payments.status, ["pending", "review"])));
  });
  await recordAudit({ actorUserId: actorId, action: "payment.waived", entityType: "registration", entityId: registrationId, metadata: { programId, note } });
}
