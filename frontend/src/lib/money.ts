// Money is whole minor units (1 Leone = 100 cents) everywhere except what a person types or reads.

export const MINOR_PER_UNIT = 100;

/** "NLe 1,250.50" */
export function formatMinor(minor: number, currency = "SLE"): string {
  const prefix = currency === "SLE" ? "NLe" : currency;
  return `${prefix} ${(minor / MINOR_PER_UNIT).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What a person typed (e.g. "1,250.5") as whole cents; null if it isn't a valid amount. */
export function parseLeones(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "").replace(/^NLe/i, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const minor = Math.round(Number(cleaned) * MINOR_PER_UNIT);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Cents as the plain number a person edits (1250.5), empty for zero. */
export function minorToInput(minor: number): string {
  if (!minor) return "";
  const leones = minor / MINOR_PER_UNIT;
  return Number.isInteger(leones) ? String(leones) : leones.toFixed(2);
}
