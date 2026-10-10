import { z } from "zod";
import { isOwnCloudinaryUrl } from "../../lib/cloudinaryUrl.js";
import { ENTRY_KINDS, MAX_AMOUNT_MINOR, PAYMENT_METHODS, canBeOnCredit } from "./rules.js";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date such as 2026-10-04").refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "That date doesn't exist");
const amount = z.number().int("Enter a whole amount in cents").min(1, "The amount must be more than zero").max(MAX_AMOUNT_MINOR, "That amount is too large");
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/** Entries written directly. Loans and their repayments go through the loan pages so they stay in step with the loan. */
const ENTRY_KINDS_DIRECT = ENTRY_KINDS.filter((k) => !k.startsWith("loan_")) as [string, ...string[]];

export const entryInputSchema = z
  .object({
    kind: z.enum(ENTRY_KINDS_DIRECT),
    entryDate: day,
    amountMinor: amount,
    // Left out: paid in full. Less than the amount: the rest is credit (sales, stock and expenses only).
    paidMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR).optional(),
    category: text(60),
    description: text(300),
    partyName: text(100),
    partyPhone: text(30),
    paymentMethod: z.enum(PAYMENT_METHODS).default("cash"),
    reference: text(60),
    voiceNoteId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    const paid = value.paidMinor ?? value.amountMinor;
    if (paid > value.amountMinor) ctx.addIssue({ code: "custom", path: ["paidMinor"], message: "The amount paid can't be more than the total" });
    if (paid < value.amountMinor && !canBeOnCredit(value.kind)) ctx.addIssue({ code: "custom", path: ["paidMinor"], message: "This kind of entry is always paid in full" });
    // Credit has to be with someone, or nobody knows who owes what.
    if (paid < value.amountMinor && !value.partyName) ctx.addIssue({ code: "custom", path: ["partyName"], message: "Say who this is with, so you know who owes what" });
  });
export type EntryInput = z.infer<typeof entryInputSchema>;

export const entryUpdateSchema = z.object({
  entryDate: day.optional(),
  amountMinor: amount.optional(),
  category: z.string().trim().max(60).nullish(),
  description: z.string().trim().max(300).nullish(),
  partyName: z.string().trim().max(100).nullish(),
  partyPhone: z.string().trim().max(30).nullish(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  reference: z.string().trim().max(60).nullish(),
});
export type EntryUpdate = z.infer<typeof entryUpdateSchema>;

export const voidSchema = z.object({ reason: z.string().trim().min(3, "Say why").max(300) });

export const entryPaymentSchema = z.object({
  amountMinor: amount,
  paidOn: day.optional(),
  method: z.enum(PAYMENT_METHODS).default("cash"),
  note: text(200),
});

export const loanInputSchema = z.object({
  direction: z.enum(["lent", "borrowed"]),
  partyName: z.string().trim().min(2, "Say who the loan is with").max(100),
  partyPhone: text(30),
  principalMinor: amount,
  interestPercent: z.number().min(0).max(1000).default(0),
  issuedOn: day,
  dueOn: day.optional(),
  purpose: text(300),
  paymentMethod: z.enum(PAYMENT_METHODS).default("cash"),
  voiceNoteId: z.string().uuid().optional(),
});
export type LoanInput = z.infer<typeof loanInputSchema>;

export const loanUpdateSchema = z.object({
  dueOn: day.nullish(),
  purpose: z.string().trim().max(300).nullish(),
  partyPhone: z.string().trim().max(30).nullish(),
  interestPercent: z.number().min(0).max(1000).optional(),
});

export const repaymentSchema = z.object({
  amountMinor: amount,
  paidOn: day.optional(),
  method: z.enum(PAYMENT_METHODS).default("cash"),
  note: text(200),
});

/** A day range for the books: plain days, not times, so a day means the same thing to everyone. */
export const periodQuerySchema = z.object({ from: day.optional(), to: day.optional() });

export const entriesQuerySchema = periodQuerySchema.extend({
  kind: z.enum(ENTRY_KINDS).optional(),
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  status: z.enum(["active", "voided", "all"]).default("active"),
  // Only entries that still have something unpaid.
  unpaid: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const voiceNoteInputSchema = z.object({
  audioUrl: z.string().url().max(1000).refine(isOwnCloudinaryUrl, "The recording must be uploaded through the app"),
  mimeType: z.string().max(60).optional(),
  durationSeconds: z.number().int().min(1).max(300).optional(),
  caption: text(300),
  transcript: text(2000),
});

export const voiceNoteUpdateSchema = z.object({
  caption: z.string().trim().max(300).nullish(),
  transcript: z.string().trim().max(2000).nullish(),
  status: z.enum(["new", "done"]).optional(),
});
