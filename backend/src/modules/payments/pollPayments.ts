import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { payments, pollPositions, polls, pollVotes, voterAccounts } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { formatMinor } from "../../lib/money.js";
import { buildPaginatedResult, toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";
import { dateRangeConditions, type DateRange } from "../../lib/dateRange.js";
import { recordAudit } from "../audit/recorder.js";
import { assertPaymentAllowed, riskFlagsFor } from "./fraud.js";
import { isMonimeConfigured } from "./monime.js";
import { MAX_PAYMENT_MINOR, assertChargeable, type LineItem } from "./pricing.js";
import { refundableAt } from "./refunds.js";
import { openCheckout, signPaymentToken } from "./service.js";
import { feeIsAccepted } from "./fees.js";

// Paid voting. A poll's admin can ask for payment before voting: one fixed price per vote (one vote per payment),
// or any amount, which buys as many votes as the price fits into. A payment is for ONE position and can be used ONCE:
// after it is paid the voter picks a candidate and all the votes they bought go to that candidate. Voting again
// means paying again. What stops cheating:
//  - the price, the number of votes and the total are always worked out here, never taken from the browser;
//  - a payment only counts once Monime itself confirms the full amount (the same check as every other payment);
//  - the votes belong to the voter who paid, for the position they paid for, and open polls only;
//  - using them is one locked step that also marks them used, and the database refuses a second use of the same payment;
//  - a payment that was refunded (or has a refund on its way) can't be used, and one that was used can't be refunded;
//  - starting payments is limited per voter and per address, and every payment and every use is in the audit log.

const price = z.number().int().min(100).max(MAX_PAYMENT_MINOR);

export const pollPaymentConfigSchema = z.object({
  enabled: z.boolean().default(false),
  // What one vote costs, in cents (NLe 1 is 100).
  pricePerVoteMinor: price.default(100),
  // Off: one vote per payment, at exactly the price. On: any amount, as many votes as it buys.
  allowAnyAmount: z.boolean().default(false),
  // The most votes one payment can buy (only matters when any amount is allowed).
  maxVotesPerPayment: z.number().int().min(1).max(10_000).default(100),
  // Set by the server when the admin agrees to the platform's fee; never taken from what the browser sends.
  feeAccepted: z.object({ percent: z.number(), at: z.string(), by: z.string() }).optional(),
});
export type PollPaymentConfig = z.infer<typeof pollPaymentConfigSchema>;

export const pollPaymentConfigInputSchema = pollPaymentConfigSchema.omit({ feeAccepted: true }).extend({ acceptFee: z.boolean().optional() });

export function resolvePollPaymentConfig(raw: unknown): PollPaymentConfig {
  const parsed = pollPaymentConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { enabled: false, pricePerVoteMinor: 100, allowAnyAmount: false, maxVotesPerPayment: 100 };
}

/** True when voters of this poll have to pay for their votes. */
export const isPaidPoll = (poll: { paymentConfig: unknown }) => resolvePollPaymentConfig(poll.paymentConfig).enabled;

/**
 * How many votes a payment buys and what it costs, worked out from the price. With one fixed price it is one vote.
 * With any amount it is as many whole votes as the amount covers, and the charge is exactly those votes (nothing
 * is kept as change).
 */
export function planVotePurchase(config: Pick<PollPaymentConfig, "pricePerVoteMinor" | "allowAnyAmount" | "maxVotesPerPayment">, amountMinor?: number) {
  const unit = config.pricePerVoteMinor;
  if (!config.allowAnyAmount) return { votes: 1, totalMinor: unit, unitMinor: unit };
  if (amountMinor === undefined || !Number.isSafeInteger(amountMinor) || amountMinor < unit) {
    throw AppError.validation(`Enter at least ${formatMinor(unit)}, the price of one vote.`);
  }
  const votes = Math.floor(amountMinor / unit);
  if (votes > config.maxVotesPerPayment) {
    throw AppError.validation(`One payment can buy at most ${config.maxVotesPerPayment} votes (${formatMinor(config.maxVotesPerPayment * unit)}).`);
  }
  return { votes, totalMinor: votes * unit, unitMinor: unit };
}

// ---------------------------------------------------------------- the admin's settings

type PollRow = typeof polls.$inferSelect;

/** Settings changed by an admin: payments can be switched on only after agreeing to the fee and with a price. */
export function assertPollPaymentSettings(config: { enabled: boolean }) {
  if (config.enabled && !isMonimeConfigured()) throw AppError.conflict("Payments are not set up on this platform yet. Ask the platform administrator to connect Monime.");
}

export const pollFeeIsAccepted = (config: PollPaymentConfig) => feeIsAccepted(config.feeAccepted);

// ---------------------------------------------------------------- the voter pays

export async function createVotePayment(input: {
  poll: PollRow;
  voter: typeof voterAccounts.$inferSelect;
  positionId: string;
  amountMinor?: number;
  context: { ip?: string | null; userAgent?: string | null };
}) {
  const { poll, voter, positionId, context } = input;
  const config = resolvePollPaymentConfig(poll.paymentConfig);
  if (!config.enabled) throw AppError.conflict("This poll doesn't take payments for votes.");
  if (!isMonimeConfigured()) throw AppError.paymentUnavailable("Payments are not set up on this platform yet.");
  if (!pollFeeIsAccepted(config)) throw AppError.paymentUnavailable("Paid voting is not ready for this poll yet.");
  const plan = planVotePurchase(config, input.amountMinor);
  assertChargeable(plan.totalMinor);

  const [position] = await db.select().from(pollPositions).where(and(eq(pollPositions.id, positionId), eq(pollPositions.pollId, poll.id))).limit(1);
  if (!position) throw AppError.notFound("That position isn't on this ballot any more. Please reload the page.");

  // Paid votes already waiting for this position must be used first, so nobody ends up with a pile they can't explain.
  const [waiting] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.voterId, voter.id), eq(payments.pollPositionId, position.id), eq(payments.status, "completed"), isNull(payments.redeemedAt), eq(payments.refundedMinor, 0)))
    .limit(1);
  if (waiting) throw AppError.conflict(`You have paid votes waiting for ${position.title}. Cast them first.`);

  // Not too many unfinished payments at once.
  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.voterId, voter.id), eq(payments.pollId, poll.id), eq(payments.status, "pending"), gt(payments.createdAt, new Date(Date.now() - 30 * 60_000))));
  if ((open?.n ?? 0) >= 3) throw new AppError("RATE_LIMITED", "You have payments waiting to be finished. Finish or cancel them before starting another.", 429);

  const actor = { ip: context.ip, email: voter.email };
  await assertPaymentAllowed(actor);
  const flags = await riskFlagsFor(actor, plan.totalMinor);

  const lines: LineItem[] = [{ id: "votes", name: `${plan.votes} ${plan.votes === 1 ? "vote" : "votes"} for ${position.title}`.slice(0, 100), unitMinor: plan.unitMinor, quantity: plan.votes, totalMinor: plan.totalMinor }];
  const [created] = await db
    .insert(payments)
    .values({
      tenantId: poll.tenantId,
      pollId: poll.id,
      voterId: voter.id,
      pollPositionId: position.id,
      votesBought: plan.votes,
      purpose: "vote",
      amountMinor: plan.totalMinor,
      lineItems: lines,
      payerName: voter.name,
      payerEmail: voter.email,
      risk: { flags },
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
    })
    .returning();

  void recordAudit({
    action: "payment.started",
    label: "Started paying for votes",
    actorType: "voter",
    actorName: voter.name,
    actorEmail: voter.email,
    tenantId: poll.tenantId,
    entityType: "payment",
    entityId: created!.id,
    metadata: { poll: poll.name, position: position.title, votes: plan.votes, amountMinor: plan.totalMinor, flags: flags.length ? flags : undefined },
  });

  const token = signPaymentToken(created!.id);
  try {
    const opened = await openCheckout(created!, poll.name);
    return { token, status: "pending" as const, redirectUrl: opened.redirectUrl, amountMinor: plan.totalMinor, votes: plan.votes, currency: "SLE" };
  } catch (err) {
    await db.update(payments).set({ status: "failed", failureReason: "The payment page could not be opened", updatedAt: new Date() }).where(eq(payments.id, created!.id));
    if (err instanceof AppError) throw err;
    return { token, status: "failed" as const, redirectUrl: null, amountMinor: plan.totalMinor, votes: plan.votes, currency: "SLE" };
  }
}

// ---------------------------------------------------------------- using paid votes

/** The paid votes a voter has not used yet: which position, how many. */
export async function listCredits(pollId: string, voterId: string) {
  const rows = await db
    .select({ paymentId: payments.id, positionId: payments.pollPositionId, votes: payments.votesBought, amountMinor: payments.amountMinor, paidAt: payments.paidAt })
    .from(payments)
    .where(and(eq(payments.pollId, pollId), eq(payments.voterId, voterId), eq(payments.status, "completed"), isNull(payments.redeemedAt), eq(payments.refundedMinor, 0)))
    .orderBy(desc(payments.paidAt));
  return rows.map((r) => ({ paymentId: r.paymentId, positionId: r.positionId, votes: r.votes ?? 0, amountMinor: r.amountMinor, paidAt: r.paidAt }));
}

/**
 * Uses a paid payment: all of its votes go to one candidate, once. Everything that must hold is checked inside one
 * locked step, and the unique index on the vote's payment is the last line of defence against a second use.
 */
export async function redeemVotes(input: {
  poll: PollRow;
  voterId: string;
  paymentId: string;
  candidateId: string;
  ipAddress?: string | null;
  verifyCandidate: (positionId: string, candidateId: string) => Promise<boolean>;
  /** When each email may vote once per position: the key that makes the database itself refuse a second vote. */
  oneVoteKeyFor?: (positionId: string) => string;
}) {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update");
    // The same answer for "not yours" and "doesn't exist", so payments can't be probed.
    if (!payment || payment.pollId !== input.poll.id || payment.voterId !== input.voterId || payment.purpose !== "vote") throw AppError.notFound("Those votes weren't found.");
    if (payment.status !== "completed") throw AppError.conflict("This payment isn't complete yet.");
    if (payment.redeemedAt) throw new AppError("CONFLICT", "These votes have already been used. To vote again, pay again.", 409, { reason: "already_used" });
    if (payment.refundedMinor > 0) throw AppError.conflict("This payment was refunded, so its votes can't be used.");
    if (!payment.pollPositionId || !payment.votesBought || payment.votesBought < 1) throw AppError.conflict("These votes can't be used.");
    if (!(await input.verifyCandidate(payment.pollPositionId, input.candidateId))) throw AppError.notFound("That choice isn't on this ballot any more. Please reload the page.");

    const now = new Date();
    const inserted = await tx
      .insert(pollVotes)
      .values({
        pollId: input.poll.id,
        positionId: payment.pollPositionId,
        candidateId: input.candidateId,
        voterId: input.voterId,
        // With one vote per email, the same per-person key as a free vote: a second vote by the same person (or the same
        // address written another way) is refused by the database, whatever was paid. Otherwise unique per payment.
        ballotKey: input.oneVoteKeyFor ? input.oneVoteKeyFor(payment.pollPositionId) : `paid:${payment.id}:${randomUUID()}`,
        weight: payment.votesBought,
        paymentId: payment.id,
        ipAddress: input.ipAddress ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: pollVotes.id });
    if (inserted.length === 0) {
      const [same] = await tx.select({ id: pollVotes.id }).from(pollVotes).where(eq(pollVotes.paymentId, payment.id)).limit(1);
      if (same) throw new AppError("CONFLICT", "These votes have already been used. To vote again, pay again.", 409, { reason: "already_used" });
      throw new AppError("CONFLICT", "You've already voted for this position. Each email address can vote only once.", 409, { reason: "already_voted" });
    }
    await tx.update(payments).set({ redeemedAt: now, updatedAt: now }).where(eq(payments.id, payment.id));
    return { positionId: payment.pollPositionId, votes: payment.votesBought, amountMinor: payment.amountMinor, paymentId: payment.id };
  });
}

// ---------------------------------------------------------------- for the poll's team

/** The poll's payments: who paid, how much, how many votes, and whether they were used. Never which candidate. */
export async function listPollPayments(pollId: string, query: { status?: string } & DateRange & PaginationInput) {
  const { offset, limit } = toOffsetLimit(query);
  const where = and(eq(payments.pollId, pollId), query.status ? eq(payments.status, query.status) : undefined, ...dateRangeConditions(payments.createdAt, query));
  const [items, totals] = await Promise.all([
    db
      .select({
        id: payments.id,
        status: payments.status,
        amountMinor: payments.amountMinor,
        feeMinor: payments.feeMinor,
        refundedMinor: payments.refundedMinor,
        currency: payments.currency,
        votes: payments.votesBought,
        used: sql<boolean>`${payments.redeemedAt} is not null`,
        payerName: payments.payerName,
        payerEmail: payments.payerEmail,
        payerPhone: payments.payerPhone,
        channel: payments.channel,
        failureReason: payments.failureReason,
        risk: payments.risk,
        positionTitle: pollPositions.title,
        createdAt: payments.createdAt,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .leftJoin(pollPositions, eq(pollPositions.id, payments.pollPositionId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        paid: sql<string>`coalesce(sum(case when ${payments.status} = 'completed' then ${payments.amountMinor} else 0 end), 0)`,
        pending: sql<string>`coalesce(sum(case when ${payments.status} = 'pending' then ${payments.amountMinor} else 0 end), 0)`,
        votes: sql<string>`coalesce(sum(case when ${payments.status} = 'completed' and ${payments.redeemedAt} is not null then ${payments.votesBought} else 0 end), 0)`,
        unused: sql<string>`coalesce(sum(case when ${payments.status} = 'completed' and ${payments.redeemedAt} is null and ${payments.refundedMinor} = 0 then ${payments.votesBought} else 0 end), 0)`,
      })
      .from(payments)
      .where(where),
  ]);
  const t = totals[0];
  return {
    ...buildPaginatedResult(items.map((i) => ({ ...i, refundableAt: refundableAt(i.paidAt) })), t?.count ?? 0, query),
    summary: { paidMinor: Number(t?.paid ?? 0), pendingMinor: Number(t?.pending ?? 0), votesUsed: Number(t?.votes ?? 0), votesWaiting: Number(t?.unused ?? 0) },
  };
}
