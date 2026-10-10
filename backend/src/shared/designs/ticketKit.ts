import { circle, fitted, iconBadge, path, text, type Ctx, type IconName, type LogoContent, type Row } from "./svg.js";

/** Landscape event ticket in design units (the PDF scales it to 7.5in x 2.5in). */
export const TICKET_WIDTH = 720;
export const TICKET_HEIGHT = 240;
export const W = TICKET_WIDTH;
export const H = TICKET_HEIGHT;
export const INK = "#1f2937";

export interface DesignColors {
  primary: string;
  secondary: string;
}

export interface TicketContent {
  logo: LogoContent;
  /** Small line above the title (the organization by default). */
  kicker: string;
  title: string;
  subtitle: string;
  date?: string;
  time?: string;
  venue?: string;
  /** "FREE" or an amount in Leones, e.g. "Le 150"; missing hides the price. */
  price?: string;
  /** Empty hides the registrant's name. */
  participantName: string;
  /** Empty hides the registration number. */
  registrationNumber: string;
  fields: Row[];
  phone?: string;
  website?: string;
  terms?: string;
  qr: boolean[][] | null;
  barcode: string | null;
  background?: string | null;
  /** An event photo or flyer for designs with a picture panel; they draw artwork without one. */
  image?: string | null;
  /** Only for the "custom" template: text color over the uploaded design. */
  textColor?: "light" | "dark";
  overlayOpacity?: number;
}

export interface TicketDesign {
  id: string;
  name: string;
  defaults: DesignColors;
  /** The codes the design prints: designs drawn with a barcode keep it; the rest carry a QR code. */
  codes: "qr" | "barcode" | "both";
  render: (c: TicketContent, k: DesignColors, ctx: Ctx) => string;
  /** Two-sided tickets also draw a back; they download as a two-page PDF. */
  back?: (c: TicketContent, k: DesignColors, ctx: Ctx) => string;
}

export function detailLines(c: TicketContent): { icon: IconName; value: string; strong: boolean }[] {
  const out: { icon: IconName; value: string; strong: boolean }[] = [];
  if (c.date) out.push({ icon: "calendar", value: c.date, strong: true });
  if (c.time) out.push({ icon: "clock", value: c.time, strong: true });
  if (c.venue) out.push({ icon: "pin", value: c.venue, strong: false });
  return out;
}

/** Date, time, and venue with small icon badges, one per line. */
export function detailRows(
  c: TicketContent,
  x: number,
  y: number,
  {
    step = 20,
    size = 11,
    badge,
    glyph = "#ffffff",
    textColor = INK,
    maxWidth = 220,
    round = true,
  }: { step?: number; size?: number; badge: string; glyph?: string; textColor?: string; maxWidth?: number; round?: boolean },
) {
  return detailLines(c)
    .map((d, i) => {
      const cy = y + i * step;
      return (
        iconBadge(d.icon, x + size * 0.65, cy - size * 0.35, size * 1.3, badge, glyph, round) +
        fitted(x + size * 1.6, cy, d.value, maxWidth, { size: d.strong ? size : size * 0.88, fill: textColor, bold: d.strong, minSize: size * 0.65 })
      );
    })
    .join("");
}

export function perforation(x: number, color: string, notch: string) {
  return (
    path(`M${x} 10V${H - 10}`, "none", `stroke="${color}" stroke-width="1.4" stroke-dasharray="5 5"`) +
    circle(x, 0, 10, notch) +
    circle(x, H, 10, notch)
  );
}

/** "ISSUED TO" above the registrant's name, or nothing when names are hidden. */
export function issuedTo(
  x: number,
  y: number,
  c: TicketContent,
  maxWidth: number,
  {
    labelColor,
    nameColor,
    size = 13,
    anchor = "start",
    label = "ISSUED TO",
  }: { labelColor: string; nameColor: string; size?: number; anchor?: "start" | "middle" | "end"; label?: string },
) {
  if (!c.participantName) return "";
  return (
    text(x, y, label, { size: Math.max(6.5, size * 0.55), fill: labelColor, letterSpacing: 1.3, anchor }) +
    fitted(x, y + size * 1.35, c.participantName, maxWidth, { size, fill: nameColor, bold: true, minSize: size * 0.6, anchor })
  );
}

/** A caption and the price, e.g. "TICKET PRICE / Le 150", or nothing when the price is hidden. */
export function priceTag(
  x: number,
  y: number,
  c: TicketContent,
  maxWidth: number,
  {
    labelColor,
    valueColor,
    size = 22,
    anchor = "start",
    label = "TICKET PRICE",
  }: { labelColor: string; valueColor: string; size?: number; anchor?: "start" | "middle" | "end"; label?: string },
) {
  if (!c.price) return "";
  return (
    text(x, y, label, { size: Math.max(6.5, size * 0.33), fill: labelColor, letterSpacing: 1.2, anchor, bold: true }) +
    fitted(x, y + size * 1.05, c.price, maxWidth, { size, fill: valueColor, bold: true, minSize: size * 0.5, anchor })
  );
}

/** "No. REG-2026-000123", or empty when the number is hidden. */
export function numberText(c: TicketContent, prefix = "No. ") {
  return c.registrationNumber ? `${prefix}${c.registrationNumber}` : "";
}
