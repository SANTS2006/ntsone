import { z } from "zod";
import { ownImageUrl } from "../../lib/cloudinaryUrl.js";
import { TICKET_DESIGN_IDS, ticketDesign } from "../../shared/designs/index.js";
import { optionalText } from "../idcards/schemas.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #2563eb");

export const ticketConfigSchema = z.object({
  template: z.string().default("horizon"),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  // All optional text falls back to the program's own details when blank.
  eventTitle: optionalText(120),
  tagline: optionalText(140),
  kicker: optionalText(80),
  eventDate: optionalText(100),
  eventTime: optionalText(60),
  venue: optionalText(200),
  terms: optionalText(300),
  contactPhone: optionalText(60),
  website: optionalText(120),
  visibleFields: z.array(z.string()).max(2).default([]),
  // Free, or a price in leones shown on the ticket.
  isPaid: z.boolean().default(false),
  priceAmount: z.number().min(0).max(100_000_000).optional(),
  // What appears on the ticket.
  showPrice: z.boolean().default(true),
  showParticipantName: z.boolean().default(true),
  showRegistrationNumber: z.boolean().default(true),
  showBarcode: z.boolean().default(true),
  showEventDetails: z.boolean().default(true),
  showContact: z.boolean().default(true),
  logoUrl: ownImageUrl.optional(),
  // An event photo or flyer for designs with a picture panel.
  eventImageUrl: ownImageUrl.optional(),
  // An uploaded design sample used by the "custom" template, with the details laid over it.
  backgroundImageUrl: ownImageUrl.optional(),
  textColor: z.enum(["light", "dark"]).default("light"),
  overlayOpacity: z.number().min(0).max(0.8).default(0.35),
  showQrCode: z.boolean().default(true),
  showOnConfirmation: z.boolean().default(true),
});

export type TicketConfigInput = z.input<typeof ticketConfigSchema>;

export interface TicketConfig extends z.output<typeof ticketConfigSchema> {
  primaryColor: string;
  secondaryColor: string;
}

export function resolveTicketConfig(raw: unknown): TicketConfig {
  const stored = (raw ?? {}) as Record<string, unknown>;
  const parsed = ticketConfigSchema.safeParse(stored);
  const config = parsed.success ? parsed.data : ticketConfigSchema.parse({});

  // Tickets saved before the design gallery used "classic" / "modern" / "minimal".
  const legacy = !TICKET_DESIGN_IDS.includes(config.template);
  let template = legacy ? "horizon" : config.template;
  if (legacy && config.backgroundImageUrl) template = "custom";
  const defaults = ticketDesign(template).defaults;

  return {
    ...config,
    template,
    primaryColor: (!legacy && config.primaryColor) || defaults.primary,
    secondaryColor: (!legacy && config.secondaryColor) || defaults.secondary,
  };
}
