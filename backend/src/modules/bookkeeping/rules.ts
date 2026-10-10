// The rules of the books, kept in one place so the cash book, the loans and the reports always agree.

export const ENTRY_KINDS = ["sale", "other_income", "purchase", "expense", "loan_in", "loan_out", "loan_repayment_in", "loan_repayment_out", "owner_in", "owner_out"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** What each kind of entry is, in plain words. */
export const KIND_LABEL: Record<EntryKind, string> = {
  sale: "Sale",
  other_income: "Other money received",
  purchase: "Stock bought",
  expense: "Expense",
  loan_in: "Loan received",
  loan_out: "Loan given",
  loan_repayment_in: "Loan paid back to you",
  loan_repayment_out: "Loan you paid back",
  owner_in: "Money the owner put in",
  owner_out: "Money the owner took out",
};

/** Kinds where money comes in. The others are money going out. */
const MONEY_IN = new Set<EntryKind>(["sale", "other_income", "loan_in", "loan_repayment_in", "owner_in"]);
export const isMoneyIn = (kind: string) => MONEY_IN.has(kind as EntryKind);

/** Kinds that can be bought or sold on credit: part of the amount can stay unpaid. Everything else is paid in full when it is written down. */
const CREDIT_KINDS = new Set<EntryKind>(["sale", "purchase", "expense"]);
export const canBeOnCredit = (kind: string) => CREDIT_KINDS.has(kind as EntryKind);

/** Kinds that make up the business's income (revenue) and its costs. Loans and the owner's own money are not profit or loss. */
export const REVENUE_KINDS: readonly EntryKind[] = ["sale", "other_income"];
export const COST_OF_GOODS_KINDS: readonly EntryKind[] = ["purchase"];
export const EXPENSE_KINDS: readonly EntryKind[] = ["expense"];
export const LOAN_KINDS: readonly EntryKind[] = ["loan_in", "loan_out", "loan_repayment_in", "loan_repayment_out"];

export const PAYMENT_METHODS = ["cash", "mobile_money", "bank", "other"] as const;

/** The kind of entry that records the loan itself, and the kind that records money paid back against it. */
export const loanEntryKind = (direction: "lent" | "borrowed"): EntryKind => (direction === "lent" ? "loan_out" : "loan_in");
export const repaymentKind = (direction: "lent" | "borrowed"): EntryKind => (direction === "lent" ? "loan_repayment_in" : "loan_repayment_out");

/** The most any single amount can be, in minor units (NLe 1,000,000,000), so a typo can't write nonsense into the books. */
export const MAX_AMOUNT_MINOR = 100_000_000_000;

export interface LoanFigures {
  principalMinor: number;
  interestPercent: number;
  repaidMinor: number;
  status: string;
  dueOn: string | null;
}

/**
 * What a loan comes to and what is left: the principal plus its flat interest, less what has been paid back.
 * Overdue means still owing after its due date.
 */
export function loanBalance(loan: LoanFigures, today: string) {
  const interestMinor = Math.round((loan.principalMinor * loan.interestPercent) / 100);
  const totalDueMinor = loan.principalMinor + interestMinor;
  const balanceMinor = Math.max(0, totalDueMinor - loan.repaidMinor);
  const open = loan.status === "open";
  return {
    interestMinor,
    totalDueMinor,
    balanceMinor,
    overdue: open && balanceMinor > 0 && loan.dueOn !== null && loan.dueOn < today,
    // Paid back in full (or more).
    settled: loan.repaidMinor >= totalDueMinor,
  };
}

/** Today in the form the books use (YYYY-MM-DD), in UTC. */
export const todayString = (now = new Date()) => now.toISOString().slice(0, 10);
