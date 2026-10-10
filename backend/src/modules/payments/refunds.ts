import { and, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { payments, programs, refunds, registrations, tenants, walletEntries } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { formatMinor, leonesToMinor } from "../../lib/money.js";
import { buildPaginatedResult, toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";
import { recordAudit } from "../audit/recorder.js";
import { queueEmail } from "../email/outbox.js";
import { paymentsNoticeEmail } from "../email/templates.js";
import { createPayout, getPayout, isMonimeConfigured, MonimeError } from "./monime.js";
import { confirmPassword, normalizePhone, notifyAdmins, payoutProviders } from "./payouts.js";
import { balancesFor, type Tx } from "./wallet.js";

// Refunds: money sent back to someone who paid. Monime has no "refund" call, so a refund is a transfer from the
// platform's Monime account to the payer's mobile money number. Around it:
//  - only a payment that was really completed can be refunded, and never for more than it was (all refunds together);
//  - the person must be an admin of the organization (or the platform team) and re-enter their password;
//  - the money leaves the organization's balance the moment it is requested, and comes back if the transfer fails;
//  - the platform's fee goes back in proportion, so nobody is charged a fee on money that was given back;
//  - big refunds wait for a person on the platform team to approve them, and daily limits apply;
//  - every step is written to the audit log.

type RefundRow = typeof refunds.$inferSelect;

const maskPhone = (value: string) => (value.length <= 4 ? "••••" : `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`);

/** When a payment received at `paidAt` can first be refunded. */
export const refundableAt = (paidAt: Date | null) => (paidAt ? new Date(paidAt.getTime() + env.REFUND_DELAY_MINUTES * 60_000) : null);

export interface RefundActor {
  id: string;
  role: string;
  tenantId: string | null;
}

/** Who a refund can be paid back to: the providers Monime can send mobile money to. */
async function assertMomoProvider(providerId: string) {
  const providers = await payoutProviders();
  if (!providers.momo.some((p) => p.providerId === providerId)) throw AppError.validation("Choose Orange Money or Africell Money for the refund.");
}

/** What this refund returns of the platform's fee: in proportion, and the exact rest on the last refund of a payment. */
export function feeShare(payment: { amountMinor: number; feeMinor: number; refundedMinor: number }, priorFeeRefunded: number, amountMinor: number) {
  const remaining = payment.amountMinor - payment.refundedMinor;
  if (amountMinor === remaining) return Math.max(0, payment.feeMinor - priorFeeRefunded);
  return Math.min(Math.max(0, payment.feeMinor - priorFeeRefunded), Math.round((payment.feeMinor * amountMinor) / payment.amountMinor));
}

export async function requestRefund(
  actor: RefundActor,
  input: { paymentId: string; programId?: string; pollId?: string; amountMinor: number; reason: string; providerId: string; phoneNumber: string; password: string },
  ipAddress?: string,
) {
  if (actor.role !== "admin" && actor.role !== "super_admin") throw AppError.forbidden("Only an organization admin can refund a payment.");
  if (!isMonimeConfigured()) throw AppError.conflict("Payments are not set up on this platform yet.");
  await confirmPassword(actor.id, input.password);
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw AppError.validation("Enter the amount to refund.");
  const reason = input.reason.trim();
  if (reason.length < 3) throw AppError.validation("Say why this payment is being refunded.");
  await assertMomoProvider(input.providerId);
  const phoneNumber = normalizePhone(input.phoneNumber);

  const created = await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, input.paymentId), input.pollId ? eq(payments.pollId, input.pollId) : eq(payments.programId, input.programId ?? "")))
      .for("update");
    if (!payment) throw AppError.notFound("Payment not found");
    if (actor.role === "admin" && payment.tenantId !== actor.tenantId) throw AppError.notFound("Payment not found");
    if (payment.status !== "completed" || !payment.paidAt) throw AppError.conflict("Only a payment that was received can be refunded.");
    // Votes that were already cast can't be taken back, so their payment can't be given back either.
    if (payment.redeemedAt) throw AppError.conflict("These votes have already been used, so the payment can't be refunded.");
    const opens = refundableAt(payment.paidAt)!;
    if (opens.getTime() > Date.now()) {
      const left = Math.max(1, Math.ceil((opens.getTime() - Date.now()) / 60_000));
      throw AppError.conflict(`A payment can be refunded ${env.REFUND_DELAY_MINUTES} minutes after it is received. Try again in about ${left} minute${left === 1 ? "" : "s"}.`);
    }
    if (payment.paidAt.getTime() < Date.now() - env.REFUND_WINDOW_DAYS * 86_400_000) {
      throw AppError.conflict(`Payments can be refunded for ${env.REFUND_WINDOW_DAYS} days after they are received.`);
    }
    const refundable = payment.amountMinor - payment.refundedMinor;
    if (input.amountMinor > refundable) throw AppError.validation(refundable > 0 ? `At most ${formatMinor(refundable, payment.currency)} can still be refunded.` : "This payment has already been refunded in full.");

    // One request at a time per organization, together with withdrawals, so the same money can't be spent twice.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${payment.tenantId}))`);

    const [prior] = await tx
      .select({ fee: sql<string>`coalesce(sum(${refunds.feeRefundMinor}), 0)`, open: sql<number>`count(*) filter (where ${refunds.status} in ('pending_review', 'queued', 'processing'))::int` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, payment.id), notInArray(refunds.status, ["failed", "rejected"])));
    if ((prior?.open ?? 0) > 0) throw AppError.conflict("A refund for this payment is already on its way. Wait for it to finish first.");
    const feeRefundMinor = feeShare(payment, Number(prior?.fee ?? 0), input.amountMinor);
    const debit = input.amountMinor - feeRefundMinor;

    const balances = await balancesFor(payment.tenantId, tx);
    if (debit > balances.totalMinor) {
      throw AppError.validation(`There is not enough in the payment fund to refund this. ${formatMinor(Math.max(0, balances.totalMinor), payment.currency)} is there now.`);
    }

    const dayLimit = leonesToMinor(env.PAYOUT_DAILY_LIMIT);
    const [today] = await tx
      .select({ total: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)` })
      .from(refunds)
      .where(and(eq(refunds.tenantId, payment.tenantId), gte(refunds.createdAt, new Date(Date.now() - 24 * 3_600_000)), notInArray(refunds.status, ["failed", "rejected"])));
    if (Number(today?.total ?? 0) + input.amountMinor > dayLimit) throw AppError.validation(`The daily refund limit is ${formatMinor(dayLimit)}.`);

    const needsReview = input.amountMinor > leonesToMinor(env.PAYOUT_REVIEW_ABOVE);
    const [row] = await tx
      .insert(refunds)
      .values({
        tenantId: payment.tenantId,
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        feeRefundMinor,
        currency: payment.currency,
        reason: reason.slice(0, 300),
        providerId: input.providerId,
        phoneNumber,
        status: needsReview ? "pending_review" : "queued",
        requestedBy: actor.id,
      })
      .returning();

    // The money leaves the balance now. The fee comes back to the organization out of the platform's fees.
    await tx.insert(walletEntries).values({ tenantId: payment.tenantId, kind: "refund", amountMinor: -input.amountMinor, currency: payment.currency, availableAt: new Date(), paymentId: null, refundId: row!.id, note: "Refund" });
    if (feeRefundMinor > 0) {
      await tx.insert(walletEntries).values({ tenantId: payment.tenantId, kind: "fee_refund", amountMinor: feeRefundMinor, currency: payment.currency, availableAt: new Date(), refundId: row!.id, note: "Platform fee returned" });
      await tx.insert(walletEntries).values({ tenantId: null, kind: "platform_fee_refund", amountMinor: -feeRefundMinor, currency: payment.currency, availableAt: new Date(), refundId: row!.id, note: "Fee returned with a refund" });
    }
    const refundedMinor = payment.refundedMinor + input.amountMinor;
    await tx.update(payments).set({ refundedMinor, updatedAt: new Date() }).where(eq(payments.id, payment.id));
    // Refunded in full: the registration no longer counts as paid, so its ID card and ticket are no longer given out.
    if (refundedMinor >= payment.amountMinor && payment.registrationId) await tx.update(registrations).set({ paymentStatus: "refunded" }).where(and(eq(registrations.id, payment.registrationId), eq(registrations.paymentStatus, "paid")));
    return { refund: row!, payment };
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: created.refund.tenantId,
    action: "refund.request",
    label: "Requested a refund",
    entityType: "payment",
    entityId: created.payment.id,
    metadata: { refundId: created.refund.id, amountMinor: created.refund.amountMinor, reason: created.refund.reason, needsReview: created.refund.status === "pending_review" },
    ipAddress,
  });
  await notifyAdmins(created.refund.tenantId, {
    heading: "A refund was requested",
    message:
      created.refund.status === "pending_review"
        ? "Because of its size, this refund is waiting for approval from the platform team. You'll get an email when it moves."
        : "This refund is on its way to the person who paid. If this wasn't you, contact us immediately and change your password.",
    details: [
      { label: "Amount", value: formatMinor(created.refund.amountMinor, created.refund.currency) },
      { label: "To", value: maskPhone(created.refund.phoneNumber) },
      { label: "Reason", value: created.refund.reason },
    ],
  });
  return created.refund;
}

/** Puts a refund that did not happen back: the money returns to the balance, the fee goes back to the platform, the payment counts as paid again. */
async function reverseRefund(tx: Tx, refund: RefundRow, note: string) {
  await tx.insert(walletEntries).values({ tenantId: refund.tenantId, kind: "refund_reversal", amountMinor: refund.amountMinor, currency: refund.currency, availableAt: new Date(), refundId: refund.id, note }).onConflictDoNothing();
  if (refund.feeRefundMinor > 0) {
    await tx.insert(walletEntries).values({ tenantId: refund.tenantId, kind: "fee_refund_reversal", amountMinor: -refund.feeRefundMinor, currency: refund.currency, availableAt: new Date(), refundId: refund.id, note }).onConflictDoNothing();
    await tx.insert(walletEntries).values({ tenantId: null, kind: "platform_fee_refund_reversal", amountMinor: refund.feeRefundMinor, currency: refund.currency, availableAt: new Date(), refundId: refund.id, note }).onConflictDoNothing();
  }
  const [payment] = await tx.update(payments).set({ refundedMinor: sql`greatest(${payments.refundedMinor} - ${refund.amountMinor}, 0)`, updatedAt: new Date() }).where(eq(payments.id, refund.paymentId)).returning();
  if (payment && payment.registrationId && payment.refundedMinor < payment.amountMinor) {
    await tx.update(registrations).set({ paymentStatus: "paid" }).where(and(eq(registrations.id, payment.registrationId), eq(registrations.paymentStatus, "refunded")));
  }
}

export async function reviewRefund(actor: { id: string }, refundId: string, decision: "approve" | "reject", note: string | undefined, ipAddress?: string) {
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update");
    if (!current) throw AppError.notFound("Refund not found");
    if (current.status !== "pending_review") throw AppError.conflict("This refund is not waiting for review.");
    if (current.requestedBy === actor.id) throw AppError.forbidden("A refund can't be approved by the person who requested it.");
    await tx
      .update(refunds)
      .set({ status: decision === "approve" ? "queued" : "rejected", reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note ?? null, updatedAt: new Date() })
      .where(eq(refunds.id, refundId));
    if (decision === "reject") await reverseRefund(tx, current, "Refund declined");
    return current;
  });
  await recordAudit({ actorUserId: actor.id, tenantId: row.tenantId, action: `refund.${decision}`, label: decision === "approve" ? "Approved a refund" : "Declined a refund", entityType: "payment", entityId: row.paymentId, metadata: { refundId, note }, ipAddress });
  await notifyAdmins(row.tenantId, {
    heading: decision === "approve" ? "A refund was approved" : "A refund was declined",
    message: decision === "approve" ? "It is now on its way." : `The money is back on your balance.${note ? ` Reason: ${note}` : ""}`,
    details: [{ label: "Amount", value: formatMinor(row.amountMinor, row.currency) }],
  });
}

export async function listRefundsAwaitingReview() {
  return db
    .select({
      id: refunds.id,
      paymentId: refunds.paymentId,
      tenantName: tenants.name,
      amountMinor: refunds.amountMinor,
      reason: refunds.reason,
      providerId: refunds.providerId,
      phoneNumber: refunds.phoneNumber,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .innerJoin(tenants, eq(tenants.id, refunds.tenantId))
    .where(eq(refunds.status, "pending_review"))
    .orderBy(refunds.createdAt)
    .then((rows) => rows.map((r) => ({ ...r, phoneNumber: maskPhone(r.phoneNumber) })));
}

/** The refunds of one payment, newest first. */
export async function listRefundsForPayment(scope: { programId?: string; pollId?: string }, paymentId: string) {
  const [payment] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.id, paymentId), scope.pollId ? eq(payments.pollId, scope.pollId) : eq(payments.programId, scope.programId ?? "")))
    .limit(1);
  if (!payment) throw AppError.notFound("Payment not found");
  const rows = await db.select().from(refunds).where(eq(refunds.paymentId, paymentId)).orderBy(desc(refunds.createdAt));
  return rows.map((r) => ({
    id: r.id,
    amountMinor: r.amountMinor,
    currency: r.currency,
    status: r.status,
    reason: r.reason,
    providerId: r.providerId,
    phoneNumber: maskPhone(r.phoneNumber),
    failureReason: r.failureReason,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }));
}

/** An organization's refunds, for its payment fund page. */
export async function listTenantRefunds(tenantId: string, pagination: PaginationInput) {
  const { offset, limit } = toOffsetLimit(pagination);
  const [items, total] = await Promise.all([
    db
      .select({
        id: refunds.id,
        amountMinor: refunds.amountMinor,
        currency: refunds.currency,
        status: refunds.status,
        reason: refunds.reason,
        createdAt: refunds.createdAt,
        registrationNumber: sql<string | null>`(select r.registration_number from registrations r where r.id = ${payments.registrationId})`,
      })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .where(eq(refunds.tenantId, tenantId))
      .orderBy(desc(refunds.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(refunds).where(eq(refunds.tenantId, tenantId)),
  ]);
  return buildPaginatedResult(items, total[0]?.n ?? 0, pagination);
}

async function fail(refundId: string, reason: string) {
  const failed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update");
    if (!row || row.status === "failed" || row.status === "completed" || row.status === "rejected") return null;
    await tx.update(refunds).set({ status: "failed", failureReason: reason, updatedAt: new Date() }).where(eq(refunds.id, refundId));
    await reverseRefund(tx, row, "Refund failed");
    return row;
  });
  if (failed) {
    void recordAudit({ action: "refund.failed", label: "A refund did not go through", actorType: "system", tenantId: failed.tenantId, entityType: "payment", entityId: failed.paymentId, outcome: "failed", metadata: { refundId: failed.id, reason, amountMinor: failed.amountMinor } });
    void notifyAdmins(failed.tenantId, { heading: "A refund did not go through", message: "The money is back on your payment fund. You can try again with another number.", details: [{ label: "Amount", value: formatMinor(failed.amountMinor, failed.currency) }, { label: "Reason", value: reason }] });
  }
}

/** Sends queued refunds to Monime and follows up on the ones in progress. Runs in the background on every instance. */
export async function processRefunds(): Promise<number> {
  if (!isMonimeConfigured()) return 0;
  let handled = 0;

  await db
    .update(refunds)
    .set({ status: "queued", updatedAt: new Date() })
    .where(and(eq(refunds.status, "processing"), sql`${refunds.providerPayoutId} is null`, lt(refunds.updatedAt, new Date(Date.now() - 10 * 60_000))));

  const claimed = await db.transaction(async (tx) => {
    const due = await tx.execute<{ id: string }>(sql`select id from refunds where status = 'queued' order by created_at limit 5 for update skip locked`);
    const ids = due.rows.map((r) => r.id);
    if (ids.length === 0) return [];
    await tx.update(refunds).set({ status: "processing", attempts: sql`${refunds.attempts} + 1`, updatedAt: new Date() }).where(inArray(refunds.id, ids));
    return tx.select().from(refunds).where(inArray(refunds.id, ids));
  });

  for (const refund of claimed) {
    try {
      const sent = await createPayout({
        idempotencyKey: `refund-${refund.id}`,
        amountMinor: refund.amountMinor,
        destination: { type: "momo", providerId: refund.providerId, phoneNumber: refund.phoneNumber },
        metadata: { refundId: refund.id, paymentId: refund.paymentId },
      });
      await db.update(refunds).set({ providerPayoutId: sent.id, updatedAt: new Date() }).where(eq(refunds.id, refund.id));
      handled++;
    } catch (err) {
      if (err instanceof MonimeError && !err.retryable) await fail(refund.id, `The payment provider refused the transfer${err.reason ? ` (${err.reason.slice(0, 120)})` : ""}`);
      else if (refund.attempts >= 5) await fail(refund.id, "The payment provider could not be reached");
      else await db.update(refunds).set({ status: "queued", updatedAt: new Date() }).where(eq(refunds.id, refund.id));
      console.error("Refund not sent", refund.id, err instanceof MonimeError ? { status: err.status, requestId: err.requestId } : err);
    }
  }

  const inProgress = await db.select().from(refunds).where(and(eq(refunds.status, "processing"), sql`${refunds.providerPayoutId} is not null`)).limit(25);
  for (const refund of inProgress) {
    try {
      const remote = await getPayout(refund.providerPayoutId!);
      if (remote.status === "completed") {
        const [done] = await db.update(refunds).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(refunds.id, refund.id), eq(refunds.status, "processing"))).returning();
        if (done) {
          void recordAudit({ action: "refund.completed", label: "A refund was sent", actorType: "system", tenantId: done.tenantId, entityType: "payment", entityId: done.paymentId, metadata: { refundId: done.id, amountMinor: done.amountMinor } });
          void notifyAdmins(done.tenantId, { heading: "A refund was sent", message: "The money has been sent to the person who paid.", details: [{ label: "Amount", value: formatMinor(done.amountMinor, done.currency) }] });
          const [payer] = await db
            .select({ email: payments.payerEmail, name: payments.payerName, program: programs.name })
            .from(payments)
            .innerJoin(programs, eq(programs.id, payments.programId))
            .where(eq(payments.id, done.paymentId))
            .limit(1);
          if (payer?.email) {
            const mail = paymentsNoticeEmail({ heading: "Your refund was sent", message: `Your payment for ${payer.program} was refunded to your mobile money number.`, details: [{ label: "Amount", value: formatMinor(done.amountMinor, done.currency) }, { label: "Sent to", value: maskPhone(done.phoneNumber) }] });
            void queueEmail({ to: payer.email, toName: payer.name ?? undefined, subject: mail.subject, html: mail.html });
          }
        }
        handled++;
      } else if (remote.status === "failed") {
        await fail(refund.id, remote.failureDetail?.message ?? "The transfer failed");
        handled++;
      }
    } catch (err) {
      console.error("Could not check a refund", refund.id, err instanceof MonimeError ? err.message : err);
    }
  }
  return handled;
}
