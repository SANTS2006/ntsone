import { eq } from "drizzle-orm";
import { env } from "../../config/env.js";
import type { db } from "../../db/client.js";
import { db as database } from "../../db/client.js";
import { tenants } from "../../db/schema/index.js";
import { leonesToMinor } from "../../lib/money.js";

/**
 * What an organization's payments cost and how fast its money is released. The platform sets each organization's fee
 * and hold time; anything it has not set falls back to the platform-wide defaults.
 */
export interface PaymentTerms {
  /** Percent of every payment the platform keeps. */
  feePercent: number;
  /** A flat amount (in cents) kept on top of the percent. */
  feeFixedMinor: number;
  /** Minutes money is held after a payment before it can be withdrawn. */
  holdMinutes: number;
  /** Withdrawals are switched on from this moment (null: already on). */
  withdrawalsActiveFrom: Date | null;
  /** The organization's own choice: send each payment to its withdrawal account the moment it succeeds. */
  autoWithdraw: boolean;
  autoWithdrawAccountId: string | null;
  /** Whether the hosted checkout offers card payments for this organization. */
  allowCards: boolean;
  /** Which values the platform set for this organization (the rest are the platform defaults). */
  custom: { feePercent: boolean; feeFixed: boolean; hold: boolean; cards: boolean };
}

export const defaultTerms = () => ({ feePercent: env.PAYMENTS_FEE_PERCENT, feeFixedMinor: leonesToMinor(env.PAYMENTS_FEE_FIXED), holdMinutes: env.PAYMENTS_HOLD_MINUTES });

export async function termsFor(tenantId: string | null, executor: Pick<typeof db, "select"> = database): Promise<PaymentTerms> {
  const base = defaultTerms();
  const none: PaymentTerms = { ...base, withdrawalsActiveFrom: null, autoWithdraw: false, autoWithdrawAccountId: null, allowCards: env.MONIME_ALLOW_CARDS, custom: { feePercent: false, feeFixed: false, hold: false, cards: false } };
  if (!tenantId) return none;
  const [row] = await executor
    .select({
      feePercent: tenants.feePercent,
      feeFixedMinor: tenants.feeFixedMinor,
      holdMinutes: tenants.holdMinutes,
      withdrawalsActiveFrom: tenants.withdrawalsActiveFrom,
      autoWithdraw: tenants.autoWithdraw,
      autoWithdrawAccountId: tenants.autoWithdrawAccountId,
      allowCards: tenants.allowCards,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!row) return none;
  const feePercent = row.feePercent === null ? null : Number(row.feePercent);
  return {
    feePercent: feePercent ?? base.feePercent,
    feeFixedMinor: row.feeFixedMinor ?? base.feeFixedMinor,
    holdMinutes: row.holdMinutes ?? base.holdMinutes,
    withdrawalsActiveFrom: row.withdrawalsActiveFrom,
    autoWithdraw: row.autoWithdraw,
    autoWithdrawAccountId: row.autoWithdrawAccountId,
    allowCards: row.allowCards ?? env.MONIME_ALLOW_CARDS,
    custom: { feePercent: feePercent !== null, feeFixed: row.feeFixedMinor !== null, hold: row.holdMinutes !== null, cards: row.allowCards !== null },
  };
}

/** The fee as it stands now for an organization, for showing before someone agrees. */
export async function feeTermsFor(tenantId: string | null) {
  const terms = await termsFor(tenantId);
  return { feePercent: terms.feePercent, feeFixedMinor: terms.feeFixedMinor };
}

/** True while the organization's withdrawals have not been switched on yet. */
export const withdrawalsInactive = (terms: Pick<PaymentTerms, "withdrawalsActiveFrom">) => Boolean(terms.withdrawalsActiveFrom && terms.withdrawalsActiveFrom.getTime() > Date.now());
