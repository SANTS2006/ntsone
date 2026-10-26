import { z } from "zod";

const MAX_AMOUNT_MINOR = 1_000_000_000_000; // NLe 10 billion; far above anything real, and safe as a number
const amount = z
  .number({ invalid_type_error: "Enter the amount as a number", required_error: "Enter an amount" })
  .int("The amount must be a whole number of cents")
  .min(1, "The amount must be more than zero")
  .max(MAX_AMOUNT_MINOR, "That amount is too large");

const label = z.string().trim().min(1, "A column needs a name").max(60, "A column name can have at most 60 characters");
const year = z.number().int().min(2000, "The year must be 2000 or later").max(2200, "That year is too far ahead");
const month = z.number().int().min(1, "The month must be between 1 and 12").max(12, "The month must be between 1 and 12");

export const contributionInputSchema = z
  .object({
    name: z.string().trim().min(2, "Give the contribution a name (at least 2 characters)").max(120, "The name can have at most 120 characters"),
    purpose: z.string().trim().min(2, "Say what the money is for (at least 2 characters)").max(1000, "The purpose can have at most 1000 characters"),
    kind: z.enum(["one_time", "recurring"], { errorMap: () => ({ message: "Choose whether this is a one-time or a recurring contribution" }) }),
    fields: z.array(label).min(1, "Add at least one column, for example Name").max(20, "A contribution can have at most 20 columns"),
    // Recurring only.
    startYear: year.optional(),
    startMonth: month.optional(),
    expectedMonthlyMinor: amount.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const lowered = value.fields.map((f) => f.toLowerCase());
    if (new Set(lowered).size !== lowered.length) ctx.addIssue({ code: "custom", path: ["fields"], message: "Two columns have the same name. Give each column its own name." });
    if (lowered.includes("amount")) ctx.addIssue({ code: "custom", path: ["fields"], message: "The Amount column is added for you. Remove it from your columns." });
  });
export type ContributionInput = z.infer<typeof contributionInputSchema>;

export const contributionUpdateSchema = z.object({
  name: z.string().trim().min(2, "Give the contribution a name (at least 2 characters)").max(120).optional(),
  purpose: z.string().trim().min(2, "Say what the money is for (at least 2 characters)").max(1000).optional(),
  status: z.enum(["active", "closed"]).optional(),
  expectedMonthlyMinor: amount.nullable().optional(),
});
export type ContributionUpdate = z.infer<typeof contributionUpdateSchema>;

export const fieldInputSchema = z.object({ label });
export const fieldUpdateSchema = z.object({ label });

const values = z.record(z.string().uuid(), z.string().trim().max(500, "Each answer can have at most 500 characters")).default({});

export const recordInputSchema = z.object({
  values,
  // One-time: required. Recurring: not used.
  amountMinor: amount.optional(),
  // Recurring: when this contributor starts paying (defaults to the contribution's start).
  startYear: year.optional(),
  startMonth: month.optional(),
});
export type RecordInput = z.infer<typeof recordInputSchema>;

export const recordUpdateSchema = z.object({
  values: values.optional(),
  amountMinor: amount.optional(),
  startYear: year.optional(),
  startMonth: month.optional(),
});
export type RecordUpdate = z.infer<typeof recordUpdateSchema>;

export const paymentInputSchema = z.object({ year, month, amountMinor: amount });
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const withdrawalInputSchema = z.object({
  amountMinor: amount,
  note: z.string().trim().min(2, "Write a note saying why the money was taken (at least 2 characters)").max(1000, "The note can have at most 1000 characters"),
  // When the money was taken; now when left out.
  takenAt: z.coerce.date().optional(),
});
export const withdrawalUpdateSchema = z.object({
  amountMinor: amount.optional(),
  note: z.string().trim().min(2, "Write a note saying why the money was taken (at least 2 characters)").max(1000).optional(),
  takenAt: z.coerce.date().optional(),
});
export type WithdrawalInput = z.infer<typeof withdrawalInputSchema>;
export type WithdrawalUpdate = z.infer<typeof withdrawalUpdateSchema>;

export const trackerQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2200).optional() });
export const exportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
});
