import { renderCashReceipt, renderSlip, slipHeight, CASH_HEIGHT, CASH_WIDTH, SLIP_WIDTH, type CashVariant, type SlipVariant } from "./receiptLayouts.js";
import { circle, Ctx, esc, fitText, image, n, path, polygon, rect, shade, svgDocument, text, textWidth, tint, wrapText } from "./svg.js";

// ---------------------------------------------------------------------------
// Invoices and receipts, drawn as A4 pages (595 x 842 points). The same drawing is used for
// the live preview in the browser, image downloads, PDFs, and email attachments.

export const DOC_PAGE_WIDTH = 595;
export const DOC_PAGE_HEIGHT = 842;
const W = DOC_PAGE_WIDTH;
const H = DOC_PAGE_HEIGHT;
const M = 40;
const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";

export type BusinessDocumentKind = "invoice" | "receipt" | "quotation";
export type DocumentTemplate =
  | "classic"
  | "modern"
  | "minimal"
  | "wave"
  | "corner"
  | "bold"
  | "soft"
  | "stripe"
  | "diagonal"
  | "cashbook"
  | "cashbook-wave"
  | "cashbook-stripe"
  | "slip"
  | "slip-bold";

export type TemplateLayout = "a4" | "cash" | "slip";

export interface DocumentTemplateInfo {
  id: DocumentTemplate;
  name: string;
  description: string;
  layout: TemplateLayout;
  /** Which documents it suits. */
  kinds: BusinessDocumentKind[];
}

const ALL_KINDS: BusinessDocumentKind[] = ["invoice", "receipt", "quotation"];

/** Every layout a business can choose from. */
export const DOCUMENT_TEMPLATES: DocumentTemplateInfo[] = [
  { id: "classic", name: "Classic", description: "A clean page with a thin colour bar.", layout: "a4", kinds: ALL_KINDS },
  { id: "modern", name: "Modern", description: "A bold colour header.", layout: "a4", kinds: ALL_KINDS },
  { id: "minimal", name: "Minimal", description: "Plain and simple, black on white.", layout: "a4", kinds: ALL_KINDS },
  { id: "wave", name: "Wave", description: "A flowing curved header.", layout: "a4", kinds: ALL_KINDS },
  { id: "corner", name: "Corner", description: "Colour swooshes in the corners.", layout: "a4", kinds: ALL_KINDS },
  { id: "bold", name: "Bold", description: "A dark header with a coloured wedge.", layout: "a4", kinds: ALL_KINDS },
  { id: "soft", name: "Soft", description: "A rounded card on a tinted page.", layout: "a4", kinds: ALL_KINDS },
  { id: "stripe", name: "Stripe", description: "A side stripe and a dark footer bar.", layout: "a4", kinds: ALL_KINDS },
  { id: "diagonal", name: "Diagonal", description: "A slanted two-tone header.", layout: "a4", kinds: ALL_KINDS },
  { id: "cashbook", name: "Cash book", description: "A landscape receipt-book page, filled in.", layout: "cash", kinds: ["receipt"] },
  { id: "cashbook-wave", name: "Cash book wave", description: "A receipt-book page with curved edges.", layout: "cash", kinds: ["receipt"] },
  { id: "cashbook-stripe", name: "Cash book stripe", description: "A receipt-book page with tick boxes.", layout: "cash", kinds: ["receipt"] },
  { id: "slip", name: "Till slip", description: "A narrow paper slip with a barcode.", layout: "slip", kinds: ["receipt"] },
  { id: "slip-bold", name: "Bold slip", description: "A till slip with a colour header and PAID stamp.", layout: "slip", kinds: ["receipt"] },
];

export const templateInfo = (id: string): DocumentTemplateInfo | undefined => DOCUMENT_TEMPLATES.find((t) => t.id === id);

/** The wording each kind of document uses. */
export const DOCUMENT_WORDING: Record<BusinessDocumentKind, { noun: string; title: string; prefix: string; numberLabel: string; dateLabel: string; endLabel: string; toLabel: string }> = {
  invoice: { noun: "Invoice", title: "INVOICE", prefix: "INV", numberLabel: "Invoice no.", dateLabel: "Issue date", endLabel: "Due date", toLabel: "BILL TO" },
  receipt: { noun: "Receipt", title: "RECEIPT", prefix: "RCT", numberLabel: "Receipt no.", dateLabel: "Date", endLabel: "Paid on", toLabel: "RECEIVED FROM" },
  quotation: { noun: "Quotation", title: "QUOTATION", prefix: "QUO", numberLabel: "Quotation no.", dateLabel: "Date", endLabel: "Valid until", toLabel: "PREPARED FOR" },
};

export const INVOICE_STATUSES = ["draft", "sent", "partially_paid", "paid", "cancelled"] as const;
export const RECEIPT_STATUSES = ["issued", "sent", "void"] as const;

export interface DocumentCustomField {
  key: string;
  label: string;
}

/** How a business's invoices (or receipts) look and what they ask for. */
export interface DocumentSettings {
  prefix: string;
  title: string;
  template: DocumentTemplate;
  accentColor: string;
  taxLabel: string;
  defaultTaxRate: number;
  /** Invoices: days from issue until payment is due. */
  dueDays: number;
  defaultNotes: string;
  defaultTerms: string;
  /** Bank or mobile money details printed on invoices. */
  paymentDetails: string;
  footer: string;
  signatureLabel: string;
  showLogo: boolean;
  showBusinessDetails: boolean;
  customFields: DocumentCustomField[];
}

export function defaultDocumentSettings(kind: BusinessDocumentKind, accentColor = "#2563eb"): DocumentSettings {
  return {
    prefix: DOCUMENT_WORDING[kind].prefix,
    title: DOCUMENT_WORDING[kind].title,
    template: "classic",
    accentColor,
    taxLabel: "Tax",
    defaultTaxRate: 0,
    dueDays: kind === "quotation" ? 30 : 14,
    defaultNotes: kind === "invoice" ? "Thank you for your business." : kind === "quotation" ? "Thank you for the opportunity to quote." : "Thank you for your payment.",
    defaultTerms: kind === "invoice" ? "Payment is due by the due date shown above." : kind === "quotation" ? "This quotation is valid until the date shown above." : "",
    paymentDetails: "",
    footer: "",
    signatureLabel: "Authorised signature",
    showLogo: true,
    showBusinessDetails: true,
    customFields: [],
  };
}

/** Fills in anything missing from stored settings with the defaults. */
export function resolveDocumentSettings(kind: BusinessDocumentKind, stored: unknown, accentColor?: string): DocumentSettings {
  const base = defaultDocumentSettings(kind, accentColor);
  const raw = (stored && typeof stored === "object" ? stored : {}) as Partial<DocumentSettings>;
  const merged = { ...base, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null)) } as DocumentSettings;
  const info = templateInfo(merged.template);
  if (!info || !info.kinds.includes(kind)) merged.template = "classic";
  if (!/^#[0-9a-f]{6}$/i.test(merged.accentColor)) merged.accentColor = base.accentColor;
  merged.customFields = Array.isArray(merged.customFields) ? merged.customFields.filter((f) => f && f.key && f.label) : [];
  return merged;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface DocumentTotals {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function lineAmount(item: LineItem) {
  return round2((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0));
}

/** Subtotal, discount, tax on the discounted amount, total, and what's still owed. */
export function computeTotals(items: LineItem[], discount: number, taxRate: number, amountPaid = 0): DocumentTotals {
  const subtotal = round2(items.reduce((sum, item) => sum + lineAmount(item), 0));
  const cappedDiscount = round2(Math.min(Math.max(0, Number(discount) || 0), subtotal));
  const taxAmount = round2(((subtotal - cappedDiscount) * Math.max(0, Number(taxRate) || 0)) / 100);
  const total = round2(subtotal - cappedDiscount + taxAmount);
  const paid = round2(Math.max(0, Number(amountPaid) || 0));
  return { subtotal, discount: cappedDiscount, taxAmount, total, amountPaid: paid, balance: round2(total - paid) };
}

/** "Le 1,250.50" for leones, "USD 1,250.50" for other currency codes. */
export function formatMoney(amount: number, currency = "SLE"): string {
  const value = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "SLE" ? `Le ${value}` : `${currency} ${value}`;
}

export function formatDocDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export interface DocumentBusiness {
  name: string;
  logo?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  taxNumber?: string | null;
}

export interface DocumentContent {
  kind: BusinessDocumentKind;
  number: string;
  status: string;
  /** Changed since it was first saved: printed as "Updated". */
  updatedOn?: string | Date | null;
  issueDate: string | Date;
  dueDate?: string | Date | null;
  paymentMethod?: string | null;
  client: { name: string; email?: string | null; phone?: string | null; address?: string | null };
  items: LineItem[];
  discount: number;
  taxRate: number;
  amountPaid: number;
  notes?: string | null;
  terms?: string | null;
  customFields: { label: string; value: string }[];
  currency: string;
}

// ---------------------------------------------------------------------------
// Drawing

/** How each A4 layout dresses the page; the content and its positions are the same for all. */
interface Theme {
  /** Height of a coloured header band the business and title sit on in white (0 for none). */
  band: number;
  table: "tint" | "solid" | "line" | "dark";
  zebra: boolean;
  total: "solid" | "soft";
  title: "accent" | "ink" | "white";
  /** Drawn behind everything on every page. */
  paintEvery: (accent: string, ctx: Ctx) => string;
  /** Drawn on the first page only, behind the header text. */
  paintFirst: (accent: string, ctx: Ctx) => string;
  /** Colour of the page number, for layouts that put it over a coloured shape. */
  pageNoInk?: string;
}

const none = () => "";

const THEMES: Record<string, Theme> = {
  classic: { band: 0, table: "tint", zebra: true, total: "solid", title: "accent", paintEvery: none, paintFirst: (a) => rect(0, 0, W, 6, a) },
  modern: { band: 150, table: "solid", zebra: true, total: "solid", title: "white", paintEvery: none, paintFirst: (a) => rect(0, 0, W, 150, a) },
  minimal: { band: 0, table: "line", zebra: false, total: "soft", title: "ink", paintEvery: none, paintFirst: none },
  wave: {
    band: 150,
    table: "tint",
    zebra: true,
    total: "solid",
    title: "white",
    paintEvery: none,
    paintFirst: (a) =>
      path(`M0 0H${W}V112C${W * 0.78} 176 ${W * 0.5} 96 ${W * 0.2} 150C${W * 0.1} 168 ${W * 0.04} 160 0 148Z`, tint(a, 0.4)) +
      path(`M0 0H${W}V96C${W * 0.74} 150 ${W * 0.48} 76 ${W * 0.2} 128C${W * 0.1} 146 ${W * 0.04} 138 0 126Z`, a),
  },
  corner: {
    band: 0,
    table: "dark",
    zebra: true,
    total: "solid",
    title: "accent",
    pageNoInk: "#ffffff",
    paintEvery: (a) =>
      polygon([[W - 250, H], [W - 120, H - 46], [W, H - 62], [W, H]], a) + polygon([[W - 130, H], [W, H - 34], [W, H]], shade(a, 0.35)),
    paintFirst: (a) => polygon([[0, 0], [170, 0], [100, 18], [0, 26]], a) + polygon([[0, 0], [90, 0], [0, 12]], shade(a, 0.35)),
  },
  bold: {
    band: 128,
    table: "dark",
    zebra: true,
    total: "solid",
    title: "white",
    paintEvery: none,
    paintFirst: (a) => rect(0, 0, W, 128, shade(a, 0.72)) + polygon([[W - 250, 0], [W, 0], [W, 128], [W - 310, 128]], a),
  },
  soft: {
    band: 0,
    table: "solid",
    zebra: false,
    total: "soft",
    title: "accent",
    paintEvery: (a, ctx) => {
      const clip = ctx.clip(`<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="18"/>`);
      return rect(0, 0, W, H, tint(a, 0.9)) + rect(14, 14, W - 28, H - 28, "#ffffff", `rx="18"`) + circle(W - 28, 28, 92, tint(a, 0.82), `clip-path="${clip}"`) + circle(W - 28, 28, 56, tint(a, 0.7), `clip-path="${clip}"`);
    },
    paintFirst: none,
  },
  stripe: {
    band: 0,
    table: "tint",
    zebra: true,
    total: "solid",
    title: "accent",
    paintEvery: (a) => rect(0, 0, 18, H, a) + rect(18, 0, 5, H, tint(a, 0.6)) + rect(0, H - 10, W, 10, shade(a, 0.6)),
    paintFirst: none,
  },
  diagonal: {
    band: 138,
    table: "solid",
    zebra: true,
    total: "solid",
    title: "white",
    paintEvery: none,
    paintFirst: (a) => polygon([[0, 0], [W, 0], [W, 96], [0, 138]], a) + polygon([[W * 0.56, 0], [W, 0], [W, 96], [W * 0.56, 118]], tint(a, 0.25)),
  },
};

interface Row {
  lines: string[];
  item: LineItem;
  height: number;
}

const COLS = { desc: M + 12, qty: 352, price: 440, amount: W - M - 12 };
const DESC_WIDTH = 290;
const ROW_SIZE = 9.5;
const LINE = 12.5;

function tableRows(items: LineItem[]): Row[] {
  return items.map((item) => {
    const lines = wrapText(item.description || "-", DESC_WIDTH, ROW_SIZE, 4);
    return { lines, item, height: 12 + lines.length * LINE };
  });
}

function wrapBlock(value: string | null | undefined, width: number, size: number, maxLines: number) {
  if (!value?.trim()) return [];
  return value
    .split(/\r?\n/)
    .flatMap((paragraph) => (paragraph.trim() ? wrapText(paragraph, width, size, maxLines) : [""]))
    .slice(0, maxLines);
}

function statusStamp(content: DocumentContent): { label: string; color: string } | null {
  if (content.kind === "quotation") {
    if (content.status === "accepted") return { label: "ACCEPTED", color: "#16a34a" };
    if (content.status === "declined") return { label: "DECLINED", color: "#dc2626" };
    if (content.status === "expired") return { label: "EXPIRED", color: "#64748b" };
    return null;
  }
  if (content.kind === "receipt") return content.status === "void" ? { label: "VOID", color: "#dc2626" } : { label: "PAID", color: "#16a34a" };
  if (content.status === "paid") return { label: "PAID", color: "#16a34a" };
  if (content.status === "cancelled") return { label: "CANCELLED", color: "#dc2626" };
  if (content.status === "partially_paid") return { label: "PART PAID", color: "#d97706" };
  return null;
}

/**
 * Draws the document on as many A4 pages as its line items need. The first page has the full
 * header; later pages repeat a short header; the totals, notes, and signature close the last page.
 */
export function renderBusinessDocument(content: DocumentContent, business: DocumentBusiness, settings: DocumentSettings): string[] {
  const layout = templateInfo(settings.template)?.layout ?? "a4";
  if (layout === "cash") return [renderCashReceipt(content, business, settings, settings.template as CashVariant)];
  if (layout === "slip") return [renderSlip(content, business, settings, settings.template as SlipVariant)];

  const accent = settings.accentColor;
  const t = settings.template;
  const th = THEMES[t] ?? THEMES.classic!;
  const words = DOCUMENT_WORDING[content.kind];
  const money = (v: number) => formatMoney(v, content.currency);
  const totals = computeTotals(content.items, content.discount, content.taxRate, content.amountPaid);
  const rows = tableRows(content.items);

  // Closing block: totals, payment details, notes, terms, signature.
  const notes = wrapBlock(content.notes, 280, 8.5, 6);
  const terms = wrapBlock(content.terms, 280, 8, 6);
  const payment = content.kind !== "receipt" ? wrapBlock(settings.paymentDetails, 280, 8.5, 5) : [];
  const showPaid = content.kind === "receipt" || (content.kind === "invoice" && !!totals.amountPaid);
  const totalLines = 2 + (totals.discount ? 1 : 0) + (content.taxRate ? 1 : 0) + (showPaid ? 2 : 0);
  const leftBlock = (payment.length ? 18 + payment.length * 11 : 0) + (notes.length ? 18 + notes.length * 11 : 0) + (terms.length ? 18 + terms.length * 10.5 : 0);
  const closingHeight = Math.max(totalLines * 18 + 20, leftBlock) + 90;

  const pages: string[] = [];
  let index = 0;
  const footerY = H - 26;

  const header = (first: boolean, ctx: Ctx): { svg: string; y: number } => {
    let svg = rect(0, 0, W, H, "#ffffff") + th.paintEvery(accent, ctx);
    if (!first) {
      svg += rect(0, 0, W, 4, accent);
      svg += text(M, 40, business.name, { size: 11, fill: INK, bold: true });
      svg += text(W - M, 40, `${settings.title} ${content.number} (continued)`, { size: 9, fill: MUTED, anchor: "end" });
      svg += rect(M, 52, W - 2 * M, 0.8, RULE);
      return { svg, y: 72 };
    }

    const dark = th.band > 0;
    const bandHeight = th.band;
    svg += th.paintFirst(accent, ctx);
    const headInk = dark ? "#ffffff" : INK;
    const headMuted = dark ? tint(accent, 0.8) : MUTED;

    // Business block (left)
    let bx = M;
    if (settings.showLogo && business.logo) {
      const clip = ctx.clip(`<rect x="${M}" y="34" width="64" height="64" rx="10"/>`);
      svg += dark ? rect(M - 4, 30, 72, 72, "#ffffff", `rx="12"`) : "";
      svg += image(business.logo, M, 34, 64, 64, "meet", clip);
      bx = M + 78;
    }
    const nameFit = fitText(business.name, 250 - (bx - M), 16, { bold: true, minSize: 11 });
    svg += text(bx, 50, nameFit.text, { size: nameFit.size, fill: headInk, bold: true });
    let by = 64;
    if (settings.showBusinessDetails) {
      const details = [business.address, [business.phone, business.email].filter(Boolean).join("  ·  "), business.website, business.taxNumber ? `Tax no. ${business.taxNumber}` : ""].filter(
        (d): d is string => !!d,
      );
      for (const line of details.flatMap((d) => wrapText(d, 250 - (bx - M), 8.5, 2))) {
        svg += text(bx, by, line, { size: 8.5, fill: headMuted });
        by += 11.5;
      }
    }

    // Title and meta (right)
    const titleColor = th.title === "white" ? "#ffffff" : th.title === "ink" ? INK : accent;
    svg += text(W - M, 56, settings.title, { size: t === "minimal" ? 22 : 26, fill: titleColor, bold: true, anchor: "end", letterSpacing: 2 });
    const meta: [string, string][] = [
      [words.numberLabel, content.number],
      [words.dateLabel, formatDocDate(content.issueDate)],
    ];
    if (content.dueDate) meta.push([words.endLabel, formatDocDate(content.dueDate)]);
    if (content.paymentMethod) meta.push(["Payment method", content.paymentMethod]);
    let my = 76;
    for (const [label, value] of meta) {
      svg += text(W - M - 110, my, label, { size: 8.5, fill: headMuted, anchor: "end" });
      const fit = fitText(value, 104, 9, { bold: true, minSize: 7 });
      svg += text(W - M, my, fit.text, { size: fit.size, fill: headInk, bold: true, anchor: "end" });
      my += 13;
    }
    if (content.updatedOn) {
      const label = `UPDATED ${formatDocDate(content.updatedOn).toUpperCase()}`;
      const w = textWidth(label, 7, true, 0.6) + 14;
      svg += rect(W - M - w, my - 4, w, 15, dark ? tint(accent, 0.25) : "#fef3c7", `rx="7.5"`);
      svg += text(W - M - w / 2, my + 6.5, label, { size: 7, fill: dark ? "#ffffff" : "#92400e", bold: true, anchor: "middle", letterSpacing: 0.6 });
      my += 18;
    }

    // Bill to / received from, plus custom fields
    const y = Math.max(by, my, bandHeight) + 26;
    if (!dark) svg += rect(M, y - 14, W - 2 * M, 0.8, RULE);
    svg += text(M, y, words.toLabel, { size: 8, fill: accent, bold: true, letterSpacing: 1 });
    let cy = y + 15;
    const clientFit = fitText(content.client.name, 250, 11.5, { bold: true, minSize: 9 });
    svg += text(M, cy, clientFit.text, { size: clientFit.size, fill: INK, bold: true });
    cy += 13;
    for (const line of [content.client.address, content.client.phone, content.client.email].filter((v): v is string => !!v).flatMap((v) => wrapText(v, 250, 8.5, 2))) {
      svg += text(M, cy, line, { size: 8.5, fill: MUTED });
      cy += 11.5;
    }
    let fy = y + 15;
    for (const field of content.customFields.filter((f) => f.value)) {
      svg += text(W - M - 160, fy, field.label, { size: 8.5, fill: MUTED });
      const fit = fitText(field.value, 150, 9, { bold: true, minSize: 7 });
      svg += text(W - M, fy, fit.text, { size: fit.size, fill: INK, bold: true, anchor: "end" });
      fy += 13;
    }
    return { svg, y: Math.max(cy, fy) + 18 };
  };

  const tableHead = (y: number) => {
    // A solid tint: PDFs can't draw colours with transparency written as #rrggbbaa.
    const bg = th.table === "line" ? "#ffffff" : th.table === "solid" ? accent : th.table === "dark" ? shade(accent, 0.72) : tint(accent, 0.88);
    const ink = th.table === "line" ? INK : th.table === "tint" ? accent : "#ffffff";
    let svg = rect(M, y, W - 2 * M, 24, bg, `rx="${th.table === "line" ? 0 : t === "soft" ? 12 : 6}"`);
    if (th.table === "line") svg += rect(M, y + 24, W - 2 * M, 1.2, INK);
    svg += text(COLS.desc, y + 16, "DESCRIPTION", { size: 8, fill: ink, bold: true, letterSpacing: 0.8 });
    svg += text(COLS.qty, y + 16, "QTY", { size: 8, fill: ink, bold: true, anchor: "end", letterSpacing: 0.8 });
    svg += text(COLS.price, y + 16, "UNIT PRICE", { size: 8, fill: ink, bold: true, anchor: "end", letterSpacing: 0.8 });
    svg += text(COLS.amount, y + 16, "AMOUNT", { size: 8, fill: ink, bold: true, anchor: "end", letterSpacing: 0.8 });
    return { svg, y: y + 30 };
  };

  const drawRow = (row: Row, y: number, zebra: boolean) => {
    let svg = zebra && th.zebra ? rect(M, y - 4, W - 2 * M, row.height, t === "soft" ? tint(accent, 0.94) : "#f8fafc") : "";
    row.lines.forEach((line, i) => (svg += text(COLS.desc, y + 9 + i * LINE, line, { size: ROW_SIZE, fill: INK })));
    const qty = Number(row.item.quantity) || 0;
    svg += text(COLS.qty, y + 9, String(Number.isInteger(qty) ? qty : qty.toFixed(2)), { size: ROW_SIZE, fill: INK, anchor: "end" });
    svg += text(COLS.price, y + 9, money(Number(row.item.unitPrice) || 0), { size: ROW_SIZE, fill: INK, anchor: "end" });
    svg += text(COLS.amount, y + 9, money(lineAmount(row.item)), { size: ROW_SIZE, fill: INK, bold: true, anchor: "end" });
    svg += rect(M, y - 4 + row.height, W - 2 * M, 0.6, RULE);
    return svg;
  };

  const closing = (y: number) => {
    let svg = "";
    // Totals (right)
    const lines: [string, string, boolean][] = [["Subtotal", money(totals.subtotal), false]];
    if (totals.discount) lines.push(["Discount", `- ${money(totals.discount)}`, false]);
    if (content.taxRate) lines.push([`${settings.taxLabel} (${content.taxRate}%)`, money(totals.taxAmount), false]);
    lines.push(["Total", money(totals.total), true]);
    if (showPaid) {
      lines.push(["Amount paid", money(totals.amountPaid), false]);
      lines.push([content.kind === "receipt" ? "Balance" : "Balance due", money(totals.balance), true]);
    }
    let ty = y + 4;
    const tx = W - M - 210;
    for (const [label, value, strong] of lines) {
      if (strong && label === "Total") {
        const soft = th.total === "soft";
        svg += rect(tx - 8, ty - 13, 218, 22, soft ? (t === "soft" ? tint(accent, 0.85) : "#f1f5f9") : accent, `rx="5"`);
        svg += text(tx, ty + 2, label, { size: 10, fill: soft ? INK : "#ffffff", bold: true });
        svg += text(W - M, ty + 2, value, { size: 11, fill: soft ? INK : "#ffffff", bold: true, anchor: "end" });
        ty += 24;
      } else {
        svg += text(tx, ty, label, { size: 9, fill: strong ? INK : MUTED, bold: strong });
        svg += text(W - M, ty, value, { size: 9.5, fill: INK, bold: strong, anchor: "end" });
        ty += 17;
      }
    }

    // Payment details, notes, terms (left)
    let ly = y;
    const block = (title: string, lines: string[], size: number) => {
      if (!lines.length) return;
      svg += text(M, ly, title, { size: 8, fill: accent, bold: true, letterSpacing: 1 });
      ly += 13;
      for (const line of lines) {
        svg += text(M, ly, line, { size, fill: "#334155" });
        ly += size + 2.5;
      }
      ly += 8;
    };
    block(content.kind === "quotation" ? "PAYMENT TERMS" : "PAYMENT DETAILS", payment, 8.5);
    block("NOTES", notes, 8.5);
    block("TERMS", terms, 8);

    // Signature
    const sy = Math.max(ty, ly) + 40;
    if (settings.signatureLabel) {
      svg += rect(W - M - 170, sy, 170, 0.8, "#94a3b8");
      svg += text(W - M - 85, sy + 13, settings.signatureLabel, { size: 8.5, fill: MUTED, anchor: "middle" });
    }

    const stamp = statusStamp(content);
    if (stamp) {
      const sw = textWidth(stamp.label, 20, true, 3) + 28;
      svg += `<g transform="rotate(-12 ${n(M + 120)} ${n(sy)})" opacity="0.85">${rect(M + 120 - sw / 2, sy - 20, sw, 40, "none", `rx="8" stroke="${stamp.color}" stroke-width="3"`)}${text(M + 120, sy + 7, stamp.label, { size: 20, fill: stamp.color, bold: true, anchor: "middle", letterSpacing: 3 })}</g>`;
    }
    return svg;
  };

  const footer = (pageNo: number, pageCount: number) => {
    let svg = rect(M, footerY - 14, W - 2 * M, 0.6, RULE);
    const note = settings.footer || `${business.name}${business.website ? ` · ${business.website}` : ""}`;
    const fit = fitText(note, W - 2 * M - 80, 8, { minSize: 6.5 });
    svg += text(M, footerY, fit.text, { size: fit.size, fill: MUTED });
    svg += text(W - M, footerY, `Page ${pageNo} of ${pageCount}`, { size: 8, fill: th.pageNoInk ?? MUTED, anchor: "end" });
    return svg;
  };

  // Lay the rows out over pages, keeping room for the closing block on the last page.
  const bodies: { ctx: Ctx; svg: string }[] = [];
  const bottom = footerY - 26;
  let first = true;
  while (first || index < rows.length) {
    const ctx = new Ctx();
    const head = header(first, ctx);
    let svg = head.svg;
    const th = tableHead(head.y);
    svg += th.svg;
    let y = th.y;
    if (rows.length === 0) {
      svg += text(COLS.desc, y + 9, "No items", { size: ROW_SIZE, fill: MUTED });
      y += 24;
    }
    const startIndex = index;
    while (index < rows.length) {
      const row = rows[index]!;
      // A page always takes at least one row, so a very long description can't stall the layout.
      if (y + row.height > bottom && index > startIndex) break;
      svg += drawRow(row, y, index % 2 === 1);
      y += row.height;
      index++;
    }
    first = false;
    if (index < rows.length) {
      bodies.push({ ctx, svg });
      continue;
    }
    if (y + 22 + closingHeight <= bottom + 20) {
      bodies.push({ ctx, svg: svg + closing(y + 22) });
    } else {
      // The items fill this page: the totals go on a page of their own.
      bodies.push({ ctx, svg });
      const ctx2 = new Ctx();
      const h2 = header(false, ctx2);
      bodies.push({ ctx: ctx2, svg: h2.svg + closing(h2.y + 10) });
    }
    break;
  }

  bodies.forEach((body, i) => pages.push(svgDocument(W, H, body.ctx, body.svg + footer(i + 1, bodies.length))));
  return pages;
}

/** Escapes a value for use inside the SVG (exported for callers composing their own markup). */
export const escapeSvg = esc;

/** The size, in points, of the pages a document is drawn on: A4, a landscape receipt, or a slip as tall as it needs. */
export function documentPageSize(content: DocumentContent, business: DocumentBusiness, settings: DocumentSettings): { width: number; height: number } {
  const layout = templateInfo(settings.template)?.layout ?? "a4";
  if (layout === "cash") return { width: CASH_WIDTH, height: CASH_HEIGHT };
  if (layout === "slip") return { width: SLIP_WIDTH, height: slipHeight(content, business, settings, settings.template as SlipVariant) };
  return { width: DOC_PAGE_WIDTH, height: DOC_PAGE_HEIGHT };
}
