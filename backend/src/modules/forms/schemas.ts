import { z } from "zod";
import { orderItemsSchema } from "../payments/pricing.js";

export const fieldTypeValues = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "date",
  "time",
  "datetime",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "yes_no",
  "image_upload",
  "pdf_upload",
  "document_upload",
  "address",
  "country",
  "gender",
  "date_of_birth",
  "url",
  "currency",
  "rating",
  "consent",
] as const;

export const conditionalRuleSchema = z.object({
  fieldKey: z.string().min(1),
  operator: z.enum(["equals", "not_equals", "contains", "is_empty", "is_not_empty"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const fieldConfigSchema = z
  .object({
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    minNumber: z.number().min(0, "The smallest number can't be negative").max(1e12).optional(),
    maxNumber: z.number().min(0, "The largest number can't be negative").max(1e12).optional(),
    regex: z.string().optional(),
    options: z.array(z.string().min(1)).optional(),
    allowMultiple: z.boolean().optional(),
    maxFileSizeMb: z.number().positive().optional(),
    allowedFileTypes: z.array(z.string()).optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
    // Cascading options: this field's choices depend on the value picked in another
    // choice field, e.g. district -> chiefdoms. `map` is parentOption -> childOptions.
    optionsDependOn: z
      .object({
        fieldKey: z.string().min(1),
        map: z.record(z.array(z.string().min(1))),
      })
      .optional(),
    // Dates: the earliest and latest allowed (YYYY-MM-DD, or "today"); for dates of birth, an age range.
    minDate: z.string().regex(/^(today|\d{4}-\d{2}-\d{2})$/).optional(),
    maxDate: z.string().regex(/^(today|\d{4}-\d{2}-\d{2})$/).optional(),
    minAge: z.number().int().min(0).max(150).optional(),
    maxAge: z.number().int().min(0).max(150).optional(),
    // Fill this field from the answer to another field, until the person types in it themselves.
    autoFillFrom: z.string().min(1).max(100).optional(),
    // Multiple choice: the most options a person may tick.
    maxSelections: z.number().int().min(1).max(100).optional(),
    // An option is only offered when its rules match: option -> rules.
    optionConditions: z.record(z.array(conditionalRuleSchema).max(10)).optional(),
    // The description and help text only show when these rules match.
    descriptionConditions: z.array(conditionalRuleSchema).max(10).optional(),
    // Length, number, date, age and selection limits only apply when these rules match.
    limitConditions: z.array(conditionalRuleSchema).max(10).optional(),
    // Pre-filled answers: only applied when these rules match.
    defaultConditions: z.array(conditionalRuleSchema).max(10).optional(),
    autoFillConditions: z.array(conditionalRuleSchema).max(10).optional(),
    // A required question is only required when these rules match.
    requiredConditions: z.array(conditionalRuleSchema).max(10).optional(),
    // The "Other" text box is only asked when these rules match.
    otherConditions: z.array(conditionalRuleSchema).max(10).optional(),
    // Choices that ask for more: option (or "Yes"/"No") -> what to ask for.
    followUps: z
      .record(
        z.object({
          mode: z.enum(["text", "short_text", "number", "email", "phone", "date", "dropdown", "file", "text_or_file"]),
          label: z.string().max(200).optional(),
          required: z.boolean().optional(),
          options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
          conditions: z.array(conditionalRuleSchema).max(10).optional(),
        }),
      )
      .optional(),
    currencyCode: z.string().length(3).optional(),
    maxRating: z.number().int().min(2).max(10).optional(),
  })
  .catchall(z.unknown());

export const sectionInputSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  orderIndex: z.number().int().min(0),
  conditionalLogic: z.array(conditionalRuleSchema).max(10).optional(),
});

export const fieldInputSchema = z.object({
  fieldKey: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "fieldKey must be lowercase letters, numbers, and underscores only"),
  sectionKey: z.string().min(1).nullable(),
  type: z.enum(fieldTypeValues),
  label: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  placeholder: z.string().max(200).optional(),
  helpText: z.string().max(1000).optional(),
  required: z.boolean().default(false),
  orderIndex: z.number().int().min(0),
  config: fieldConfigSchema.default({}),
  conditionalLogic: z.array(conditionalRuleSchema).optional(),
});

export const formLayoutModeValues = ["stepped", "single"] as const;

export const upsertFormSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  instructions: z.string().max(5000).optional(),
  confirmationMessage: z.string().max(2000).optional(),
  requireConsent: z.boolean().default(false),
  consentText: z.string().max(3000).optional(),
  consentConditions: z.array(conditionalRuleSchema).max(10).optional(),
  showRegistrationNumber: z.boolean().default(true),
  registrationNumberConditions: z.array(conditionalRuleSchema).max(10).optional(),
  reviewConfirmEnabled: z.boolean().default(true),
  reviewConfirmText: z.string().max(1000).optional(),
  reviewConfirmConditions: z.array(conditionalRuleSchema).max(10).optional(),
  layoutMode: z.enum(formLayoutModeValues).default("stepped"),
  // What an order form sells (names and prices); ignored for other programs.
  orderItems: orderItemsSchema.optional(),
  sections: z.array(sectionInputSchema),
  fields: z.array(fieldInputSchema),
});

export type UpsertFormInput = z.infer<typeof upsertFormSchema>;
export type FieldInput = z.infer<typeof fieldInputSchema>;
export type SectionInput = z.infer<typeof sectionInputSchema>;
