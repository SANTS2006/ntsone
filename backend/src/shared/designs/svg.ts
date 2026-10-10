/**
 * Dependency-free SVG building blocks shared by the backend (rendered into PDFs through
 * svg-to-pdfkit) and the frontend (live previews), so a preview matches the download exactly.
 * Everything that ends up inside the markup goes through `esc`.
 */

export const FONT_FAMILY = "Poppins, sans-serif";

// Advance widths (per 1000 units) of Poppins for ASCII 32-126, measured from the same
// font files the PDF embeds. Used to fit text into the fixed layouts.
const WIDTHS = {
  regular: [
    267, 298, 292, 840, 622, 759, 739, 159, 454, 454, 486, 683, 198, 551, 210, 476, 628, 320, 575, 589, 629, 628, 635,
    546, 631, 630, 213, 264, 555, 723, 539, 524, 1013, 674, 613, 772, 707, 513, 504, 778, 692, 246, 530, 599, 432, 861,
    703, 786, 579, 788, 608, 587, 541, 675, 676, 976, 621, 584, 541, 423, 658, 423, 629, 733, 257, 676, 676, 607, 676,
    620, 329, 676, 640, 246, 248, 515, 246, 1030, 640, 640, 676, 676, 373, 522, 364, 640, 561, 820, 479, 563, 455, 462,
    291, 462, 519,
  ],
  bold: [
    212, 392, 411, 904, 658, 870, 798, 221, 477, 477, 534, 628, 287, 580, 282, 453, 652, 376, 571, 605, 677, 650, 637,
    535, 648, 615, 284, 347, 551, 696, 541, 538, 1080, 737, 659, 762, 727, 541, 547, 762, 731, 295, 578, 697, 477, 918,
    752, 786, 624, 788, 652, 615, 591, 705, 730, 1052, 715, 671, 596, 510, 802, 510, 709, 780, 291, 679, 679, 605, 679,
    616, 360, 679, 674, 295, 294, 618, 295, 1059, 674, 637, 679, 679, 428, 558, 406, 674, 626, 866, 588, 632, 496, 499,
    291, 499, 636,
  ],
};

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Round for compact markup. */
export function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function textWidth(value: string, size: number, bold = false, letterSpacing = 0): number {
  const table = bold ? WIDTHS.bold : WIDTHS.regular;
  let units = 0;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32]! : 600;
  }
  return (units * size) / 1000 + letterSpacing * value.length;
}

/** Shrinks the font down to `minSize`, then truncates with an ellipsis, so the text fits `maxWidth`. */
export function fitText(
  value: string,
  maxWidth: number,
  size: number,
  { bold = false, minSize = size, letterSpacing = 0 }: { bold?: boolean; minSize?: number; letterSpacing?: number } = {},
): { text: string; size: number } {
  let s = size;
  while (s > minSize && textWidth(value, s, bold, letterSpacing) > maxWidth) s = Math.max(minSize, s - 0.5);
  if (textWidth(value, s, bold, letterSpacing) <= maxWidth) return { text: value, size: s };
  let cut = value;
  while (cut.length > 1 && textWidth(`${cut}...`, s, bold, letterSpacing) > maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}...`, size: s };
}

/** Word-wraps into at most `maxLines` lines; the last line is truncated if the text doesn't fit. */
export function wrapText(value: string, maxWidth: number, size: number, maxLines: number, bold = false): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) {
      current = words.slice(i).join(" ");
      break;
    }
  }
  if (current) lines.push(fitText(current, maxWidth, size, { bold }).text);
  return lines.slice(0, maxLines);
}

export interface TextOptions {
  size: number;
  fill: string;
  bold?: boolean;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
  italic?: boolean;
  opacity?: number;
}

export function text(x: number, y: number, value: string, o: TextOptions): string {
  const attrs = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    `font-family="${FONT_FAMILY}"`,
    `font-size="${n(o.size)}"`,
    `fill="${o.fill}"`,
  ];
  if (o.bold) attrs.push(`font-weight="bold"`);
  if (o.italic) attrs.push(`font-style="italic"`);
  if (o.anchor && o.anchor !== "start") attrs.push(`text-anchor="${o.anchor}"`);
  if (o.letterSpacing) attrs.push(`letter-spacing="${n(o.letterSpacing)}"`);
  if (o.opacity !== undefined && o.opacity < 1) attrs.push(`fill-opacity="${n(o.opacity)}"`);
  return `<text ${attrs.join(" ")}>${esc(value)}</text>`;
}

/** Text shrunk/truncated to fit `maxWidth`. */
export function fitted(
  x: number,
  y: number,
  value: string,
  maxWidth: number,
  o: TextOptions & { minSize?: number },
): string {
  if (!value) return "";
  const fit = fitText(value, maxWidth, o.size, { bold: o.bold, minSize: o.minSize ?? o.size * 0.7, letterSpacing: o.letterSpacing });
  return text(x, y, fit.text, { ...o, size: fit.size });
}

// ---------------------------------------------------------------------------
// Colors

function parseHex(hex: string): [number, number, number] {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "000000";
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

export const shade = (color: string, t: number) => mix(color, "#000000", t);
export const tint = (color: string, t: number) => mix(color, "#ffffff", t);

// ---------------------------------------------------------------------------
// Document & defs

let renderCount = 0;

/** Collects <defs> and hands out ids unique to one SVG, so several previews can share a page. */
export class Ctx {
  private readonly prefix = `d${(renderCount++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  private count = 0;
  readonly defs: string[] = [];

  id(): string {
    return `${this.prefix}${this.count++}`;
  }

  linear(stops: [string, string], [x1, y1, x2, y2]: [number, number, number, number] = [0, 0, 1, 1]): string {
    const id = this.id();
    this.defs.push(
      `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient>`,
    );
    return `url(#${id})`;
  }

  clip(shapeMarkup: string): string {
    const id = this.id();
    this.defs.push(`<clipPath id="${id}">${shapeMarkup}</clipPath>`);
    return `url(#${id})`;
  }
}

export function svgDocument(width: number, height: number, ctx: Ctx, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}">` +
    `<defs>${ctx.defs.join("")}</defs>${body}</svg>`
  );
}

export const rect = (x: number, y: number, w: number, h: number, fill: string, extra = "") =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" ${extra}/>`;

export const path = (d: string, fill: string, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;

export const circle = (cx: number, cy: number, r: number, fill: string, extra = "") =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" ${extra}/>`;

export const polygon = (points: [number, number][], fill: string, extra = "") =>
  `<polygon points="${points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="${fill}" ${extra}/>`;

export function image(href: string, x: number, y: number, w: number, h: number, fit: "slice" | "meet", clip?: string) {
  const ref = esc(href);
  return `<image href="${ref}" xlink:href="${ref}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid ${fit}"${clip ? ` clip-path="${clip}"` : ""}/>`;
}

/** Alternating squares clipped to a shape, used for the checkered design textures. */
export function checker(ctx: Ctx, clipShape: string, box: [number, number, number, number], cell: number, fill: string, opacity: number) {
  const [x0, y0, w, h] = box;
  let d = "";
  for (let row = 0; row * cell < h; row++) {
    for (let col = row % 2; col * cell < w; col += 2) {
      d += `M${n(x0 + col * cell)} ${n(y0 + row * cell)}h${n(cell)}v${n(cell)}h-${n(cell)}z`;
    }
  }
  return `<g clip-path="${ctx.clip(clipShape)}"><path d="${d}" fill="${fill}" fill-opacity="${n(opacity)}"/></g>`;
}

// ---------------------------------------------------------------------------
// Composite pieces

export type PhotoShape = "circle" | "hexagon" | "square";

export function hexagonPoints(cx: number, cy: number, r: number): [number, number][] {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

function shapeMarkup(shape: PhotoShape, cx: number, cy: number, r: number, h = r) {
  if (shape === "circle") return circle(cx, cy, r, "#fff");
  if (shape === "hexagon") return polygon(hexagonPoints(cx, cy, r), "#fff");
  return rect(cx - r, cy - h, r * 2, h * 2, "#fff");
}

/**
 * The participant photo in a frame, or a neutral silhouette when there is none.
 * `r` is the half-width; `h` the half-height for the square frame.
 */
export function photo(
  ctx: Ctx,
  href: string | null,
  shape: PhotoShape,
  cx: number,
  cy: number,
  r: number,
  {
    border,
    borderWidth = 0,
    h = r,
    monogram,
  }: { border?: string; borderWidth?: number; h?: number; monogram?: string } = {},
) {
  let out = "";
  if (border && borderWidth) {
    if (shape === "circle") out += circle(cx, cy, r + borderWidth, border);
    else if (shape === "hexagon") out += polygon(hexagonPoints(cx, cy, r + borderWidth * 1.15), border);
    else out += rect(cx - r - borderWidth, cy - h - borderWidth, (r + borderWidth) * 2, (h + borderWidth) * 2, border);
  }
  const clip = ctx.clip(shapeMarkup(shape, cx, cy, r, h));
  if (href) return out + image(href, cx - r, cy - h, r * 2, h * 2, "slice", clip);
  if (monogram) {
    // The card was set up without photos: show the person's initials in the frame instead.
    const bg = ctx.linear(["#e8edf5", "#cfd8e6"], [0, 0, 0, 1]);
    const s = Math.min(r, h);
    return (
      out +
      `<g clip-path="${clip}">${rect(cx - r, cy - h, r * 2, h * 2, bg)}</g>` +
      text(cx, cy + s * 0.25, monogram, { size: s * 0.72, fill: "#5b6b86", bold: true, anchor: "middle" })
    );
  }

  const bg = ctx.linear(["#e5e9f0", "#c7ceda"], [0, 0, 0, 1]);
  const s = Math.min(r, h);
  return (
    out +
    `<g clip-path="${clip}">` +
    rect(cx - r, cy - h, r * 2, h * 2, bg) +
    circle(cx, cy - s * 0.2, s * 0.36, "#9aa4b5") +
    path(
      `M${n(cx - s * 0.78)} ${n(cy + h)}C${n(cx - s * 0.78)} ${n(cy + s * 0.3)} ${n(cx - s * 0.4)} ${n(cy + s * 0.2)} ${n(cx)} ${n(cy + s * 0.2)}C${n(cx + s * 0.4)} ${n(cy + s * 0.2)} ${n(cx + s * 0.78)} ${n(cy + s * 0.3)} ${n(cx + s * 0.78)} ${n(cy + h)}Z`,
      "#9aa4b5",
    ) +
    `</g>`
  );
}

export interface LogoContent {
  image: string | null;
  orgName: string;
  tagline: string;
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "ID";
}

/**
 * The organization's uploaded logo, or a hexagon emblem with its initials beside its
 * name and the program name as the tagline. `y` is the vertical center.
 */
export function logo(
  logoContent: LogoContent,
  x: number,
  y: number,
  {
    anchor = "start",
    scale = 1,
    mark,
    textColor,
    taglineColor,
    maxWidth = 200,
  }: {
    anchor?: "start" | "middle";
    scale?: number;
    mark: string;
    textColor: string;
    taglineColor: string;
    maxWidth?: number;
  },
) {
  if (logoContent.image) {
    const h = 40 * scale;
    const w = Math.min(maxWidth, 130 * scale);
    const left = anchor === "middle" ? x - w / 2 : x;
    return image(logoContent.image, left, y - h / 2, w, h, "meet");
  }

  const r = 13 * scale;
  const gap = 7 * scale;
  const textMax = maxWidth - r * 2 - gap;
  const name = fitText(logoContent.orgName.toUpperCase(), textMax, 13 * scale, { bold: true, minSize: 7 * scale });
  const tag = fitText(logoContent.tagline.toUpperCase(), textMax, 6 * scale, { letterSpacing: 1.2 * scale });
  const textW = Math.max(textWidth(name.text, name.size, true), textWidth(tag.text, tag.size, false, 1.2 * scale));
  const total = r * 2 + gap + textW;
  const left = anchor === "middle" ? x - total / 2 : x;
  const cx = left + r;

  return (
    polygon(hexagonPoints(cx, y, r), "none", `stroke="${mark}" stroke-width="${n(3 * scale)}" stroke-linejoin="round"`) +
    text(cx, y + 3.3 * scale, initials(logoContent.orgName), { size: 9 * scale, fill: mark, bold: true, anchor: "middle" }) +
    text(left + r * 2 + gap, y + (tag.text ? 1 : 4.5) * scale, name.text, { size: name.size, fill: textColor, bold: true }) +
    (tag.text
      ? text(left + r * 2 + gap, y + 10 * scale, tag.text, {
          size: tag.size,
          fill: taglineColor,
          letterSpacing: 1.2 * scale,
        })
      : "")
  );
}

/** Two-tone name ("FIRST" in one color, "LAST" in another) shrunk to fit. */
export function twoToneName(
  x: number,
  y: number,
  name: string,
  maxWidth: number,
  {
    size,
    first,
    last,
    anchor = "middle",
    upper = false,
    lastBold = false,
  }: { size: number; first: string; last: string; anchor?: "start" | "middle"; upper?: boolean; lastBold?: boolean },
) {
  const full = (upper ? name.toUpperCase() : name).trim();
  const words = full.split(/\s+/);
  const head = words.length > 1 ? words.slice(0, -1).join(" ") : full;
  const tail = words.length > 1 ? words[words.length - 1]! : "";
  const minSize = size * 0.55;

  let s = size;
  const measure = (sz: number) =>
    textWidth(head, sz, true) + (tail ? textWidth(` ${tail}`, sz, lastBold) : 0);
  while (s > minSize && measure(s) > maxWidth) s -= 0.5;
  if (measure(s) > maxWidth) return fitted(x, y, full, maxWidth, { size: s, fill: first, bold: true, anchor });

  const headW = textWidth(head, s, true);
  const start = anchor === "middle" ? x - measure(s) / 2 : x;
  return (
    text(start, y, head, { size: s, fill: first, bold: true }) +
    (tail ? text(start + headW + textWidth(" ", s), y, tail, { size: s, fill: last, bold: lastBold }) : "")
  );
}

export interface Row {
  label: string;
  value: string;
}

/** "LABEL : value" rows with the colons aligned. Returns the markup and the y after the last row. */
export function rows(
  items: Row[],
  x: number,
  y: number,
  {
    labelWidth,
    maxWidth,
    lineHeight,
    size,
    labelColor,
    valueColor,
    upperLabels = true,
    boldLabels = false,
    maxY = Infinity,
  }: {
    labelWidth: number;
    maxWidth: number;
    lineHeight: number;
    size: number;
    labelColor: string;
    valueColor: string;
    upperLabels?: boolean;
    boldLabels?: boolean;
    maxY?: number;
  },
) {
  let out = "";
  let cy = y;
  for (const item of items) {
    if (cy > maxY) break;
    const label = fitText(upperLabels ? item.label.toUpperCase() : item.label, labelWidth - 6, size, { bold: boldLabels });
    out += text(x, cy, label.text, { size: label.size, fill: labelColor, bold: boldLabels });
    out += fitted(x + labelWidth, cy, `: ${item.value}`, maxWidth - labelWidth, { size, fill: valueColor, minSize: size * 0.8 });
    cy += lineHeight;
  }
  return { svg: out, y: cy };
}

export type BulletStyle = "dot" | "square" | "number";

/** A bulleted list, wrapping each item to `maxLinesEach` lines and stopping before `maxY`. */
export function bullets(
  items: string[],
  x: number,
  y: number,
  width: number,
  {
    style,
    bulletColor,
    textColor,
    size = 9.5,
    lineHeight = 12.5,
    gap = 8,
    maxLinesEach = 3,
    maxY = Infinity,
  }: {
    style: BulletStyle;
    bulletColor: string;
    textColor: string;
    size?: number;
    lineHeight?: number;
    gap?: number;
    maxLinesEach?: number;
    maxY?: number;
  },
) {
  const indent = style === "number" ? 30 : 14;
  let out = "";
  let cy = y;
  items.forEach((item, index) => {
    const lines = wrapText(item, width - indent, size, maxLinesEach);
    if (cy + (lines.length - 1) * lineHeight > maxY) return;
    if (style === "dot") out += circle(x + 3, cy - size * 0.33, 3, bulletColor);
    else if (style === "square") out += rect(x, cy - size * 0.75, 7, 7, bulletColor);
    else {
      out += circle(x + 11, cy - size * 0.33, 11, bulletColor);
      out += text(x + 11, cy + 0.2, String(index + 1).padStart(2, "0"), { size: 8.5, fill: "#ffffff", bold: true, anchor: "middle" });
    }
    lines.forEach((line, i) => {
      out += text(x + indent, cy + i * lineHeight, line, { size, fill: textColor });
    });
    cy += lines.length * lineHeight + gap;
  });
  return { svg: out, y: cy };
}

export function signature(x: number, y: number, width: number, label: string, color: string, anchor: "middle" | "end" = "middle") {
  if (!label) return "";
  const left = anchor === "middle" ? x - width / 2 : x - width;
  const labelX = anchor === "middle" ? x : x - width / 2;
  return (
    path(`M${n(left)} ${n(y)}h${n(width)}`, "none", `stroke="${color}" stroke-width="0.8" stroke-opacity="0.6"`) +
    fitted(labelX, y + 12, label, width + 20, { size: 8.5, fill: color, anchor: "middle", opacity: 0.8 })
  );
}

// ---------------------------------------------------------------------------
// Icons (24-unit glyphs, stroked)

const GLYPHS: Record<string, string> = {
  calendar: `<path d="M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v4.5l3 2"/>`,
  pin: `<path d="M12 21s-6.5-5.8-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>`,
  phone: `<path d="M5.5 3.5h3.5l1.8 4.6-2.3 1.5a11 11 0 0 0 5.9 5.9l1.5-2.3 4.6 1.8v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3.5 5.5a2 2 0 0 1 2-2z"/>`,
  mail: `<path d="M3.5 6h17v12h-17z M3.5 7l8.5 6 8.5-6"/>`,
  globe: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17 M12 3.5c3 3.2 3 13.8 0 17 M12 3.5c-3 3.2-3 13.8 0 17"/>`,
  user: `<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>`,
};

export type IconName = keyof typeof GLYPHS;

export function icon(name: IconName, x: number, y: number, size: number, color: string, strokeWidth = 2) {
  const s = size / 24;
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name]}</g>`;
}

/** An icon centered in a filled badge; `x`,`y` is the badge's center. */
export function iconBadge(name: IconName, cx: number, cy: number, size: number, bg: string, fg: string, round = true) {
  const badge = round ? circle(cx, cy, size / 2, bg) : rect(cx - size / 2, cy - size / 2, size, size, bg, `rx="${n(size * 0.22)}"`);
  const glyph = size * 0.62;
  return badge + icon(name, cx - glyph / 2, cy - glyph / 2, glyph, fg, 2.3);
}

// ---------------------------------------------------------------------------
// Codes

/** Dark modules drawn as one path (runs merged per row) on a light square. */
export function qrCode(matrix: boolean[][], x: number, y: number, size: number, fg = "#111827", bg = "#ffffff", pad = 0) {
  const count = matrix.length || 1;
  const cell = (size - pad * 2) / count;
  let d = "";
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      d += `M${n(x + pad + start * cell)} ${n(y + pad + r * cell)}h${n((c - start) * cell)}v${n(cell)}h-${n((c - start) * cell)}z`;
    }
  });
  return rect(x, y, size, size, bg) + `<path d="${d}" fill="${fg}"/>`;
}

/** Bars from a module string of 1s and 0s. */
export function barcode(bits: string, x: number, y: number, width: number, height: number, color = "#111827") {
  const unit = width / (bits.length || 1);
  let d = "";
  let i = 0;
  while (i < bits.length) {
    if (bits[i] !== "1") {
      i++;
      continue;
    }
    const start = i;
    while (i < bits.length && bits[i] === "1") i++;
    d += `M${n(x + start * unit)} ${n(y)}h${n((i - start) * unit)}v${n(height)}h-${n((i - start) * unit)}z`;
  }
  return `<path d="${d}" fill="${color}"/>`;
}

/** A QR-looking matrix for previews, where no real registration exists yet. */
export function sampleQrMatrix(size = 25): boolean[][] {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const m = Array.from({ length: size }, () => Array.from({ length: size }, () => random() > 0.52));
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[rr]![cc] = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (edge || core);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  return m;
}
