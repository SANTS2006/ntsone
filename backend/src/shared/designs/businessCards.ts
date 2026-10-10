import { circle, Ctx, fitText, icon, iconBadge, image, initials, n, path, photo, polygon, qrCode, rect, shade, svgDocument, text, tint, wrapText, type IconName } from "./svg.js";

// ---------------------------------------------------------------------------
// Business ("complimentary") cards: a front and a back, 3.5 x 2 inches (504 x 288 points).
// One drawing is used for the live preview, PDFs, images, printing, and email attachments.

export const CARD_WIDTH = 504;
export const CARD_HEIGHT = 288;
const W = CARD_WIDTH;
const H = CARD_HEIGHT;

export type CardTemplate = "split" | "gold" | "ring" | "diagonal" | "block" | "photo" | "clean" | "corner";

export interface CardTemplateInfo {
  id: CardTemplate;
  name: string;
  description: string;
  /** The colours a new card starts with (the person can change them). */
  primary: string;
  secondary: string;
  usesPhoto: boolean;
}

export const CARD_TEMPLATES: CardTemplateInfo[] = [
  { id: "split", name: "Split", description: "White with a bold curved colour panel.", primary: "#1d4ed8", secondary: "#f59e0b", usesPhoto: false },
  { id: "gold", name: "Executive", description: "Dark and gold, with a centred logo.", primary: "#c9a227", secondary: "#1c1917", usesPhoto: false },
  { id: "ring", name: "Ring", description: "Dark with a coloured ring around your logo.", primary: "#f59e0b", secondary: "#1f2937", usesPhoto: true },
  { id: "diagonal", name: "Diagonal", description: "Slanted colour stripes on white and black.", primary: "#dc2626", secondary: "#111827", usesPhoto: false },
  { id: "block", name: "Block", description: "Sharp black and grey shapes.", primary: "#6b7280", secondary: "#111111", usesPhoto: false },
  { id: "photo", name: "Portrait", description: "Navy with a photo and a QR code.", primary: "#14b8a6", secondary: "#0f1b3d", usesPhoto: true },
  { id: "clean", name: "Clean", description: "Light and airy with a colour circle.", primary: "#eab308", secondary: "#14532d", usesPhoto: true },
  { id: "corner", name: "Corner", description: "White with navy and orange corners.", primary: "#f59e0b", secondary: "#0f1b3d", usesPhoto: false },
];

export const cardTemplateInfo = (id: string) => CARD_TEMPLATES.find((t) => t.id === id);

export interface CardContent {
  name: string;
  title?: string | null;
  company: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  tagline?: string | null;
  /** A picture of the person (used by the layouts that have room for one). */
  photo?: string | null;
  logo?: string | null;
  /** A QR code of the website, as a module matrix (layouts that show one). */
  qr?: boolean[][] | null;
}

export interface CardStyle {
  template: CardTemplate;
  primaryColor: string;
  secondaryColor: string;
}

const hex = (value: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

function luma(color: string): number {
  const h = hex(color, "#000000").slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255;
}
const inkOn = (bg: string) => (luma(bg) > 0.62 ? "#111827" : "#ffffff");

type Pair = [string, string];

interface Parts {
  ctx: Ctx;
  c: CardContent;
  primary: string;
  secondary: string;
}

/** The logo image, or a monogram of the company in a circle when there is none. */
function mark(p: Parts, cx: number, cy: number, r: number, ink: string, bg: string): string {
  if (p.c.logo) {
    const clip = p.ctx.clip(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`);
    return circle(cx, cy, r, "#ffffff") + image(p.c.logo, cx - r, cy - r, r * 2, r * 2, "meet", clip);
  }
  return circle(cx, cy, r, bg) + text(cx, cy + r * 0.28, initials(p.c.company), { size: r * 0.8, fill: ink, bold: true, anchor: "middle" });
}

/** Name and job title. */
function nameBlock(p: Parts, x: number, y: number, maxWidth: number, nameInk: string, titleInk: string, size = 22): string {
  const name = fitText(p.c.name || "Your name", maxWidth, size, { bold: true, minSize: 13 });
  let out = text(x, y, name.text, { size: name.size, fill: nameInk, bold: true });
  if (p.c.title) {
    const title = fitText(p.c.title, maxWidth, 11, { minSize: 8 });
    out += text(x, y + 17, title.text, { size: title.size, fill: titleInk });
  }
  return out;
}

/** Phone, email, website and address with small icons; empty ones are skipped. */
function contactBlock(x: number, y: number, maxWidth: number, p: Parts, ink: string, badgeBg: string, badgeFg: string, gap = 22): string {
  const rows: [IconName, string][] = [];
  if (p.c.phone) rows.push(["phone", p.c.phone]);
  if (p.c.email) rows.push(["mail", p.c.email]);
  if (p.c.website) rows.push(["globe", p.c.website]);
  if (p.c.address) rows.push(["pin", p.c.address]);
  let out = "";
  let cy = y;
  for (const [name, value] of rows) {
    out += iconBadge(name, x + 8, cy - 3, 16, badgeBg, badgeFg);
    const lines = wrapText(value, maxWidth - 26, 9.5, name === "pin" ? 2 : 1);
    lines.forEach((line, i) => (out += text(x + 24, cy + i * 11, line, { size: 9.5, fill: ink })));
    cy += gap + (lines.length - 1) * 11;
  }
  return out;
}

function tagline(p: Parts, x: number, y: number, ink: string, anchor: "start" | "middle" | "end" = "middle", size = 9): string {
  return p.c.tagline ? text(x, y, fitText(p.c.tagline, 260, size, { minSize: 7 }).text, { size, fill: ink, anchor, letterSpacing: 0.6 }) : "";
}

function companyName(p: Parts, x: number, y: number, ink: string, anchor: "start" | "middle" | "end" = "middle", size = 16): string {
  const fit = fitText(p.c.company.toUpperCase(), 300, size, { bold: true, minSize: 9, letterSpacing: 1 });
  return text(x, y, fit.text, { size: fit.size, fill: ink, bold: true, anchor, letterSpacing: 1 });
}

function qr(p: Parts, x: number, y: number, size: number, fg: string, bg = "#ffffff"): string {
  return p.c.qr ? qrCode(p.c.qr, x, y, size, fg, bg, 3) : "";
}

// ---------------------------------------------------------------------------
// Layouts: each returns [front, back] markup

function split(p: Parts): Pair {
  const { primary, secondary } = p;
  const back = inkOn(primary);
  const front =
    rect(0, 0, W, H, "#ffffff") +
    path(`M${W} 0V${H}H300C250 ${H} 330 190 360 130C385 80 340 30 380 0Z`, primary) +
    path(`M${W} 0V${H}H400C380 ${H} 420 200 440 150C460 100 430 40 450 0Z`, secondary) +
    nameBlock(p, 34, 76, 250, "#111827", "#475569") +
    contactBlock(34, 138, 260, p, "#334155", primary, inkOn(primary)) +
    mark(p, 425, 78, 34, primary, "#ffffff");
  const bck =
    rect(0, 0, W, H, primary) +
    path(`M0 ${H}V190C90 220 190 150 300 190C380 218 440 190 ${W} 205V${H}Z`, secondary, 'opacity="0.9"') +
    mark(p, W / 2, 104, 46, primary, "#ffffff") +
    companyName(p, W / 2, 176, back) +
    tagline(p, W / 2, 194, back, "middle") +
    qr(p, W - 76, H - 76, 56, "#111827");
  return [front, bck];
}

function gold(p: Parts): Pair {
  const { primary, secondary } = p;
  const grad = p.ctx.linear([tint(primary, 0.25), shade(primary, 0.25)], [0, 0, 1, 1]);
  const front =
    rect(0, 0, W, H, grad) +
    mark(p, W / 2, 112, 44, primary, "#ffffff") +
    companyName(p, W / 2, 190, secondary, "middle", 18) +
    tagline(p, W / 2, 210, shade(primary, 0.55), "middle");
  const back =
    rect(0, 0, W, H, secondary) +
    path(`M${W} 0V${H}H330C300 ${H} 360 200 380 140C400 80 360 30 400 0Z`, grad) +
    nameBlock(p, 34, 70, 270, "#ffffff", tint(primary, 0.3)) +
    contactBlock(34, 128, 270, p, "#e5e7eb", primary, secondary) +
    qr(p, W - 84, H - 84, 60, "#111827") +
    mark(p, W - 66, 56, 28, primary, "#ffffff");
  return [front, back];
}

function ring(p: Parts): Pair {
  const { primary, secondary } = p;
  const ink = inkOn(secondary);
  const front =
    rect(0, 0, W, H, secondary) +
    rect(0, 0, W, 10, primary) +
    circle(110, 120, 78, primary) +
    circle(110, 120, 66, secondary) +
    (p.c.photo ? photo(p.ctx, p.c.photo, "circle", 110, 120, 58) : mark(p, 110, 120, 58, secondary, "#ffffff")) +
    nameBlock(p, 214, 100, 250, ink, primary) +
    contactBlock(214, 146, 250, p, ink, primary, inkOn(primary), 21);
  const back =
    rect(0, 0, W, H, secondary) +
    rect(0, H - 10, W, 10, primary) +
    circle(W / 2, 112, 70, primary) +
    circle(W / 2, 112, 58, secondary) +
    mark(p, W / 2, 112, 50, secondary, "#ffffff") +
    companyName(p, W / 2, 216, ink) +
    tagline(p, W / 2, 236, tint(primary, 0.2), "middle");
  return [front, back];
}

function diagonal(p: Parts): Pair {
  const { primary, secondary } = p;
  const front =
    rect(0, 0, W, H, "#ffffff") +
    polygon([[0, 0], [190, 0], [90, H], [0, H]], secondary) +
    polygon([[190, 0], [236, 0], [136, H], [90, H]], primary) +
    mark(p, 62, 62, 30, secondary, "#ffffff") +
    nameBlock(p, 256, 86, 220, "#111827", primary) +
    contactBlock(256, 146, 226, p, "#334155", secondary, "#ffffff");
  const back =
    rect(0, 0, W, H, secondary) +
    polygon([[W, 0], [W - 150, 0], [W - 250, H], [W, H]], primary) +
    mark(p, 150, 112, 52, secondary, "#ffffff") +
    companyName(p, 150, 204, inkOn(secondary)) +
    tagline(p, 150, 224, tint(primary, 0.4), "middle") +
    qr(p, W - 100, H / 2 - 38, 76, "#111827");
  return [front, back];
}

function block(p: Parts): Pair {
  const { primary, secondary } = p;
  const light = tint(primary, 0.55);
  const front =
    rect(0, 0, W, H, secondary) +
    polygon([[0, 0], [150, 0], [60, 100], [0, 100]], primary) +
    polygon([[0, H], [0, 190], [80, H]], light) +
    polygon([[W, 0], [W - 80, 0], [W, 80]], light) +
    polygon([[W, H], [W - 170, H], [W, H - 120]], primary) +
    mark(p, W / 2 + 20, 112, 44, secondary, "#ffffff") +
    companyName(p, W / 2 + 20, 186, "#ffffff") +
    tagline(p, W / 2 + 20, 204, tint(primary, 0.5), "middle");
  const back =
    rect(0, 0, W, H, secondary) +
    polygon([[W, 0], [W - 130, 0], [W, 130]], primary) +
    polygon([[0, H], [0, H - 90], [150, H]], primary) +
    nameBlock(p, 34, 76, 300, "#ffffff", light) +
    contactBlock(34, 138, 300, p, "#e5e7eb", primary, "#ffffff") +
    qr(p, W - 96, H - 96, 66, "#111111");
  return [front, back];
}

function portrait(p: Parts): Pair {
  const { primary, secondary } = p;
  const front =
    rect(0, 0, W, H, secondary) +
    path(`M${W - 150} 0H${W}V${H}H${W - 190}C${W - 150} 190 ${W - 200} 90 ${W - 150} 0Z`, primary) +
    photo(p.ctx, p.c.photo ?? null, "square", W - 92, 106, 52, { h: 70, monogram: initials(p.c.name) }) +
    mark(p, 62, 56, 22, secondary, "#ffffff") +
    companyName(p, 96, 62, "#ffffff", "start", 12) +
    nameBlock(p, 34, 130, 250, "#ffffff", tint(primary, 0.3)) +
    contactBlock(34, 176, 270, p, "#e5e7eb", primary, secondary, 21);
  const back =
    rect(0, 0, W, H, secondary) +
    rect(0, H - 10, W, 10, primary) +
    mark(p, W / 2, 100, 46, secondary, "#ffffff") +
    companyName(p, W / 2, 176, "#ffffff") +
    tagline(p, W / 2, 196, tint(primary, 0.3), "middle") +
    qr(p, W / 2 - 34, 212, 56, "#0f172a");
  return [front, back];
}

function clean(p: Parts): Pair {
  const { primary, secondary } = p;
  const front =
    rect(0, 0, W, H, "#ffffff") +
    circle(70, 70, 120, tint(primary, 0.75)) +
    circle(70, 70, 70, primary) +
    (p.c.photo ? photo(p.ctx, p.c.photo, "circle", 70, 70, 54) : mark(p, 70, 70, 54, secondary, "#ffffff")) +
    nameBlock(p, 190, 70, 280, secondary, "#475569") +
    contactBlock(190, 124, 280, p, "#334155", secondary, "#ffffff", 22) +
    companyName(p, 34, H - 26, secondary, "start", 11);
  const back =
    rect(0, 0, W, H, tint(primary, 0.88)) +
    circle(W, H, 150, tint(primary, 0.6)) +
    circle(W, H, 90, primary) +
    mark(p, W / 2 - 30, 112, 50, secondary, "#ffffff") +
    companyName(p, W / 2 - 30, 190, secondary) +
    tagline(p, W / 2 - 30, 210, "#475569", "middle") +
    qr(p, 30, H - 82, 56, "#111827");
  return [front, back];
}

function corner(p: Parts): Pair {
  const { primary, secondary } = p;
  const front =
    rect(0, 0, W, H, "#ffffff") +
    polygon([[W, 0], [W - 170, 0], [W, 120]], secondary) +
    polygon([[W, 0], [W - 90, 0], [W, 64]], primary) +
    polygon([[0, H], [0, H - 70], [170, H]], secondary) +
    polygon([[0, H], [0, H - 34], [80, H]], primary) +
    mark(p, 70, 64, 30, secondary, "#ffffff") +
    nameBlock(p, 120, 60, 240, secondary, "#475569") +
    contactBlock(34, 124, 280, p, "#334155", primary, "#ffffff") +
    qr(p, W - 78, H - 78, 56, "#111827");
  const back =
    rect(0, 0, W, H, secondary) +
    polygon([[0, 0], [150, 0], [0, 120]], primary) +
    polygon([[W, H], [W - 150, H], [W, H - 120]], primary) +
    mark(p, W / 2, 110, 46, secondary, "#ffffff") +
    companyName(p, W / 2, 188, "#ffffff") +
    tagline(p, W / 2, 208, tint(primary, 0.5), "middle");
  return [front, back];
}

const LAYOUTS: Record<CardTemplate, (p: Parts) => Pair> = { split, gold, ring, diagonal, block, photo: portrait, clean, corner };

/** The front and back of a card, as two SVG pages of 504 x 288. */
export function renderBusinessCard(content: CardContent, style: CardStyle): [string, string] {
  const info = cardTemplateInfo(style.template) ?? CARD_TEMPLATES[0]!;
  const render = (side: 0 | 1) => {
    const ctx = new Ctx();
    const parts: Parts = { ctx, c: content, primary: hex(style.primaryColor, info.primary), secondary: hex(style.secondaryColor, info.secondary) };
    return svgDocument(W, H, ctx, LAYOUTS[info.id](parts)[side]);
  };
  // Each side is drawn separately so its own gradients and clips stay in its own document.
  return [render(0), render(1)];
}
