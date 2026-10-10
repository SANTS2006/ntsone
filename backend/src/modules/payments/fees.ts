import { env } from "../../config/env.js";
import { leonesToMinor } from "../../lib/money.js";
import { AppError } from "../../lib/errors.js";

// The platform keeps a fee from every payment. Whoever turns payments on has to agree to it first, and the
// agreement (which fee, when, and who) is kept with the settings.

export interface FeeAcceptance {
  percent: number;
  at: string;
  by: string;
}

/** The fee as it stands now, for showing before someone agrees. */
export const currentFeeTerms = () => ({ feePercent: env.PAYMENTS_FEE_PERCENT, feeFixedMinor: leonesToMinor(env.PAYMENTS_FEE_FIXED) });

/** True when the fee on offer is the one that was agreed to, or lower. */
export const feeIsAccepted = (accepted: FeeAcceptance | undefined) => Boolean(accepted) && accepted!.percent >= env.PAYMENTS_FEE_PERCENT;

/** Only an organization admin (or the platform team) can bind the organization to the platform's fee. */
export function assertCanAgreeToFee(role: string, acceptFee: boolean | undefined) {
  if (acceptFee && role !== "admin" && role !== "super_admin") throw AppError.forbidden("Only an organization admin can agree to the platform fee.");
}

/**
 * Called when payments are being turned on or kept on. Returns the agreement to store: the existing one if it still
 * covers the fee, or a new one if the admin ticked "I agree". Otherwise asks them to agree.
 */
export function resolveFeeAcceptance(existing: FeeAcceptance | undefined, acceptFee: boolean | undefined, userId: string): FeeAcceptance {
  if (feeIsAccepted(existing) && !acceptFee) return existing!;
  if (!acceptFee) {
    const { feePercent, feeFixedMinor } = currentFeeTerms();
    throw AppError.validation(
      `Agree to the platform fee before turning payments on: ${feePercent}% of every payment${feeFixedMinor > 0 ? ` plus ${(feeFixedMinor / 100).toFixed(2)} NLe` : ""} is kept by the platform.`,
    );
  }
  return { percent: env.PAYMENTS_FEE_PERCENT, at: new Date().toISOString(), by: userId };
}
