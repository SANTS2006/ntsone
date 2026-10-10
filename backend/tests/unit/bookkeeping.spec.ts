import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const rules = await import("../../src/modules/bookkeeping/rules.js");
const { entryInputSchema, loanInputSchema, voiceNoteInputSchema } = await import("../../src/modules/bookkeeping/schemas.js");
const { resolvePeriod } = await import("../../src/modules/bookkeeping/reports.js");

describe("the rules of the books", () => {
  it("knows which money comes in and which goes out", () => {
    expect(rules.isMoneyIn("sale")).toBe(true);
    expect(rules.isMoneyIn("loan_repayment_in")).toBe(true);
    expect(rules.isMoneyIn("expense")).toBe(false);
    expect(rules.isMoneyIn("owner_out")).toBe(false);
    // Every kind is one or the other.
    for (const kind of rules.ENTRY_KINDS) expect(typeof rules.isMoneyIn(kind)).toBe("boolean");
  });

  it("only lets sales, stock and expenses be on credit", () => {
    expect(rules.canBeOnCredit("sale")).toBe(true);
    expect(rules.canBeOnCredit("purchase")).toBe(true);
    expect(rules.canBeOnCredit("loan_out")).toBe(false);
    expect(rules.canBeOnCredit("owner_in")).toBe(false);
  });

  it("works out what is left on a loan, with its flat interest", () => {
    const loan = { principalMinor: 100_000, interestPercent: 10, repaidMinor: 30_000, status: "open", dueOn: "2026-01-01" };
    expect(rules.loanBalance(loan, "2026-02-01")).toMatchObject({ interestMinor: 10_000, totalDueMinor: 110_000, balanceMinor: 80_000, overdue: true, settled: false });
    // Not overdue before its day, never overdue once it is paid.
    expect(rules.loanBalance({ ...loan, dueOn: "2026-03-01" }, "2026-02-01").overdue).toBe(false);
    expect(rules.loanBalance({ ...loan, repaidMinor: 110_000 }, "2026-02-01")).toMatchObject({ balanceMinor: 0, overdue: false, settled: true });
    expect(rules.loanBalance({ ...loan, repaidMinor: 999_999 }, "2026-02-01").balanceMinor).toBe(0);
  });
});

describe("what can be written in the books", () => {
  const base = { kind: "sale", entryDate: "2026-10-04", amountMinor: 50_000 };

  it("accepts a normal sale, paid in full unless said otherwise", () => {
    expect(entryInputSchema.parse(base).paymentMethod).toBe("cash");
  });

  it("refuses nonsense amounts", () => {
    for (const amountMinor of [0, -5, 1.5, 100_000_000_001]) expect(entryInputSchema.safeParse({ ...base, amountMinor }).success).toBe(false);
  });

  it("needs a name for credit, and refuses credit where it makes no sense", () => {
    expect(entryInputSchema.safeParse({ ...base, paidMinor: 10_000 }).success).toBe(false);
    expect(entryInputSchema.safeParse({ ...base, paidMinor: 10_000, partyName: "Aminata" }).success).toBe(true);
    expect(entryInputSchema.safeParse({ ...base, kind: "owner_in", paidMinor: 10_000, partyName: "Me" }).success).toBe(false);
    // Paid more than the total.
    expect(entryInputSchema.safeParse({ ...base, paidMinor: 60_000, partyName: "Aminata" }).success).toBe(false);
  });

  it("keeps loans for the loan pages", () => {
    expect(entryInputSchema.safeParse({ ...base, kind: "loan_out" }).success).toBe(false);
    expect(loanInputSchema.safeParse({ direction: "lent", partyName: "Ibrahim", principalMinor: 100_000, issuedOn: "2026-10-01" }).success).toBe(true);
    expect(loanInputSchema.safeParse({ direction: "given", partyName: "Ibrahim", principalMinor: 100_000, issuedOn: "2026-10-01" }).success).toBe(false);
  });

  it("only takes voice recordings uploaded through the app", () => {
    expect(voiceNoteInputSchema.safeParse({ audioUrl: "https://evil.example.com/a.webm" }).success).toBe(false);
    expect(voiceNoteInputSchema.safeParse({ audioUrl: "http://169.254.169.254/latest" }).success).toBe(false);
  });
});

describe("report periods", () => {
  it("is this month so far unless asked for something else", () => {
    expect(resolvePeriod(undefined, undefined, new Date("2026-10-04T10:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-04" });
    expect(resolvePeriod("2026-01-01", "2026-03-31")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });
});
