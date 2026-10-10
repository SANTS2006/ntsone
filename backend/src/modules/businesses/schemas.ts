import { dateRangeQuery } from "../../lib/dateRange.js";
import { z } from "zod";
import { ownImageUrl } from "../../lib/cloudinaryUrl.js";
import { paginationSchema } from "../../lib/pagination.js";
import { CARD_TEMPLATES, DOCUMENT_TEMPLATES, STATUS_COLORS, type CardTemplate, type DocumentTemplate } from "../../shared/designs/index.js";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #2563eb");

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2, "Give the business a name").max(200),
  description: optionalText(2000),
  email: z.string().trim().email().max(254).nullish().transform((v) => v || null),
  phone: optionalText(60),
  address: optionalText(500),
  tenantId: z.string().uuid().optional(),
});

export const updateBusinessSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: optionalText(2000),
    logoUrl: ownImageUrl.nullish().transform((v) => v ?? null),
    email: z.string().trim().email().max(254).nullish().or(z.literal("")).transform((v) => v || null),
    phone: optionalText(60),
    address: optionalText(500),
    website: optionalText(200),
    taxNumber: optionalText(100),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like SLE"),
    brandColor: hexColor,
    notifyCustomerOnStatus: z.boolean(),
  })
  .partial();

export const documentSettingsSchema = z.object({
  prefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  title: z.string().trim().min(1).max(40),
  template: z.enum(DOCUMENT_TEMPLATES.map((t) => t.id) as [DocumentTemplate, ...DocumentTemplate[]]),
  accentColor: hexColor,
  taxLabel: z.string().trim().min(1).max(30),
  defaultTaxRate: z.number().min(0).max(100),
  dueDays: z.number().int().min(0).max(365),
  defaultNotes: z.string().max(2000),
  defaultTerms: z.string().max(2000),
  paymentDetails: z.string().max(1000),
  footer: z.string().max(300),
  signatureLabel: z.string().max(80),
  showLogo: z.boolean(),
  showBusinessDetails: z.boolean(),
  customFields: z
    .array(z.object({ key: z.string().trim().min(1).max(40), label: z.string().trim().min(1).max(60) }))
    .max(10),
});

const lineItem = z.object({
  description: z.string().trim().min(1, "Every item needs a description").max(500),
  quantity: z.number().min(0).max(1_000_000),
  unitPrice: z.number().min(0).max(1_000_000_000),
});

export const saveDocumentSchema = z.object({
  status: z.string().trim().max(30).optional(),
  clientName: z.string().trim().min(1, "Enter who this is for").max(200),
  clientEmail: z.string().trim().email("Enter a valid email address").max(254).nullish().or(z.literal("")).transform((v) => v || null),
  clientPhone: optionalText(60),
  clientAddress: optionalText(500),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().nullish().transform((v) => v ?? null),
  paymentMethod: optionalText(80),
  items: z.array(lineItem).min(1, "Add at least one item").max(200),
  discount: z.number().min(0).max(1_000_000_000).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  amountPaid: z.number().min(0).max(1_000_000_000).default(0),
  notes: optionalText(2000),
  terms: optionalText(2000),
  customFields: z.record(z.string().max(40), z.string().max(300)).default({}),
});

const statusList = (required: readonly string[]) =>
  z
    .array(
      z.object({
        key: z.string().trim().min(1).max(30).regex(/^[a-z0-9_]+$/, "Status keys use lowercase letters, numbers and underscores"),
        label: z.string().trim().min(1, "Every status needs a name").max(40),
        color: z.enum(STATUS_COLORS as unknown as [string, ...string[]]),
      }),
    )
    .min(1, "Keep at least one status")
    .max(20)
    .superRefine((list, ctx) => {
      const keys = list.map((s) => s.key);
      if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Two statuses have the same name" });
      for (const key of required) {
        if (!keys.includes(key)) ctx.addIssue({ code: "custom", message: `The "${key}" status is needed and can't be removed (you can rename it)` });
      }
    });

// "submitted" is where every new order starts; invoices and receipts start on their first status.
export const statusConfigSchema = z.object({
  order: statusList(["submitted"]),
  invoice: statusList([]),
  receipt: statusList([]),
  quotation: statusList([]).optional(),
});

export const listDocumentsQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  status: z.string().trim().max(30).optional(),
  ...dateRangeQuery,
});

export const sendDocumentSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254).optional(),
  message: z.string().trim().max(2000).optional(),
});

export const listBusinessesQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type SaveDocumentInput = z.infer<typeof saveDocumentSchema>;

const cardText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const saveCardSchema = z.object({
  name: z.string().trim().min(1, "Enter the person's name").max(200),
  jobTitle: cardText(120),
  company: z.string().trim().min(1, "Enter the company name").max(200),
  phone: cardText(60),
  email: z.string().trim().email("Enter a valid email address").max(254).nullish().or(z.literal("")).transform((v) => v || null),
  website: cardText(200),
  address: cardText(300),
  tagline: cardText(120),
  photoUrl: ownImageUrl.nullish().or(z.literal("")).transform((v) => v || null),
  template: z.enum(CARD_TEMPLATES.map((t) => t.id) as [CardTemplate, ...CardTemplate[]]),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  showQr: z.boolean(),
});

export const listCardsQuerySchema = paginationSchema.extend({ search: z.string().trim().min(1).optional(), ...dateRangeQuery });

export const sendCardSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  recipientName: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
});

export type SaveCardInput = z.infer<typeof saveCardSchema>;
