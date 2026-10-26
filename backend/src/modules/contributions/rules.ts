// The calendar and money rules of the Contributions module, kept apart from the database so they are easy to test.

export type CellStatus = "paid" | "partial" | "unpaid" | "upcoming" | "na";

export interface YearMonth {
  year: number;
  month: number;
}

/** A month as one number, so months can be compared and counted. */
export const monthIndex = ({ year, month }: YearMonth) => year * 12 + (month - 1);

/** The current month (UTC), or the one given. */
export const currentMonth = (now = new Date()): YearMonth => ({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });

/**
 * What one month looks like for one contributor:
 *  - na: before they were due to start paying
 *  - upcoming: the month has not started yet
 *  - paid / partial: money was recorded (partial when less than the amount expected each month)
 *  - unpaid: the month has started (or passed) and nothing was recorded
 */
export function cellStatus(args: { start: YearMonth; cell: YearMonth; now: YearMonth; paidMinor: number | null; expectedMinor: number | null }): CellStatus {
  const { start, cell, now, paidMinor, expectedMinor } = args;
  if (monthIndex(cell) < monthIndex(start)) return paidMinor !== null ? "paid" : "na";
  if (paidMinor !== null) return expectedMinor !== null && paidMinor < expectedMinor ? "partial" : "paid";
  if (monthIndex(cell) > monthIndex(now)) return "upcoming";
  return "unpaid";
}

/** True once the month is over: a payment recorded for it can no longer be changed or removed. */
export const isPastMonth = (cell: YearMonth, now: YearMonth) => monthIndex(cell) < monthIndex(now);

/** Every year from `fromYear` to `toYear`, oldest first. */
export function yearRange(fromYear: number, toYear: number): number[] {
  const years: number[] = [];
  for (let y = fromYear; y <= toYear; y++) years.push(y);
  return years;
}

/** How many months a contributor has been due to pay, from their start to now (never negative). */
export function monthsDue(start: YearMonth, now: YearMonth): number {
  return Math.max(0, monthIndex(now) - monthIndex(start) + 1);
}
