import {
  barcode,
  bullets,
  circle,
  Ctx,
  fitted,
  iconBadge,
  image,
  initials,
  logo,
  path,
  photo,
  polygon,
  qrCode,
  rect,
  rows,
  shade,
  signature,
  svgDocument,
  text,
  tint,
  twoToneName,
  wrapText,
  mix,
  type IconName,
  type LogoContent,
  type PhotoShape,
  type Row,
} from "./svg.js";

/** Portrait CR-80 card in design units (the PDF scales it to 2.125in x 3.375in). */
export const ID_CARD_WIDTH = 300;
export const ID_CARD_HEIGHT = 476;
export const W = ID_CARD_WIDTH;
export const H = ID_CARD_HEIGHT;

export interface IdCardContent {
  logo: LogoContent;
  name: string;
  /** The line under the name; empty hides it. */
  role: string;
  /** Empty hides the registration number everywhere on the card. */
  registrationNumber: string;
  /** Extra label/value pairs chosen from the registration form. */
  fields: Row[];
  issued?: string;
  validUntil?: string;
  /** Image href (data URI or URL); null draws a placeholder silhouette. */
  photo: string | null;
  /** The card is set up without photos: the frame shows the person's initials instead. */
  hidePhoto?: boolean;
  qr: boolean[][] | null;
  barcode: string | null;
  terms: string[];
  contact: { phone?: string; email?: string; website?: string; address?: string };
  signatureLabel: string;
  /** An uploaded design used by the "custom" template. */
  background?: string | null;
}

export interface DesignColors {
  primary: string;
  secondary: string;
}

export interface IdCardDesign {
  id: string;
  name: string;
  defaults: DesignColors;
  front: (c: IdCardContent, k: DesignColors, ctx: Ctx) => string;
  back: (c: IdCardContent, k: DesignColors, ctx: Ctx) => string;
}

export const INK = "#1f2937";
export const MUTED = "#4b5563";

export function idRows(c: IdCardContent, extra: Row[] = []): Row[] {
  const id = c.registrationNumber ? [{ label: "ID", value: c.registrationNumber }] : [];
  return [...id, ...c.fields, ...extra];
}

/** The participant photo frame, respecting the card's photo setting. */
export function pic(
  ctx: Ctx,
  c: IdCardContent,
  shape: PhotoShape,
  cx: number,
  cy: number,
  r: number,
  opts: { border?: string; borderWidth?: number; h?: number } = {},
) {
  return photo(ctx, c.hidePhoto ? null : c.photo, shape, cx, cy, r, {
    ...opts,
    monogram: c.hidePhoto ? initials(c.name) : undefined,
  });
}

export function dateRows(c: IdCardContent): Row[] {
  const out: Row[] = [];
  if (c.issued) out.push({ label: "Issued", value: c.issued });
  if (c.validUntil) out.push({ label: "Valid until", value: c.validUntil });
  return out;
}

export function contactList(c: IdCardContent): { icon: IconName; value: string }[] {
  const list: { icon: IconName; value: string }[] = [];
  if (c.contact.phone) list.push({ icon: "phone", value: c.contact.phone });
  if (c.contact.email) list.push({ icon: "mail", value: c.contact.email });
  if (c.contact.website) list.push({ icon: "globe", value: c.contact.website });
  if (c.contact.address) list.push({ icon: "pin", value: c.contact.address });
  return list;
}

export function contactRows(c: IdCardContent, x: number, y: number, width: number, badge: string, textColor: string, maxY = H) {
  let out = "";
  let cy = y;
  for (const item of contactList(c)) {
    if (cy > maxY) break;
    out += iconBadge(item.icon, x + 8, cy - 3.5, 16, badge, "#ffffff");
    out += fitted(x + 24, cy, item.value, width - 24, { size: 9.5, fill: textColor, minSize: 7.5 });
    cy += 21;
  }
  return { svg: out, y: cy };
}

export function qrOrNothing(c: IdCardContent, x: number, y: number, size: number, fg = "#111827") {
  return c.qr ? qrCode(c.qr, x, y, size, fg, "#ffffff", 3) : "";
}

