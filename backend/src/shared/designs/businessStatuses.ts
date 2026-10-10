// Each business can rename its order, invoice, and receipt statuses, hide ones it doesn't use, and
// add its own. These are the statuses a business starts with, and the helpers that resolve what it
// has chosen. Shared by the server (to check a status is allowed) and the browser (to show them).

export type StatusKind = "order" | "invoice" | "receipt" | "quotation";
export type StatusColor = "gray" | "blue" | "green" | "amber" | "red";

export interface StatusDef {
  /** Stored on the order or document: lowercase letters, numbers, and underscores. */
  key: string;
  /** What people see. */
  label: string;
  color: StatusColor;
}

export type StatusConfig = Partial<Record<StatusKind, StatusDef[]>>;

export const STATUS_COLORS: readonly StatusColor[] = ["gray", "blue", "green", "amber", "red"];

export const DEFAULT_STATUSES: Record<StatusKind, StatusDef[]> = {
  order: [
    { key: "submitted", label: "New", color: "blue" },
    { key: "confirmed", label: "Confirmed", color: "blue" },
    { key: "processing", label: "Processing", color: "amber" },
    { key: "ready", label: "Ready", color: "green" },
    { key: "delivered", label: "Delivered", color: "green" },
    { key: "completed", label: "Completed", color: "green" },
    { key: "cancelled", label: "Cancelled", color: "red" },
    { key: "rejected", label: "Declined", color: "red" },
  ],
  invoice: [
    { key: "draft", label: "Draft", color: "gray" },
    { key: "sent", label: "Sent", color: "blue" },
    { key: "partially_paid", label: "Partly paid", color: "amber" },
    { key: "paid", label: "Paid", color: "green" },
    { key: "cancelled", label: "Cancelled", color: "red" },
  ],
  receipt: [
    { key: "issued", label: "Issued", color: "gray" },
    { key: "sent", label: "Sent", color: "blue" },
    { key: "void", label: "Void", color: "red" },
  ],
  quotation: [
    { key: "draft", label: "Draft", color: "gray" },
    { key: "sent", label: "Sent", color: "blue" },
    { key: "accepted", label: "Accepted", color: "green" },
    { key: "declined", label: "Declined", color: "red" },
    { key: "expired", label: "Expired", color: "amber" },
  ],
};

const isColor = (value: unknown): value is StatusColor => STATUS_COLORS.includes(value as StatusColor);

/** The statuses a business uses for orders, invoices, or receipts: its own list, or the defaults. */
export function resolveStatuses(config: unknown, kind: StatusKind): StatusDef[] {
  const list = (config as StatusConfig | null | undefined)?.[kind];
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_STATUSES[kind];
  const seen = new Set<string>();
  const cleaned: StatusDef[] = [];
  for (const item of list) {
    if (!item || typeof item.key !== "string" || typeof item.label !== "string" || seen.has(item.key)) continue;
    seen.add(item.key);
    cleaned.push({ key: item.key, label: item.label, color: isColor(item.color) ? item.color : "gray" });
  }
  return cleaned.length ? cleaned : DEFAULT_STATUSES[kind];
}

/** All three lists, resolved. */
export function resolveAllStatuses(config: unknown): Record<StatusKind, StatusDef[]> {
  return {
    order: resolveStatuses(config, "order"),
    invoice: resolveStatuses(config, "invoice"),
    receipt: resolveStatuses(config, "receipt"),
    quotation: resolveStatuses(config, "quotation"),
  };
}

const humanize = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** The label to show for a stored status key, even if the business has since removed it. */
export function statusLabelFor(defs: StatusDef[], key: string): string {
  return defs.find((d) => d.key === key)?.label ?? DEFAULT_STATUSES.order.find((d) => d.key === key)?.label ?? humanize(key);
}

/** A storable key from a label, e.g. "Out for delivery" -> "out_for_delivery". */
export function statusKeyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}
