import { describe, expect, it } from "vitest";
import { z } from "zod";
import { dateRangeConditions, dateRangeQuery } from "../../src/lib/dateRange.js";
import { users } from "../../src/db/schema/index.js";

describe("date range filter", () => {
  const schema = z.object(dateRangeQuery);

  it("reads the two dates from a query, and accepts none", () => {
    const parsed = schema.parse({ dateFrom: "2026-03-01T00:00:00.000Z", dateTo: "2026-03-31T23:59:59.999Z" });
    expect(parsed.dateFrom).toBeInstanceOf(Date);
    expect(parsed.dateTo?.toISOString()).toBe("2026-03-31T23:59:59.999Z");
    expect(schema.parse({})).toEqual({});
  });

  it("refuses something that is not a date", () => {
    expect(schema.safeParse({ dateFrom: "yesterday-ish" }).success).toBe(false);
  });

  it("adds a condition for each end that was given, and none otherwise", () => {
    expect(dateRangeConditions(users.createdAt, {})).toHaveLength(0);
    expect(dateRangeConditions(users.createdAt, { dateFrom: new Date() })).toHaveLength(1);
    expect(dateRangeConditions(users.createdAt, { dateFrom: new Date(), dateTo: new Date() })).toHaveLength(2);
  });
});
