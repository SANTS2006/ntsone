import { z } from "zod";
import { isRealDay, LIMITS, LIST_COLORS, PRIORITIES, safeLink, SHARE_LEVELS, validGottenDay } from "./rules.js";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const minor = (max: number) => z.number({ invalid_type_error: "Enter a valid amount" }).int("Enter a valid amount").min(0, "The amount cannot be negative").max(max, "That amount is too large");
const day = z.string().refine(isRealDay, "Enter a valid date");
const gottenDay = z.string().refine((v) => validGottenDay(v), "Enter a real date that is not in the future");

const link = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => v === null || v === undefined || safeLink(v) !== null, "Enter a web address starting with http:// or https://")
  .transform((v) => (v ? safeLink(v) : null));

/** The fields of one wished-for item. Everything but the name is optional. */
export const itemFields = {
  name: z.string().trim().min(1, "Write what you wish for").max(200),
  quantity: z.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1").max(LIMITS.maxQuantity).optional(),
  unitPriceMinor: minor(LIMITS.maxUnitPriceMinor).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: text(60),
  notes: text(1000),
  link,
};

export const addItemsSchema = z.object({
  items: z.array(z.object(itemFields)).min(1, "Add at least one item").max(LIMITS.itemsPerRequest, `Add up to ${LIMITS.itemsPerRequest} items at a time`),
});
export type AddItemsInput = z.infer<typeof addItemsSchema>;

/** Editing: any field may be changed; the got-it details only apply to items already gotten. */
export const updateItemSchema = z
  .object({
    name: itemFields.name.optional(),
    quantity: itemFields.quantity,
    unitPriceMinor: itemFields.unitPriceMinor,
    priority: itemFields.priority,
    category: itemFields.category,
    notes: itemFields.notes,
    link: z.string().trim().max(500).nullable().optional().refine((v) => v === null || v === undefined || v === "" || safeLink(v) !== null, "Enter a web address starting with http:// or https://"),
    paidMinor: minor(LIMITS.maxPaidMinor).optional(),
    gottenAt: gottenDay.optional(),
    store: text(120),
    gottenNote: text(500),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

const gotOne = z.object({
  itemId: z.string().uuid(),
  paidMinor: minor(LIMITS.maxPaidMinor).optional(),
  gottenAt: gottenDay.optional(),
  store: text(120),
  note: text(500),
});

/** Marking one or many items as gotten. Anything not given for an item falls back to the shared values, then to today. */
export const markGottenSchema = z.object({
  items: z.array(gotOne).min(1, "Choose at least one item").max(LIMITS.itemsPerRequest),
  gottenAt: gottenDay.optional(),
  store: text(120),
  note: text(500),
});
export type MarkGottenInput = z.infer<typeof markGottenSchema>;

export const listInputSchema = z.object({
  name: z.string().trim().min(1, "Give the list a name").max(120),
  description: text(500),
  budgetMinor: minor(LIMITS.maxBudgetMinor).nullable().optional(),
  targetDate: day.nullable().optional(),
  color: z.enum(LIST_COLORS).optional(),
});
export type ListInput = z.infer<typeof listInputSchema>;

export const listUpdateSchema = listInputSchema
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
export type ListUpdateInput = z.infer<typeof listUpdateSchema>;

export const listsQuerySchema = z.object({ archived: z.enum(["true", "false"]).default("false").transform((v) => v === "true") });

export const itemsQuerySchema = z.object({
  status: z.enum(["wished", "gotten", "removed"]).default("wished"),
  search: z.string().trim().max(100).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.string().trim().max(60).optional(),
  sort: z.enum(["newest", "oldest", "name", "priority", "price_high", "price_low", "gotten_newest", "gotten_oldest", "paid_high"]).optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ItemsQuery = z.infer<typeof itemsQuerySchema>;

export const periodQuerySchema = z.object({ from: day.optional(), to: day.optional() });
export const activityQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30) });
export const exportQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  status: z.enum(["wished", "gotten", "all"]).default("all"),
});

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .email("Enter a valid email address")
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

/** Inviting someone: who they are, how much they can do, how long the link works, and (optionally) an email with the link. */
export const shareInputSchema = z.object({
  label: z.string().trim().min(1, "Write who this is for").max(80),
  email: emailField,
  level: z.enum(SHARE_LEVELS),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  sendEmail: z.boolean().optional(),
});
export type ShareInput = z.infer<typeof shareInputSchema>;

export const shareUpdateSchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    level: z.enum(SHARE_LEVELS).optional(),
    expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
export type ShareUpdateInput = z.infer<typeof shareUpdateSchema>;
