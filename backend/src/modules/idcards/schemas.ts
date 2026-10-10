import { z } from "zod";
import { ownImageUrl } from "../../lib/cloudinaryUrl.js";
import { DEFAULT_ID_CARD_TERMS, DEFAULT_ROLE_OPTIONS, ID_CARD_DESIGN_IDS, idCardDesign } from "../../shared/designs/index.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #2563eb");

/** Optional free text where a blank value means "not set". */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const idCardConfigSchema = z.object({
  template: z.string().default("aurora"),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  // The line under the name: a fixed text, or the answer to a form field.
  roleText: z.string().trim().max(60).default("Participant"),
  roleFieldKey: optionalText(100),
  visibleFields: z.array(z.string()).max(3).default([]),
  showQrCode: z.boolean().default(true),
  photoFieldKey: optionalText(100),
  // Where the photo comes from: the registrant's uploaded photo, one event flyer for everyone, or none.
  photoSource: z.enum(["field", "flyer", "none"]).default("field"),
  flyerUrl: ownImageUrl.optional(),
  // Presets for giving each registrant a role on their card from the registration page.
  roleOptions: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  logoUrl: ownImageUrl.optional(),
  // Used by the "custom" template: the organization's own uploaded card design.
  backgroundImageUrl: ownImageUrl.optional(),
  terms: z.string().trim().max(600).optional(),
  contactPhone: optionalText(60),
  contactEmail: optionalText(120),
  contactWebsite: optionalText(120),
  contactAddress: optionalText(160),
  signatureLabel: z.string().trim().max(40).default("Authorized Signature"),
  // What appears on the card.
  showRegistrationNumber: z.boolean().default(true),
  showRole: z.boolean().default(true),
  showDates: z.boolean().default(true),
  showTerms: z.boolean().default(true),
  showContact: z.boolean().default(true),
  showSignature: z.boolean().default(true),
  showBarcode: z.boolean().default(true),
  // Offer the card on the public registration success page (and allow its public download).
  showOnConfirmation: z.boolean().default(true),
});

export type IdCardConfig = z.input<typeof idCardConfigSchema>;

/** Admin changes to one registrant's ID card. */
export const documentOverridesSchema = z.object({
  role: z.string().trim().max(40).nullish(),
  photoUrl: ownImageUrl.nullish(),
});

export type DocumentOverrides = z.infer<typeof documentOverridesSchema>;

export function readOverrides(raw: unknown): DocumentOverrides {
  const parsed = documentOverridesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export interface ResolvedIdCardConfig extends z.output<typeof idCardConfigSchema> {
  primaryColor: string;
  secondaryColor: string;
  termsList: string[];
  roleOptions: string[];
}

/** Stored config with defaults applied; unknown designs and configs saved before designs existed fall back sensibly. */
export function resolveIdCardConfig(raw: unknown): ResolvedIdCardConfig {
  const stored = (raw ?? {}) as Record<string, unknown>;
  const parsed = idCardConfigSchema.safeParse(stored);
  const config = parsed.success ? parsed.data : idCardConfigSchema.parse({});

  let template = ID_CARD_DESIGN_IDS.includes(config.template) ? config.template : "aurora";
  // Configs from before the design gallery: an uploaded background meant "use my design", and
  // their colors belonged to the old gradient card, so the chosen design's own colors apply.
  const legacy = stored.template === undefined;
  if (legacy && config.backgroundImageUrl) template = "custom";
  const defaults = idCardDesign(template).defaults;

  // Never-edited terms get sensible defaults; terms cleared on purpose stay empty.
  const terms = config.terms ?? DEFAULT_ID_CARD_TERMS.join("\n");
  const termsList = terms
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    ...config,
    template,
    terms,
    roleOptions: config.roleOptions?.length ? config.roleOptions : DEFAULT_ROLE_OPTIONS,
    primaryColor: (!legacy && config.primaryColor) || defaults.primary,
    secondaryColor: (!legacy && config.secondaryColor) || defaults.secondary,
    termsList,
  };
}
