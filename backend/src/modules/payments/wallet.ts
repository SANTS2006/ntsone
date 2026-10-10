import { and, desc, eq, isNull, sql, type Column } from "drizzle-orm";
import { db } from "../../db/client.js";
import { payments, walletEntries } from "../../db/schema/index.js";
import { env } from "../../config/env.js";
import { dateRangeConditions, type DateRange } from "../../lib/dateRange.js";
import { platformFee, leonesToMinor } from "../../lib/money.js";
import { toOffsetLimit, buildPaginatedResult, type PaginationInput } from "../../lib/pagination.js";

// An organization's money is an append-only ledger (wallet_entries). A balance is the sum of its entries.
// Money from a payment is credited when Monime confirms it, but can't be withdrawn until the hold has passed.

/** Matches an organization, or (null) the platform's own money. */
export const tenantIs = (column: Column, tenantId: string | null) => (tenantId === null ? isNull(column) : eq(column, tenantId));

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface Balances {
  /** Everything credited minus everything withdrawn or charged. */
  totalMinor: number;
  /** What can be withdrawn right now. */
  availableMinor: number;
  /** Paid in, but still within the hold period. */
  pendingMinor: number;
}

export async function balancesFor(tenantId: string | null, executor: Pick<typeof db, "select"> = db): Promise<Balances> {
  const [row] = await executor
    .select({
      total: sql<string>`coalesce(sum(${walletEntries.amountMinor}), 0)`,
      held: sql<string>`coalesce(sum(case when ${walletEntries.availableAt} > now() then ${walletEntries.amountMinor} else 0 end), 0)`,
    })
    .from(walletEntries)
    .where(tenantIs(walletEntries.tenantId, tenantId));
  const total = Number(row?.total ?? 0);
  const held = Number(row?.held ?? 0);
  return { totalMinor: total, availableMinor: total - held, pendingMinor: held };
}

/**
 * Credits a settled payment to its organization: the full amount (available after the hold), then the platform's
 * fee taken out. Safe to call twice for the same payment: the database allows each entry once.
 */
export async function creditPayment(tx: Tx, payment: { id: string; tenantId: string; amountMinor: number; currency: string }) {
  const feeMinor = platformFee(payment.amountMinor, env.PAYMENTS_FEE_PERCENT, leonesToMinor(env.PAYMENTS_FEE_FIXED));
  const availableAt = new Date(Date.now() + env.PAYMENTS_HOLD_MINUTES * 60_000);
  await tx
    .insert(walletEntries)
    .values({ tenantId: payment.tenantId, kind: "payment", amountMinor: payment.amountMinor, currency: payment.currency, availableAt, paymentId: payment.id })
    .onConflictDoNothing();
  if (feeMinor > 0) {
    await tx
      .insert(walletEntries)
      // Held for the same time as the payment, so the balance never dips below zero while the money is on hold.
      .values({ tenantId: payment.tenantId, kind: "fee", amountMinor: -feeMinor, currency: payment.currency, availableAt, paymentId: payment.id, note: "Platform fee" })
      .onConflictDoNothing();
  }
  if (feeMinor > 0) {
    // The same fee, on the platform's own ledger (no organization), released at the same time.
    await tx
      .insert(walletEntries)
      .values({ tenantId: null, kind: "platform_fee", amountMinor: feeMinor, currency: payment.currency, availableAt, paymentId: payment.id, note: "Platform fee" })
      .onConflictDoNothing();
  }
  return { feeMinor, netMinor: payment.amountMinor - feeMinor };
}

export async function listEntries(tenantId: string | null, pagination: PaginationInput, range: DateRange = {}) {
  const { offset, limit } = toOffsetLimit(pagination);
  const where = and(tenantIs(walletEntries.tenantId, tenantId), ...dateRangeConditions(walletEntries.createdAt, range));
  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: walletEntries.id,
        kind: walletEntries.kind,
        amountMinor: walletEntries.amountMinor,
        currency: walletEntries.currency,
        availableAt: walletEntries.availableAt,
        note: walletEntries.note,
        createdAt: walletEntries.createdAt,
        registrationNumber: sql<string | null>`(select r.registration_number from registrations r where r.id = ${payments.registrationId})`,
      })
      .from(walletEntries)
      .leftJoin(payments, eq(payments.id, walletEntries.paymentId))
      .where(where)
      .orderBy(desc(walletEntries.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(walletEntries).where(and(where)),
  ]);
  return buildPaginatedResult(items, totalRow[0]?.n ?? 0, pagination);
}
