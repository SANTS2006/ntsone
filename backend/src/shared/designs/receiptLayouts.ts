import { code128 } from "./barcode.js";
import {
  computeTotals,
  formatDocDate,
  formatMoney,
  lineAmount,
  type DocumentBusiness,
  type DocumentContent,
  type DocumentSettings,
} from "./businessDocs.js";
import { barcode, Ctx, circle, fitText, image, n, path, polygon, rect, shade, svgDocument, text, textWidth, tint, wrapText } from "./svg.js";

// ---------------------------------------------------------------------------
// Receipt layouts that aren't a full A4 page: the landscape cash-book receipt (a filled-in receipt
// book page) and the narrow till slip. Same drawing code is used by previews, PDFs, and images.

const INK = "#0f172a";
const MUTED = "#64748b";

export type CashVariant = "cashbook" | "cashbook-wave" | "cashbook-stripe";
export type SlipVariant = "slip" | "slip-bold";

export const CASH_WIDTH = 612;
export const CASH_HEIGHT = 336;
export const SLIP_WIDTH = 300;

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function below1000(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) {
    const spoken = rest < 20 ? ONES[rest]! : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
    parts.push(hundreds ? `and ${spoken}` : spoken);
  }
  return parts.join(" ");
}

const CURRENCY_NAMES: Record<string, string> = {
  SLE: "Leones",
  SLL: "Leones",
  USD: "US dollars",
  GBP: "pounds sterling",
  EUR: "euros",
  NGN: "naira",
  GHS: "cedis",
  KES: "Kenyan shillings",
  UGX: "Ugandan shillings",
  ZAR: "rand",
  LRD: "Liberian dollars",
  GMD: "dalasi",
};

/** 2450.5 -> "Two thousand four hundred and fifty Leones and 50/100 only". */
export function amountInWords(amount: number, currency: string): string {
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const scales: [number, string][] = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  let remaining = whole;
  const words: string[] = [];
  for (const [size, name] of scales) {
    if (remaining >= size) {
      words.push(`${below1000(Math.floor(remaining / size))} ${name}`);
      remaining %= size;
    }
  }
  if (remaining > 0 || words.length === 0) {
    const tail = below1000(remaining) || "zero";
    words.push(words.length && remaining < 100 && remaining > 0 ? `and ${tail}` : tail);
  }
  const spoken = words.join(" ").replace(/^./, (c) => c.toUpperCase());
  const name = CURRENCY_NAMES[currency] ?? currency;
  return `${spoken} ${name}${cents ? ` and ${String(cents).padStart(2, "0")}/100` : ""} only`;
}

const dotted = (x1: number, x2: number, y: number, color = "#94a3b8") =>
  `<line x1="${n(x1)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y)}" stroke="${color}" stroke-width="0.8" stroke-dasharray="1.6 2.6"/>`;

const businessDetails = (business: DocumentBusiness, settings: DocumentSettings) =>
  settings.showBusinessDetails
    ? [business.address, [business.phone, business.email].filter(Boolean).join("  ·  "), business.website, business.taxNumber ? `Tax no. ${business.taxNumber}` : ""].filter((d): d is string => !!d)
    : [];

/** The amount this receipt is for: what was paid, or the whole total when nothing is recorded yet. */
function receiptAmount(content: DocumentContent) {
  const totals = computeTotals(content.items, content.discount, content.taxRate, content.amountPaid);
  const paid = totals.amountPaid > 0 ? totals.amountPaid : totals.total;
  return { totals, paid };
}

function itemSummary(content: DocumentContent): string {
  const names = content.items.map((i) => i.description.trim()).filter(Boolean);
  if (names.length <= 3) return names.join("; ");
  return `${names.slice(0, 2).join("; ")}; +${names.length - 2} more items`;
}

// ---------------------------------------------------------------------------
// Landscape cash receipt

export function renderCashReceipt(content: DocumentContent, business: DocumentBusiness, settings: DocumentSettings, variant: CashVariant): string {
  const W = CASH_WIDTH;
  const H = CASH_HEIGHT;
  const accent = settings.accentColor;
  const dark = shade(accent, 0.72);
  const ctx = new Ctx();
  const { totals, paid } = receiptAmount(content);
  const money = (v: number) => formatMoney(v, content.currency);
  const left = variant === "cashbook-stripe" ? 44 : variant === "cashbook-wave" ? 52 : 34;
  const right = W - 34;
  let svg = rect(0, 0, W, H, "#ffffff");

  // Decoration
  if (variant === "cashbook") {
    svg += rect(0, 0, W, 8, accent);
    svg += polygon([[0, H], [0, H - 30], [250, H - 30], [292, H]], dark);
    svg += polygon([[310, H], [346, H - 30], [W, H - 30], [W, H]], accent);
  } else if (variant === "cashbook-wave") {
    svg += path(`M0 0H26C34 90 18 180 30 ${H}H0Z`, accent);
    svg += path(`M26 0H38C46 90 30 180 42 ${H}H30C18 180 34 90 26 0Z`, tint(accent, 0.55));
    svg += path(`M${W} ${H}V${H - 70}C${W - 60} ${H - 62} ${W - 110} ${H - 30} ${W - 130} ${H}Z`, accent);
    svg += path(`M${W} ${H}V${H - 38}C${W - 36} ${H - 34} ${W - 62} ${H - 16} ${W - 74} ${H}Z`, tint(accent, 0.5));
  } else {
    svg += rect(0, 0, 18, H, accent);
    svg += rect(18, 0, 3, H, dark);
    svg += rect(30, 0, 1, H, "#cbd5e1", `stroke-dasharray="2 3"`);
    svg += rect(0, H - 8, W, 8, dark);
  }

  // Header: logo and business on the left, title and number on the right
  let hx = left;
  if (settings.showLogo && business.logo) {
    const clip = ctx.clip(`<rect x="${left}" y="22" width="52" height="52" rx="8"/>`);
    svg += image(business.logo, left, 22, 52, 52, "meet", clip);
    hx = left + 62;
  }
  const nameFit = fitText(business.name, 270 - (hx - left), 15, { bold: true, minSize: 10 });
  svg += text(hx, 40, nameFit.text, { size: nameFit.size, fill: INK, bold: true });
  let dy = 53;
  for (const line of businessDetails(business, settings).flatMap((d) => wrapText(d, 270 - (hx - left), 7.5, 2)).slice(0, 4)) {
    svg += text(hx, dy, line, { size: 7.5, fill: MUTED });
    dy += 10;
  }

  const title = settings.title || "RECEIPT";
  if (variant === "cashbook") {
    const w = textWidth(title, 11, true, 1.2) + 28;
    svg += rect(right - w, 22, w, 24, accent, `rx="12"`);
    svg += text(right - w / 2, 38.5, title, { size: 11, fill: "#ffffff", bold: true, anchor: "middle", letterSpacing: 1.2 });
  } else {
    svg += text(right, 40, title, { size: variant === "cashbook-stripe" ? 22 : 20, fill: variant === "cashbook-stripe" ? accent : INK, bold: true, anchor: "end", letterSpacing: 1.5 });
  }
  svg += text(right - 120, 64, "No.", { size: 9, fill: MUTED, anchor: "end" });
  svg += text(right, 64, content.number, { size: 11, fill: accent, bold: true, anchor: "end" });
  svg += text(right - 120, 80, "Date", { size: 9, fill: MUTED, anchor: "end" });
  svg += text(right, 80, formatDocDate(content.issueDate), { size: 9.5, fill: INK, bold: true, anchor: "end" });
  if (content.updatedOn) {
    svg += text(right, 94, `UPDATED ${formatDocDate(content.updatedOn).toUpperCase()}`, { size: 7, fill: "#92400e", bold: true, anchor: "end", letterSpacing: 0.6 });
  }

  // The form, filled in
  const field = (y: number, label: string, value: string, from: number, to: number, bold = true) => {
    const labelWidth = textWidth(label, 9) + 8;
    let out = text(from, y, label, { size: 9, fill: INK });
    out += dotted(from + labelWidth, to, y + 2);
    if (value) {
      const fit = fitText(value, to - from - labelWidth - 6, 10.5, { bold, minSize: 7.5 });
      out += text(from + labelWidth + 4, y - 1, fit.text, { size: fit.size, fill: INK, bold });
    }
    return out;
  };
  const mid = left + (right - left) * 0.58;
  let y = 116;
  svg += field(y, "Received with thanks from", content.client.name, left, right);
  y += 26;
  svg += field(y, "Amount", money(paid), left, mid - 14);
  svg += field(y, "Payment method", content.paymentMethod ?? "", mid, right, false);
  y += 26;
  const words = wrapText(amountInWords(paid, content.currency), right - left - 74, 10, 2, true);
  svg += text(left, y, "In words", { size: 9, fill: INK });
  svg += dotted(left + 52, right, y + 2);
  words.forEach((line, i) => {
    if (i > 0) svg += dotted(left, right, y + 2 + i * 15);
    svg += text(left + 58, y - 1 + i * 15, line, { size: 10, fill: INK, bold: true });
  });
  y += 26 + (words.length - 1) * 15;
  svg += field(y, "For", itemSummary(content), left, right, false);
  y += 26;
  if (variant === "cashbook-stripe") {
    const methods = ["Cash", "Cheque", "Mobile money", "Bank"];
    let mx = left;
    const chosen = (content.paymentMethod ?? "").toLowerCase();
    for (const method of methods) {
      const on = chosen.includes(method.toLowerCase().split(" ")[0]!);
      svg += rect(mx, y - 8, 9, 9, "#ffffff", `stroke="${INK}" stroke-width="0.9"`);
      if (on) svg += text(mx + 4.5, y, "✓", { size: 8, fill: accent, bold: true, anchor: "middle" });
      svg += text(mx + 14, y, method, { size: 8.5, fill: INK });
      mx += textWidth(method, 8.5) + 36;
    }
  }
  if (totals.balance > 0.004) {
    svg += text(right, y, `Balance outstanding: ${money(totals.balance)}`, { size: 9, fill: "#b45309", bold: true, anchor: "end" });
  } else if (content.status === "void") {
    svg += text(right, y, "VOID", { size: 12, fill: "#dc2626", bold: true, anchor: "end", letterSpacing: 2 });
  }

  // Signatures
  const sy = H - 44;
  svg += dotted(left, left + 150, sy);
  svg += text(left, sy + 12, "Received by", { size: 8, fill: MUTED });
  if (settings.signatureLabel) {
    const sigRight = variant === "cashbook-wave" ? right - 120 : right;
    svg += dotted(sigRight - 170, sigRight, sy);
    svg += text(sigRight - 85, sy + 12, settings.signatureLabel, { size: 8, fill: MUTED, anchor: "middle" });
  }
  if (settings.footer) {
    const fit = fitText(settings.footer, 260, 7.5, { minSize: 6 });
    svg += text(W / 2, H - 12, fit.text, { size: fit.size, fill: variant === "cashbook-wave" || variant === "cashbook" ? MUTED : MUTED, anchor: "middle" });
  }
  return svgDocument(W, H, ctx, svg);
}

// ---------------------------------------------------------------------------
// Till slip

interface SlipLayout {
  svg: string;
  height: number;
}

function layoutSlip(content: DocumentContent, business: DocumentBusiness, settings: DocumentSettings, variant: SlipVariant): SlipLayout {
  const W = SLIP_WIDTH;
  const bold = variant === "slip-bold";
  const accent = settings.accentColor;
  const paper = bold ? "#ffffff" : "#fbf7ee";
  const ink = bold ? INK : "#1f2937";
  const ctx = new Ctx();
  const { totals, paid } = receiptAmount(content);
  const money = (v: number) => formatMoney(v, content.currency);
  const M = 22;
  let body = "";
  let y = 0;

  if (bold) {
    // A coloured header block with the name in white.
    const lines = wrapText(business.name, W - 2 * M, 17, 2, true);
    const blockHeight = 36 + lines.length * 22 + (settings.showLogo && business.logo ? 56 : 0);
    body += rect(0, 0, W, blockHeight, accent);
    y = 28;
    if (settings.showLogo && business.logo) {
      const clip = ctx.clip(`<circle cx="${W / 2}" cy="${y + 24}" r="24"/>`);
      body += circle(W / 2, y + 24, 25, "#ffffff");
      body += image(business.logo, W / 2 - 24, y, 48, 48, "meet", clip);
      y += 62;
    }
    for (const line of lines) {
      body += text(W / 2, y, line, { size: 17, fill: "#ffffff", bold: true, anchor: "middle" });
      y += 22;
    }
    y = blockHeight + 18;
  } else {
    y = 30;
    if (settings.showLogo && business.logo) {
      const clip = ctx.clip(`<rect x="${W / 2 - 24}" y="${y - 8}" width="48" height="48" rx="6"/>`);
      body += image(business.logo, W / 2 - 24, y - 8, 48, 48, "meet", clip);
      y += 54;
    }
    for (const line of wrapText(business.name.toUpperCase(), W - 2 * M, 14, 2, true)) {
      body += text(W / 2, y, line, { size: 14, fill: ink, bold: true, anchor: "middle", letterSpacing: 1 });
      y += 18;
    }
  }
  for (const line of businessDetails(business, settings).flatMap((d) => wrapText(d, W - 2 * M, 7.5, 2))) {
    body += text(W / 2, y, line, { size: 7.5, fill: bold ? MUTED : "#4b5563", anchor: "middle" });
    y += 10.5;
  }
  y += 6;

  const rule = (style: "dash" | "solid" = "dash") => {
    body += `<line x1="${M}" y1="${n(y)}" x2="${W - M}" y2="${n(y)}" stroke="${bold ? "#cbd5e1" : "#6b7280"}" stroke-width="${style === "solid" ? 1.4 : 0.9}"${style === "dash" ? ` stroke-dasharray="3 3"` : ""}/>`;
    y += 14;
  };
  const pair = (label: string, value: string, o: { strong?: boolean; size?: number; fill?: string } = {}) => {
    const size = o.size ?? 8.5;
    body += text(M, y, label, { size, fill: o.fill ?? (o.strong ? ink : MUTED), bold: o.strong });
    body += text(W - M, y, value, { size, fill: o.fill ?? ink, bold: o.strong, anchor: "end" });
    y += size + 6;
  };

  rule();
  body += text(W / 2, y + 2, settings.title || "RECEIPT", { size: bold ? 15 : 13, fill: bold ? accent : ink, bold: true, anchor: "middle", letterSpacing: 2.5 });
  y += 22;
  pair("No.", content.number, { strong: true });
  pair("Date", formatDocDate(content.issueDate));
  if (content.client.name) pair("Customer", fitText(content.client.name, 170, 8.5, { minSize: 7 }).text);
  for (const field of content.customFields.filter((f) => f.value)) pair(field.label, fitText(field.value, 150, 8.5, { minSize: 7 }).text);
  if (content.updatedOn) pair("Updated", formatDocDate(content.updatedOn), { fill: "#92400e" });
  y += 2;
  rule();

  for (const item of content.items) {
    const lines = wrapText(item.description || "-", W - 2 * M, 8.5, 3, true);
    for (const line of lines) {
      body += text(M, y, line, { size: 8.5, fill: ink, bold: true });
      y += 11.5;
    }
    const qty = Number(item.quantity) || 0;
    body += text(M, y, `${Number.isInteger(qty) ? qty : qty.toFixed(2)} x ${money(Number(item.unitPrice) || 0)}`, { size: 8, fill: MUTED });
    body += text(W - M, y, money(lineAmount(item)), { size: 8.5, fill: ink, bold: true, anchor: "end" });
    y += 15;
  }
  rule();

  pair("Subtotal", money(totals.subtotal));
  if (totals.discount) pair("Discount", `- ${money(totals.discount)}`);
  if (content.taxRate) pair(`${settings.taxLabel} (${content.taxRate}%)`, money(totals.taxAmount));
  y += 2;
  body += text(M, y + 4, "TOTAL", { size: 12, fill: ink, bold: true, letterSpacing: 1 });
  body += text(W - M, y + 4, money(totals.total), { size: 12, fill: bold ? accent : ink, bold: true, anchor: "end" });
  y += 24;
  pair("Paid", money(paid), { strong: true });
  if (totals.balance > 0.004) pair("Balance", money(totals.balance), { strong: true, fill: "#b45309" });
  if (content.paymentMethod) pair("Payment", fitText(content.paymentMethod, 150, 8.5, { minSize: 7 }).text);
  y += 2;
  rule();

  const note = content.notes?.trim() || "";
  if (note) {
    for (const line of wrapText(note, W - 2 * M, 8, 4)) {
      body += text(W / 2, y, line, { size: 8, fill: MUTED, anchor: "middle" });
      y += 11;
    }
    y += 4;
  }
  body += text(W / 2, y + 6, "Thank you!", { size: bold ? 20 : 17, fill: bold ? accent : ink, bold: true, italic: true, anchor: "middle" });
  y += 30;

  if (content.status === "void") {
    body += `<g transform="rotate(-14 ${W / 2} ${n(y - 60)})" opacity="0.85">${rect(W / 2 - 50, y - 84, 100, 34, "none", `rx="6" stroke="#dc2626" stroke-width="3"`)}${text(W / 2, y - 60, "VOID", { size: 20, fill: "#dc2626", bold: true, anchor: "middle", letterSpacing: 3 })}</g>`;
  } else if (bold) {
    body += `<g transform="rotate(-12 ${W / 2} ${n(y - 6)})" opacity="0.8">${rect(W / 2 - 46, y - 24, 92, 34, "none", `rx="6" stroke="#16a34a" stroke-width="3"`)}${text(W / 2, y + 0, "PAID", { size: 20, fill: "#16a34a", bold: true, anchor: "middle", letterSpacing: 3 })}</g>`;
    y += 40;
  }

  const bits = code128(content.number);
  const barWidth = Math.min(210, bits.length * 1.6);
  body += barcode(bits, (W - barWidth) / 2, y, barWidth, 40, ink);
  y += 54;
  body += text(W / 2, y, content.number, { size: 8, fill: MUTED, anchor: "middle", letterSpacing: 1.5 });
  y += 14;
  if (settings.footer) {
    const fit = fitText(settings.footer, W - 2 * M, 7, { minSize: 6 });
    body += text(W / 2, y, fit.text, { size: fit.size, fill: MUTED, anchor: "middle" });
    y += 12;
  }
  y += 18;

  // The paper, with a torn zig-zag along the bottom, drawn behind everything once the height is known.
  const height = Math.ceil(y);
  let backdrop = rect(0, 0, W, height, "#ffffff");
  if (!bold) {
    const edge: [number, number][] = [[0, 0], [W, 0], [W, height - 8]];
    for (let x = W; x > 0; x -= 10) edge.push([Math.max(x - 5, 0), height], [Math.max(x - 10, 0), height - 8]);
    backdrop = rect(0, 0, W, height, "#e5e7eb") + polygon(edge, paper);
  }
  return { svg: svgDocument(W, height, ctx, backdrop + body), height };
}

export function renderSlip(content: DocumentContent, business: DocumentBusiness, settings: DocumentSettings, variant: SlipVariant): string {
  return layoutSlip(content, business, settings, variant).svg;
}

/** The height a slip needs for its content (the width is fixed), for sizing the PDF page. */
export function slipHeight(content: DocumentContent, business: DocumentBusiness, settings: DocumentSettings, variant: SlipVariant): number {
  return layoutSlip(content, business, settings, variant).height;
}
