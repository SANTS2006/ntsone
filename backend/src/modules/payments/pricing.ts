import { z } from "zod";
import { env } from "../../config/env.js";
import { isOwnCloudinaryUrl } from "../../lib/cloudinaryUrl.js";
import { AppError } from "../../lib/errors.js";
import { leonesToMinor } from "../../lib/money.js";

/** Monime accepts up to 16 lines in one checkout. */
export const MAX_LINE_ITEMS = 16;
/** The most one payment may be, in cents. */
export const MAX_PAYMENT_MINOR = leonesToMinor(env.PAYMENTS_MAX_AMOUNT);

const price = z.number().int().min(0).max(MAX_PAYMENT_MINOR);

/** A program's payment settings: switched on or off, and what each thing costs (in cents; 0 means free). */
export const paymentConfigSchema = z.object({
  enabled: z.boolean().default(false),
  registrationFeeMinor: price.default(0),
  idCardPriceMinor: price.default(0),
  ticketPriceMinor: price.default(0),
  // Set by the server when the admin agrees to the platform's fee; never taken from what the browser sends.
  feeAccepted: z.object({ percent: z.number(), at: z.string(), by: z.string() }).optional(),
});
export type PaymentConfig = z.infer<typeof paymentConfigSchema>;

/** What the browser may send: the settings and whether the admin agrees to the platform's fee. */
export const paymentConfigInputSchema = paymentConfigSchema.omit({ feeAccepted: true }).extend({ acceptFee: z.boolean().optional() });

export function resolvePaymentConfig(raw: unknown): PaymentConfig {
  const parsed = paymentConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { enabled: false, registrationFeeMinor: 0, idCardPriceMinor: 0, ticketPriceMinor: 0 };
}

/** One thing an order form sells. */
export const orderItemSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Item ids use letters, numbers, dashes and underscores"),
  name: z.string().trim().min(1, "Every item needs a name").max(100),
  description: z.string().trim().max(300).optional(),
  priceMinor: price.refine((v) => v > 0, "Every item needs a price above zero"),
  imageUrl: z.string().url().max(1000).refine(isOwnCloudinaryUrl, "Item pictures must be uploaded here").optional(),
  // The most of this item one order may hold; unset means up to 1000.
  maxQuantity: z.number().int().min(1).max(1000).optional(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderItemsSchema = z
  .array(orderItemSchema)
  .max(200)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, "Two items share the same id");

export function resolveOrderItems(raw: unknown): OrderItem[] {
  const parsed = orderItemsSchema.safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

/** What the person ticked on an order form: item ids and how many of each. */
export const orderSelectionSchema = z
  .array(z.object({ itemId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(1000) }))
  .max(60);
export type OrderSelection = z.infer<typeof orderSelectionSchema>;

export interface LineItem {
  id: string;
  name: string;
  unitMinor: number;
  quantity: number;
  totalMinor: number;
}

export const sumLines = (lines: LineItem[]) => lines.reduce((sum, l) => sum + l.totalMinor, 0);

/** The registration fee, ID card and ticket a registrant pays for, from the program's own settings. */
export function programLineItems(program: { idCardEnabled: boolean; ticketEnabled: boolean }, config: PaymentConfig): LineItem[] {
  const lines: LineItem[] = [];
  const add = (id: string, name: string, unitMinor: number) => {
    if (unitMinor > 0) lines.push({ id, name, unitMinor, quantity: 1, totalMinor: unitMinor });
  };
  add("registration", "Registration fee", config.registrationFeeMinor);
  if (program.idCardEnabled) add("id_card", "ID card", config.idCardPriceMinor);
  if (program.ticketEnabled) add("ticket", "Ticket", config.ticketPriceMinor);
  return lines;
}

/**
 * The lines of an order, priced from the order form's own list. Prices always come from the server's list,
 * never from the browser, so nobody can change what they pay by editing the page.
 */
export function orderLineItems(catalogue: OrderItem[], selection: OrderSelection): LineItem[] {
  const wanted = new Map<string, number>();
  for (const pick of selection) wanted.set(pick.itemId, (wanted.get(pick.itemId) ?? 0) + pick.quantity);
  const byId = new Map(catalogue.map((item) => [item.id, item]));
  const lines: LineItem[] = [];
  for (const [itemId, quantity] of wanted) {
    const item = byId.get(itemId);
    if (!item) throw AppError.validation("One of the items you chose is no longer available. Please refresh the page and try again.");
    const limit = item.maxQuantity ?? 1000;
    if (quantity > limit) throw AppError.validation(`You can order at most ${limit} of "${item.name}".`);
    lines.push({ id: item.id, name: item.name, unitMinor: item.priceMinor, quantity, totalMinor: item.priceMinor * quantity });
  }
  if (lines.length > MAX_LINE_ITEMS) throw AppError.validation(`An order can hold at most ${MAX_LINE_ITEMS} different items.`);
  return lines;
}

/** Refuses a total that is zero, negative, not a whole number of cents, or above the allowed maximum. */
export function assertChargeable(totalMinor: number) {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw AppError.validation("There is nothing to pay.");
  if (totalMinor > MAX_PAYMENT_MINOR) throw AppError.validation("This amount is above the largest payment allowed. Please contact the organizer.");
}
