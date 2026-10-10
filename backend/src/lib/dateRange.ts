import { and, gte, lte, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";

/** Query fields for "only rows from this day to that day"; the browser sends the exact start and end moments. */
export const dateRangeQuery = {
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
};

export interface DateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

/** The conditions that keep a table to a date range on one column. Empty when no range was asked for. */
export function dateRangeConditions(column: AnyColumn, range: DateRange): SQL[] {
  const out: SQL[] = [];
  if (range.dateFrom) out.push(gte(column, range.dateFrom));
  if (range.dateTo) out.push(lte(column, range.dateTo));
  return out;
}

export const withDateRange = (column: AnyColumn, range: DateRange) => and(...dateRangeConditions(column, range));
