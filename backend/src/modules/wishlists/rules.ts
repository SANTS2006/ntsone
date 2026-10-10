// The Wish List module's plain rules (no database), so they can be checked on their own.

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const LIST_COLORS = ["blue", "green", "purple", "orange", "pink", "teal", "red", "gray"] as const;

/** Limits that keep one person's data (and every total) well inside what the database and screens can hold exactly. */
export const LIMITS = {
  listsPerPerson: 100,
  itemsPerList: 1000,
  itemsPerRequest: 100,
  maxQuantity: 100_000,
  // Whole minor units (cents): 100 million Leones for one, 100 billion for a total paid.
  maxUnitPriceMinor: 10_000_000_000,
  maxPaidMinor: 10_000_000_000_000,
  maxBudgetMinor: 10_000_000_000_000,
} as const;

/** What an item is expected to cost altogether: quantity x the price of one. Null when no price was given. */
export function proposedTotal(quantity: number, unitPriceMinor: number | null | undefined): number | null {
  if (unitPriceMinor === null || unitPriceMinor === undefined) return null;
  return quantity * unitPriceMinor;
}

/** What to record as paid when a person marks something gotten without typing a price: the expected total, or nothing (0). */
export function defaultPaid(quantity: number, unitPriceMinor: number | null | undefined): number {
  return proposedTotal(quantity, unitPriceMinor) ?? 0;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written YYYY-MM-DD. */
export function isRealDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Today in UTC as YYYY-MM-DD. */
export const today = (now = new Date()) => now.toISOString().slice(0, 10);

/**
 * A date something was gotten on: a real day, not before 1990, and not more than a day ahead of today (that margin
 * covers people whose local date is already tomorrow in UTC terms).
 */
export function validGottenDay(value: string, now = new Date()): boolean {
  if (!isRealDay(value)) return false;
  if (value < "1990-01-01") return false;
  const limit = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  return value <= limit;
}

export interface BudgetPosition {
  budgetMinor: number | null;
  spentMinor: number;
  /** What the items still wished for are expected to cost. */
  plannedMinor: number;
  remainingMinor: number | null;
  /** Spent plus still planned, compared with the budget. */
  overBudgetBy: number;
  percentSpent: number | null;
  state: "none" | "ok" | "warning" | "over";
}

/** How a list stands against its budget: nothing set, fine, close to the limit (90% of it planned or spent), or over. */
export function budgetPosition(budgetMinor: number | null, spentMinor: number, plannedMinor: number): BudgetPosition {
  if (budgetMinor === null) return { budgetMinor, spentMinor, plannedMinor, remainingMinor: null, overBudgetBy: 0, percentSpent: null, state: "none" };
  const committed = spentMinor + plannedMinor;
  const overBudgetBy = Math.max(0, committed - budgetMinor);
  const percentSpent = budgetMinor === 0 ? (spentMinor > 0 ? 100 : 0) : Math.min(1000, Math.round((spentMinor / budgetMinor) * 100));
  const state = committed > budgetMinor ? "over" : budgetMinor > 0 && committed >= budgetMinor * 0.9 ? "warning" : "ok";
  return { budgetMinor, spentMinor, plannedMinor, remainingMinor: budgetMinor - spentMinor, overBudgetBy, percentSpent, state };
}

/** Only web addresses are kept as links, so a saved link can never run a script when someone clicks it. */
export function safeLink(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

export const SHARE_LEVELS = ["read", "write"] as const;
export type ShareLevel = (typeof SHARE_LEVELS)[number];
export const MAX_ACTIVE_SHARES = 50;

/** What each level lets someone with the link do. */
export const SHARE_LEVEL_TEXT: Record<ShareLevel, string> = {
  read: "Can view: sees the items, the gotten list, the summary and the activity, and can download the list. Cannot change anything.",
  write: "Can edit: everything a viewer can, and can also add items, change them, mark them as gotten, move them back and remove or restore them. Cannot change the list itself, its budget or who it is shared with.",
};

export type ShareStatus = "active" | "expired" | "revoked";
export function shareStatus(share: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()): ShareStatus {
  if (share.revokedAt) return "revoked";
  if (share.expiresAt && share.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}
