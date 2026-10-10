// Money is kept as whole minor units everywhere (1 Leone = 100 cents), so adding and splitting amounts
// never drifts the way decimal numbers do. Only the edges (what a person types or reads) use Leones.

export const MINOR_PER_UNIT = 100;
export const CURRENCY = "SLE";

/** Leones as typed by a person (e.g. 1250.5) to whole cents. Refuses negative, non-finite and absurd values. */
export function leonesToMinor(leones: number): number {
  if (!Number.isFinite(leones) || leones < 0) throw new RangeError("Enter a valid amount");
  const minor = Math.round(leones * MINOR_PER_UNIT);
  if (!Number.isSafeInteger(minor)) throw new RangeError("That amount is too large");
  return minor;
}

export const minorToLeones = (minor: number) => minor / MINOR_PER_UNIT;

/** "NLe 1,250.50" */
export function formatMinor(minor: number, currency = CURRENCY): string {
  const prefix = currency === "SLE" ? "NLe" : currency;
  return `${prefix} ${minorToLeones(minor).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The platform's cut of a payment: a percentage (rounded to the nearest cent) plus a fixed amount, never more than the payment. */
export function platformFee(grossMinor: number, percent: number, fixedMinor: number): number {
  const fee = Math.round((grossMinor * percent) / 100) + fixedMinor;
  return Math.max(0, Math.min(grossMinor, fee));
}
