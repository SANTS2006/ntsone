import { and, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { env } from "../../config/env.js";
import { dateRangeConditions, type DateRange } from "../../lib/dateRange.js";
import { db } from "../../db/client.js";
import { payoutAccounts, payouts, tenants, users, walletEntries } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { clearLoginFailures, assertLoginAllowed, recordLoginFailure } from "../../lib/loginThrottle.js";
import { formatMinor, leonesToMinor } from "../../lib/money.js";
import { buildPaginatedResult, toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";
import { verifyPassword } from "../../lib/password.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { recordAudit } from "../audit/recorder.js";
import { queueEmail } from "../email/outbox.js";
import { paymentsNoticeEmail } from "../email/templates.js";
import { createPayout, getPayout, isMonimeConfigured, listBanks, listMomos, MonimeError, type PayoutDestination } from "./monime.js";
import { termsFor, withdrawalsInactive } from "./terms.js";
import { balancesFor, tenantIs, type Tx } from "./wallet.js";

// Withdrawals ("the payment fund"): an organization asks to move money from its balance to a mobile money number or
// bank account. The money leaves the balance the moment the request is made, so it can't be spent twice, and comes
// back if the transfer fails or is refused. Several checks stand between a request and the transfer:
//  - the person must be the organization's admin and re-enter their password;
//  - the destination must have been on file for a cooling-off period;
//  - only money past the hold period counts, and daily and per-request limits apply;
//  - big amounts wait for a person on the platform team to approve them.

export interface Provider {
  providerId: string;
  name: string;
}

const FALLBACK_MOMO: Provider[] = [
  { providerId: "m17", name: "Orange Money" },
  { providerId: "m18", name: "Africell Money" },
];
const FALLBACK_BANKS: Provider[] = ["slb001", "slb004", "slb007", "slb009", "slb013"].map((providerId) => ({ providerId, name: `Bank ${providerId}` }));

const providerCache = new TtlCache<{ momo: Provider[]; banks: Provider[] }>(2);

/** The mobile money and bank providers Monime can pay out to. Falls back to the known ones if Monime can't be asked. */
export async function payoutProviders() {
  return providerCache.get("providers", 10 * 60_000, async () => {
    if (!isMonimeConfigured()) return { momo: FALLBACK_MOMO, banks: FALLBACK_BANKS };
    try {
      const [momos, banks] = await Promise.all([listMomos(), listBanks()]);
      const momo = momos.filter((m) => m.status?.active !== false && m.featureSet?.payout?.canPayTo !== false).map((m) => ({ providerId: m.providerId, name: m.name }));
      const bank = banks.filter((b) => b.status?.active !== false && b.featureSet?.payout?.canPayTo !== false).map((b) => ({ providerId: b.providerId, name: b.name }));
      return { momo: momo.length ? momo : FALLBACK_MOMO, banks: bank.length ? bank : FALLBACK_BANKS };
    } catch {
      return { momo: FALLBACK_MOMO, banks: FALLBACK_BANKS };
    }
  });
}

/** A Sierra Leone mobile number as Monime wants it: country code and number, digits only (e.g. 23276123456). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("232") && digits.length === 11) return digits;
  if (digits.startsWith("0") && digits.length === 9) return `232${digits.slice(1)}`;
  if (digits.length === 8) return `232${digits}`;
  throw AppError.validation("Enter a valid Sierra Leone mobile number, for example 076 123456.");
}

const maskNumber = (value: string) => (value.length <= 4 ? "••••" : `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`);

/** The person's own password, asked again before anything that moves money. Wrong tries count against the sign-in limit. */
export async function confirmPassword(userId: string, password: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw AppError.unauthorized();
  assertLoginAllowed(user.email);
  if (!(await verifyPassword(user.passwordHash, password))) {
    recordLoginFailure(user.email);
    throw AppError.validation("Your password is not correct.");
  }
  clearLoginFailures(user.email);
}

/** Emails an organization's admins; for the platform's own money (no organization), the platform's super admins. */
export async function notifyAdmins(tenantId: string | null, notice: { heading: string; message: string; details: { label: string; value: string }[] }) {
  const admins = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(tenantId ? and(eq(users.tenantId, tenantId), eq(users.role, "admin"), eq(users.status, "active")) : and(eq(users.role, "super_admin"), eq(users.status, "active")));
  const mail = paymentsNoticeEmail(notice);
  for (const admin of admins) void queueEmail({ to: admin.email, toName: admin.name, subject: mail.subject, html: mail.html });
}

// ---------------------------------------------------------------- accounts

export async function listPayoutAccounts(tenantId: string | null) {
  const rows = await db
    .select()
    .from(payoutAccounts)
    .where(and(tenantIs(payoutAccounts.tenantId, tenantId), isNull(payoutAccounts.disabledAt)))
    .orderBy(desc(payoutAccounts.createdAt));
  const providers = await payoutProviders();
  const names = new Map([...providers.momo, ...providers.banks].map((p) => [p.providerId, p.name]));
  const now = Date.now();
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    providerId: a.providerId,
    providerName: names.get(a.providerId) ?? a.providerId,
    accountNumber: maskNumber(a.accountNumber),
    accountName: a.accountName,
    usableAfter: a.usableAfter,
    usable: a.usableAfter.getTime() <= now,
    createdAt: a.createdAt,
  }));
}

export async function addPayoutAccount(
  actor: { id: string; tenantId: string | null },
  input: { type: "momo" | "bank"; providerId: string; accountNumber: string; accountName: string; password: string },
  ipAddress?: string,
) {
  await confirmPassword(actor.id, input.password);
  const providers = await payoutProviders();
  const allowed = (input.type === "momo" ? providers.momo : providers.banks).some((p) => p.providerId === input.providerId);
  if (!allowed) throw AppError.validation("Choose one of the listed providers.");

  const accountNumber = input.type === "momo" ? normalizePhone(input.accountNumber) : input.accountNumber.replace(/\s/g, "");
  if (input.type === "bank" && !/^\d{6,20}$/.test(accountNumber)) throw AppError.validation("Enter a valid bank account number.");

  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payoutAccounts)
    .where(and(tenantIs(payoutAccounts.tenantId, actor.tenantId), isNull(payoutAccounts.disabledAt)));
  if ((existing?.n ?? 0) >= 5) throw AppError.validation("You can keep up to 5 withdrawal accounts. Remove one first.");

  const usableAfter = new Date(Date.now() + env.PAYOUT_NEW_ACCOUNT_MINUTES * 60_000);
  const [created] = await db
    .insert(payoutAccounts)
    .values({ tenantId: actor.tenantId, type: input.type, providerId: input.providerId, accountNumber, accountName: input.accountName.trim(), usableAfter, createdBy: actor.id })
    .returning();
  await recordAudit({ actorUserId: actor.id, action: "payout_account.add", entityType: "payout_account", entityId: created!.id, ipAddress });
  await notifyAdmins(actor.tenantId, {
    heading: "A withdrawal account was added",
    message: `A new place to withdraw money to was added to your account. It can be used from ${usableAfter.toUTCString()}. If this wasn't you, sign in and remove it, and change your password.`,
    details: [
      { label: "Account", value: `${input.accountName.trim()} (${maskNumber(accountNumber)})` },
    ],
  });
  return created!;
}

export async function removePayoutAccount(actor: { id: string; tenantId: string | null }, accountId: string, password: string, ipAddress?: string) {
  await confirmPassword(actor.id, password);
  const [row] = await db
    .update(payoutAccounts)
    .set({ disabledAt: new Date() })
    .where(and(eq(payoutAccounts.id, accountId), tenantIs(payoutAccounts.tenantId, actor.tenantId), isNull(payoutAccounts.disabledAt)))
    .returning({ id: payoutAccounts.id });
  if (!row) throw AppError.notFound("Account not found");
  await recordAudit({ actorUserId: actor.id, action: "payout_account.remove", entityType: "payout_account", entityId: accountId, ipAddress });
}

// ---------------------------------------------------------------- requests

/** Puts the money back on the balance after a withdrawal that did not go through. */
async function reversePayout(tx: Tx, payout: { id: string; tenantId: string | null; amountMinor: number; currency: string }, note: string) {
  await tx
    .insert(walletEntries)
    .values({ tenantId: payout.tenantId, kind: "payout_reversal", amountMinor: payout.amountMinor, currency: payout.currency, availableAt: new Date(), payoutId: payout.id, note })
    .onConflictDoNothing();
}

export async function requestPayout(
  actor: { id: string; tenantId: string | null },
  input: { accountId: string; amountMinor: number; password: string },
  ipAddress?: string,
) {
  await confirmPassword(actor.id, input.password);
  const terms = await termsFor(actor.tenantId);
  if (withdrawalsInactive(terms)) throw AppError.validation(`Withdrawals for your organization are not active yet. They switch on from ${terms.withdrawalsActiveFrom!.toUTCString()}.`);
  const minMinor = leonesToMinor(env.PAYOUT_MIN_AMOUNT);
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < minMinor) throw AppError.validation(`The smallest withdrawal is ${formatMinor(minMinor)}.`);

  const payout = await db.transaction(async (tx) => {
    // One request at a time per organization, so two at once can't both spend the same money.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.tenantId ?? "platform"}))`);

    const [account] = await tx
      .select()
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.id, input.accountId), tenantIs(payoutAccounts.tenantId, actor.tenantId), isNull(payoutAccounts.disabledAt)))
      .limit(1);
    if (!account) throw AppError.validation("Choose one of your withdrawal accounts.");
    if (account.usableAfter > new Date()) throw AppError.validation(`This account is new and can be used from ${account.usableAfter.toUTCString()}.`);

    const balances = await balancesFor(actor.tenantId, tx);
    if (input.amountMinor > balances.availableMinor) throw AppError.validation(`You can withdraw up to ${formatMinor(Math.max(0, balances.availableMinor))} right now.`);

    const dayLimit = leonesToMinor(env.PAYOUT_DAILY_LIMIT);
    const [today] = await tx
      .select({ total: sql<string>`coalesce(sum(${payouts.amountMinor}), 0)` })
      .from(payouts)
      .where(and(tenantIs(payouts.tenantId, actor.tenantId), gte(payouts.createdAt, new Date(Date.now() - 24 * 3_600_000)), notInArray(payouts.status, ["cancelled", "rejected", "failed"])));
    if (Number(today?.total ?? 0) + input.amountMinor > dayLimit) throw AppError.validation(`The daily withdrawal limit is ${formatMinor(dayLimit)}.`);

    // The platform's own withdrawals have no one above them to approve; the password, cooling-off and limits apply.
    const needsReview = actor.tenantId !== null && input.amountMinor > leonesToMinor(env.PAYOUT_REVIEW_ABOVE);
    const [created] = await tx
      .insert(payouts)
      .values({
        tenantId: actor.tenantId,
        accountId: account.id,
        amountMinor: input.amountMinor,
        status: needsReview ? "pending_review" : "queued",
        requestedBy: actor.id,
        risk: { needsReview },
      })
      .returning();
    await tx.insert(walletEntries).values({ tenantId: actor.tenantId, kind: "payout", amountMinor: -input.amountMinor, availableAt: new Date(), payoutId: created!.id, note: "Withdrawal" });
    return { row: created!, account };
  });

  await recordAudit({ actorUserId: actor.id, action: "payout.request", entityType: "payout", entityId: payout.row.id, metadata: { amountMinor: input.amountMinor }, ipAddress });
  await notifyAdmins(actor.tenantId, {
    heading: "A withdrawal was requested",
    message:
      payout.row.status === "pending_review"
        ? "Because of its size, this withdrawal is waiting for approval from the platform team. You'll get an email when it moves."
        : "This withdrawal is on its way. You'll get an email when it is complete. If this wasn't you, contact us immediately and change your password.",
    details: [
      { label: "Amount", value: formatMinor(input.amountMinor) },
      { label: "To", value: `${payout.account.accountName} (${maskNumber(payout.account.accountNumber)})` },
    ],
  });
  return payout.row;
}

export async function cancelPayout(actor: { id: string; tenantId: string | null }, payoutId: string, ipAddress?: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(payouts)
      .where(and(eq(payouts.id, payoutId), tenantIs(payouts.tenantId, actor.tenantId)))
      .for("update");
    if (!row) throw AppError.notFound("Withdrawal not found");
    if (row.status !== "pending_review" && row.status !== "queued") throw AppError.conflict("This withdrawal can no longer be cancelled.");
    await tx.update(payouts).set({ status: "cancelled", updatedAt: new Date() }).where(eq(payouts.id, payoutId));
    await reversePayout(tx, row, "Withdrawal cancelled");
  });
  await recordAudit({ actorUserId: actor.id, action: "payout.cancel", entityType: "payout", entityId: payoutId, ipAddress });
}

export async function listPayouts(tenantId: string | null, pagination: PaginationInput, range: DateRange = {}) {
  const { offset, limit } = toOffsetLimit(pagination);
  const where = and(tenantIs(payouts.tenantId, tenantId), ...dateRangeConditions(payouts.createdAt, range));
  const [items, total] = await Promise.all([
    db
      .select({
        id: payouts.id,
        amountMinor: payouts.amountMinor,
        currency: payouts.currency,
        status: payouts.status,
        failureReason: payouts.failureReason,
        accountName: payoutAccounts.accountName,
        providerId: payoutAccounts.providerId,
        accountNumber: payoutAccounts.accountNumber,
        createdAt: payouts.createdAt,
        completedAt: payouts.completedAt,
        // Withdrawals made by the automatic-withdrawal setting rather than by pressing Withdraw.
        automatic: sql<boolean>`coalesce((${payouts.risk}->>'automatic')::boolean, false)`,
      })
      .from(payouts)
      .innerJoin(payoutAccounts, eq(payoutAccounts.id, payouts.accountId))
      .where(where)
      .orderBy(desc(payouts.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(payouts).where(where),
  ]);
  return buildPaginatedResult(
    items.map((p) => ({ ...p, accountNumber: maskNumber(p.accountNumber) })),
    total[0]?.n ?? 0,
    pagination,
  );
}

// ---------------------------------------------------------------- the platform team's review

export async function listPayoutsAwaitingReview() {
  return db
    .select({
      id: payouts.id,
      tenantId: payouts.tenantId,
      tenantName: tenants.name,
      amountMinor: payouts.amountMinor,
      accountName: payoutAccounts.accountName,
      providerId: payoutAccounts.providerId,
      accountNumber: payoutAccounts.accountNumber,
      createdAt: payouts.createdAt,
    })
    .from(payouts)
    .innerJoin(payoutAccounts, eq(payoutAccounts.id, payouts.accountId))
    .innerJoin(tenants, eq(tenants.id, payouts.tenantId))
    .where(eq(payouts.status, "pending_review"))
    .orderBy(payouts.createdAt)
    .then((rows) => rows.map((r) => ({ ...r, accountNumber: maskNumber(r.accountNumber) })));
}

export async function reviewPayout(actor: { id: string }, payoutId: string, decision: "approve" | "reject", note: string | undefined, ipAddress?: string) {
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).for("update");
    if (!current) throw AppError.notFound("Withdrawal not found");
    if (current.status !== "pending_review") throw AppError.conflict("This withdrawal is not waiting for review.");
    // The person who asked for it can't be the one to approve it.
    if (current.requestedBy === actor.id) throw AppError.forbidden("A withdrawal can't be approved by the person who requested it.");
    await tx
      .update(payouts)
      .set({ status: decision === "approve" ? "queued" : "rejected", reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note ?? null, updatedAt: new Date() })
      .where(eq(payouts.id, payoutId));
    if (decision === "reject") await reversePayout(tx, current, "Withdrawal rejected");
    return current;
  });
  await recordAudit({ actorUserId: actor.id, action: `payout.${decision}`, entityType: "payout", entityId: payoutId, metadata: { note }, ipAddress });
  await notifyAdmins(row.tenantId, {
    heading: decision === "approve" ? "Your withdrawal was approved" : "Your withdrawal was declined",
    message: decision === "approve" ? "It is now on its way." : `The money is back on your balance.${note ? ` Reason: ${note}` : ""}`,
    details: [{ label: "Amount", value: formatMinor(row.amountMinor) }],
  });
}

// ---------------------------------------------------------------- sending

function destinationOf(account: { type: string; providerId: string; accountNumber: string }): PayoutDestination {
  return account.type === "bank"
    ? { type: "bank", providerId: account.providerId, accountNumber: account.accountNumber }
    : { type: "momo", providerId: account.providerId, phoneNumber: account.accountNumber };
}

async function fail(payoutId: string, reason: string) {
  const failed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).for("update");
    if (!row || row.status === "failed" || row.status === "completed") return null;
    await tx.update(payouts).set({ status: "failed", failureReason: reason, updatedAt: new Date() }).where(eq(payouts.id, payoutId));
    await reversePayout(tx, row, "Withdrawal failed");
    return row;
  });
  if (failed) {
    void recordAudit({ action: "payout.failed", actorType: "system", tenantId: failed.tenantId, entityType: "payout", entityId: failed.id, outcome: "failed", metadata: { reason, amountMinor: failed.amountMinor } });
  }
}

/** Sends queued withdrawals to Monime and follows up on ones in progress. Runs in the background on every instance. */
export async function processPayouts(): Promise<number> {
  if (!isMonimeConfigured()) return 0;
  let handled = 0;

  // A request that was claimed but never reached Monime (e.g. the server restarted) goes back in the queue; its key makes a repeat safe.
  await db
    .update(payouts)
    .set({ status: "queued", updatedAt: new Date() })
    .where(and(eq(payouts.status, "processing"), isNull(payouts.providerPayoutId), lt(payouts.updatedAt, new Date(Date.now() - 10 * 60_000))));

  const claimed = await db.transaction(async (tx) => {
    const due = await tx.execute<{ id: string }>(sql`select id from payouts where status = 'queued' order by created_at limit 5 for update skip locked`);
    const ids = due.rows.map((r) => r.id);
    if (ids.length === 0) return [];
    await tx.update(payouts).set({ status: "processing", attempts: sql`${payouts.attempts} + 1`, updatedAt: new Date() }).where(inArray(payouts.id, ids));
    return tx.select({ payout: payouts, account: payoutAccounts }).from(payouts).innerJoin(payoutAccounts, eq(payoutAccounts.id, payouts.accountId)).where(inArray(payouts.id, ids));
  });

  for (const { payout, account } of claimed) {
    try {
      const sent = await createPayout({
        idempotencyKey: `payout-${payout.id}`,
        amountMinor: payout.amountMinor,
        destination: destinationOf(account),
        metadata: { payoutId: payout.id, tenantId: payout.tenantId ?? "platform" },
      });
      await db.update(payouts).set({ providerPayoutId: sent.id, updatedAt: new Date() }).where(eq(payouts.id, payout.id));
      handled++;
    } catch (err) {
      if (err instanceof MonimeError && !err.retryable) await fail(payout.id, "The transfer was refused by the payment provider");
      else if (payout.attempts >= 5) await fail(payout.id, "The payment provider could not be reached");
      else await db.update(payouts).set({ status: "queued", updatedAt: new Date() }).where(eq(payouts.id, payout.id));
      console.error("Payout not sent", payout.id, err instanceof MonimeError ? { status: err.status, requestId: err.requestId } : err);
    }
  }

  const inProgress = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.status, "processing"), sql`${payouts.providerPayoutId} is not null`))
    .limit(25);
  for (const payout of inProgress) {
    try {
      const remote = await getPayout(payout.providerPayoutId!);
      if (remote.status === "completed") {
        await db.update(payouts).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(and(eq(payouts.id, payout.id), eq(payouts.status, "processing")));
        const row = payout;
        void recordAudit({ action: "payout.completed", actorType: "system", tenantId: row.tenantId, entityType: "payout", entityId: row.id, metadata: { amountMinor: row.amountMinor } });
        void notifyAdmins(row.tenantId, { heading: "Your withdrawal is complete", message: "The money has been sent.", details: [{ label: "Amount", value: formatMinor(row.amountMinor) }] });
        handled++;
      } else if (remote.status === "failed") {
        await fail(payout.id, remote.failureDetail?.message ?? "The transfer failed");
        handled++;
      }
    } catch (err) {
      console.error("Could not check a payout", payout.id, err instanceof MonimeError ? err.message : err);
    }
  }
  return handled;
}

// ---------------------------------------------------------------- automatic withdrawal

/**
 * An organization admin can have every successful payment sent on to a withdrawal account at once, with no waiting
 * period. Turning it on asks for the password again, and the account must be past its cooling-off time.
 */
export async function setAutoWithdraw(
  actor: { id: string; tenantId: string | null },
  input: { enabled: boolean; accountId?: string; password: string },
  ipAddress?: string,
) {
  if (!actor.tenantId) throw AppError.forbidden("Automatic withdrawal is for organizations.");
  await confirmPassword(actor.id, input.password);
  let accountId: string | null = null;
  if (input.enabled) {
    if (!input.accountId) throw AppError.validation("Choose the withdrawal account the money should be sent to.");
    const [account] = await db
      .select()
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.id, input.accountId), eq(payoutAccounts.tenantId, actor.tenantId), isNull(payoutAccounts.disabledAt)))
      .limit(1);
    if (!account) throw AppError.validation("Choose one of your withdrawal accounts.");
    if (account.usableAfter > new Date()) throw AppError.validation(`This account is new and can be used from ${account.usableAfter.toUTCString()}.`);
    accountId = account.id;
  }
  const before = await termsFor(actor.tenantId);
  await db.update(tenants).set({ autoWithdraw: input.enabled, autoWithdrawAccountId: accountId, updatedAt: new Date() }).where(eq(tenants.id, actor.tenantId));
  await recordAudit({
    actorUserId: actor.id,
    action: input.enabled ? "payout.auto_enable" : "payout.auto_disable",
    label: input.enabled ? "Turned on automatic withdrawal" : "Turned off automatic withdrawal",
    entityType: "tenant",
    entityId: actor.tenantId,
    metadata: { before: { enabled: before.autoWithdraw, accountId: before.autoWithdrawAccountId }, after: { enabled: input.enabled, accountId } },
    ipAddress,
  });
  await notifyAdmins(actor.tenantId, {
    heading: input.enabled ? "Automatic withdrawal is on" : "Automatic withdrawal is off",
    message: input.enabled
      ? "Every successful payment is now sent to your withdrawal account straight away, with no waiting period. If this wasn't you, sign in, turn it off and change your password."
      : "Payments now wait out the usual hold period before they can be withdrawn.",
    details: [],
  });
  // Turning it on (or changing the account) also sends whatever is already available, so nothing is left waiting.
  if (input.enabled) void autoWithdrawAfterPayment(actor.tenantId, null);
  return termsFor(actor.tenantId);
}

/**
 * Called when a payment has succeeded. For an organization that withdraws automatically, sends everything that can be
 * withdrawn (this payment, plus any earlier leftovers) to its chosen account right away. Large amounts still wait for
 * review like any other withdrawal, and nothing is sent while withdrawals are switched off or the amount is below the minimum;
 * the money simply stays on the balance and goes out with the next payment or by hand.
 */
export async function autoWithdrawAfterPayment(tenantId: string, paymentId: string | null): Promise<void> {
  try {
    const terms = await termsFor(tenantId);
    if (!terms.autoWithdraw || !terms.autoWithdrawAccountId) return;
    // When it can't send, the reason is on the record and the money simply stays on the balance.
    const skip = (reason: string) =>
      void recordAudit({ action: "payout.auto_skipped", label: "Automatic withdrawal did not send", actorType: "system", tenantId, entityType: "tenant", entityId: tenantId, outcome: "failed", metadata: { reason, paymentId } });
    if (!isMonimeConfigured()) return skip("Payments are not connected");
    if (withdrawalsInactive(terms)) return skip("Withdrawals are not active yet");
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`);
      const [account] = await tx
        .select()
        .from(payoutAccounts)
        .where(and(eq(payoutAccounts.id, terms.autoWithdrawAccountId!), eq(payoutAccounts.tenantId, tenantId), isNull(payoutAccounts.disabledAt)))
        .limit(1);
      if (!account) return "The chosen withdrawal account is no longer available";
      if (account.usableAfter > new Date()) return "The withdrawal account is still in its cooling-off time";
      const { availableMinor } = await balancesFor(tenantId, tx);
      // Automatic withdrawals are not held to the smallest-withdrawal rule: a small payment (after the platform fee) is exactly what they are for.
      if (availableMinor <= 0) return "There is no money available to withdraw";
      const needsReview = availableMinor > leonesToMinor(env.PAYOUT_REVIEW_ABOVE);
      const [row] = await tx
        .insert(payouts)
        .values({ tenantId, accountId: account.id, amountMinor: availableMinor, status: needsReview ? "pending_review" : "queued", requestedBy: null, risk: { needsReview, automatic: true, paymentId } })
        .returning();
      await tx.insert(walletEntries).values({ tenantId, kind: "payout", amountMinor: -availableMinor, availableAt: new Date(), payoutId: row!.id, note: "Automatic withdrawal" });
      return { row: row!, account };
    });
    if (typeof created === "string") return skip(created);
    void recordAudit({
      action: "payout.auto_request",
      label: "Withdrew a payment automatically",
      actorType: "system",
      tenantId,
      entityType: "payout",
      entityId: created.row.id,
      metadata: { amountMinor: created.row.amountMinor, paymentId, status: created.row.status },
    });
    void notifyAdmins(tenantId, {
      heading: "A payment was sent to your account automatically",
      message:
        created.row.status === "pending_review"
          ? "Because of its size, this withdrawal is waiting for approval from the platform team."
          : "This withdrawal is on its way. You'll get an email when it is complete.",
      details: [
        { label: "Amount", value: formatMinor(created.row.amountMinor) },
        { label: "To", value: `${created.account.accountName} (${maskNumber(created.account.accountNumber)})` },
      ],
    });
    if (created.row.status === "queued") void processPayouts();
  } catch (err) {
    // The payment itself is already safely recorded; the money simply stays on the balance.
    console.error("Automatic withdrawal failed", tenantId, err);
  }
}
