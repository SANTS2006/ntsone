import { feeIsAccepted } from "./fees.js";
import { AppError } from "../../lib/errors.js";
import {
  assertChargeable,
  orderLineItems,
  programLineItems,
  resolveOrderItems,
  resolvePaymentConfig,
  sumLines,
  type LineItem,
  type OrderSelection,
} from "./pricing.js";

export interface ChargePlan {
  purpose: "registration" | "order";
  lines: LineItem[];
  totalMinor: number;
  /** True when this has to be paid (payments are switched on for the program); false for an order form that only lists prices. */
  charge: boolean;
}

/**
 * Works out what a registration or order costs, on the server, from the program's own prices. Returns null when there
 * is nothing to pay or choose. For an order form with items, the order must hold at least one item.
 */
export function chargePlanFor(
  program: { kind: string; idCardEnabled: boolean; ticketEnabled: boolean; paymentConfig: unknown },
  form: { orderItems: unknown },
  selection: OrderSelection | undefined,
  options: { documentsInPerson?: boolean } = {},
): ChargePlan | null {
  const config = resolvePaymentConfig(program.paymentConfig);
  // Payments are on only for an admin who has agreed to the platform's fee; otherwise nothing can be charged.
  if (config.enabled && !feeIsAccepted(config.feeAccepted)) {
    throw AppError.paymentUnavailable("Payments for this form are paused until its admin agrees to the platform fee. Please try again later.");
  }

  if (program.kind === "order_form") {
    const catalogue = resolveOrderItems(form.orderItems);
    if (catalogue.length === 0) return null;
    const lines = orderLineItems(catalogue, selection ?? []);
    if (lines.length === 0) throw AppError.validation("Choose at least one item to order.");
    const totalMinor = sumLines(lines);
    if (config.enabled) assertChargeable(totalMinor);
    return { purpose: "order", lines, totalMinor, charge: config.enabled };
  }

  if (!config.enabled) return null;
  // Someone who will buy their ID card or ticket at the program pays only the rest (the registration fee, if any) online.
  const lines = programLineItems(program, config, { withoutDocuments: options.documentsInPerson });
  if (lines.length === 0) return null;
  const totalMinor = sumLines(lines);
  assertChargeable(totalMinor);
  return { purpose: "registration", lines, totalMinor, charge: true };
}
