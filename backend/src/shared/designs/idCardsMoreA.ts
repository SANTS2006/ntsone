import { bokeh, seeded, sideways } from "./art.js";
import { contactRows, dateRows, H, idRows, INK, MUTED, pic, qrOrNothing, W, type IdCardContent, type IdCardDesign } from "./idCardKit.js";
import {
  barcode,
  bullets,
  circle,
  fitted,
  hexagonPoints,
  iconBadge,
  logo,
  n,
  path,
  polygon,
  qrCode,
  rect,
  rows,
  shade,
  signature,
  text,
  tint,
} from "./svg.js";

// ---------------------------------------------------------------------------
// Shared pieces for the card designs in this file and the next

export interface BackTheme {
  background: string;
  textColor: string;
  mutedColor: string;
  accent: string;
  qrColor?: string;
  heading?: string;
  /** Extra shapes drawn over the background. */
  decor?: string;
  /** Leaves room at the bottom for a design's own footer. */
  bottom?: number;
}

/** A card back: logo, QR code, terms, contacts, and signature, themed per design. */
export function themedBack(c: IdCardContent, t: BackTheme) {
  const bottom = t.bottom ?? H - 20;
  let y = 96;
  let out = t.background + (t.decor ?? "");
  out += logo(c.logo, W / 2, 52, { anchor: "middle", mark: t.accent, textColor: t.textColor, taglineColor: t.mutedColor, maxWidth: 240 });
  if (c.qr) {
    out += rect(W / 2 - 62, y, 124, 124, "#ffffff", `rx="10"`) + qrCode(c.qr, W / 2 - 55, y + 7, 110, t.qrColor ?? INK, "#ffffff");
    y += 146;
  }
  if (c.terms.length) {
    out += text(30, y, (t.heading ?? "TERMS & CONDITIONS").toUpperCase(), { size: 10, fill: t.accent, bold: true, letterSpacing: 1 });
    const list = bullets(c.terms, 30, y + 20, 240, { style: "dot", bulletColor: t.accent, textColor: t.mutedColor, size: 8.5, lineHeight: 11, gap: 6, maxLinesEach: 3, maxY: bottom - 80 });
    out += list.svg;
    y = list.y + 4;
  }
  const contact = contactRows(c, 30, Math.max(y + 8, 0), 240, t.accent, t.textColor, bottom - 44);
  out += contact.svg;
  out += signature(W / 2, bottom - 14, 130, c.signatureLabel, t.textColor);
  return out;
}

/** The registrant's role in large type, or their name when roles are hidden. */
export function roleOrName(c: IdCardContent) {
  return (c.role || c.name).toUpperCase();
}

/** Labelled rows with round icon badges, e.g. ID NO / EMAIL / PHONE, with rule lines. */
function iconDetailRows(c: IdCardContent, x: number, y: number, { color, textColor, rule, maxY = H }: { color: string; textColor: string; rule: string; maxY?: number }) {
  const items: { icon: "user" | "calendar" | "mail" | "phone" | "globe"; label: string; value: string }[] = [];
  if (c.registrationNumber) items.push({ icon: "user", label: "ID NO", value: c.registrationNumber });
  for (const f of c.fields) items.push({ icon: "user", label: f.label, value: f.value });
  if (c.issued) items.push({ icon: "calendar", label: "Issued", value: c.issued });
  if (c.contact.email) items.push({ icon: "mail", label: "Email", value: c.contact.email });
  if (c.contact.phone) items.push({ icon: "phone", label: "Phone", value: c.contact.phone });
  let out = "";
  let cy = y;
  for (const item of items) {
    if (cy > maxY) break;
    out += iconBadge(item.icon, x + 8, cy - 4, 16, "none", color);
    out += circle(x + 8, cy - 4, 8, "none", `stroke="${color}" stroke-width="1"`);
    out += text(x + 24, cy, item.label.toUpperCase(), { size: 7, fill: color, letterSpacing: 0.6 });
    out += fitted(x + 90, cy, item.value, W - x - 110, { size: 9, fill: textColor, bold: true, minSize: 6.5 });
    out += path(`M${x + 88} ${cy + 5}H${W - 24}`, "none", `stroke="${rule}" stroke-width="0.6"`);
    cy += 24;
  }
  return out;
}

/** White "op art" wave lines filling a corner. */
export function waves(x: number, y: number, count: number, spacing: number, width: number, color: string, flip = false) {
  let d = "";
  for (let i = 0; i < count; i++) {
    const oy = y + i * spacing;
    d += flip
      ? `M${x} ${oy}c${width * 0.25} ${-spacing * 1.8} ${width * 0.5} ${spacing * 1.8} ${width * 0.75} 0s${width * 0.4} ${-spacing * 1.2} ${width * 0.5} 0`
      : `M${x} ${oy}c${width * 0.25} ${spacing * 1.8} ${width * 0.5} ${-spacing * 1.8} ${width * 0.75} 0s${width * 0.4} ${spacing * 1.2} ${width * 0.5} 0`;
  }
  return path(d, "none", `stroke="${color}" stroke-width="${n(spacing * 0.45)}"`);
}

export function roundedCard(fill: string, radius = 18) {
  return rect(0, 0, W, H, fill, `rx="${radius}"`);
}

// ---------------------------------------------------------------------------
// Obsidian: black with a hexagon photo frame and ruled icon rows.

const obsidian: IdCardDesign = {
  id: "obsidian",
  name: "Obsidian",
  defaults: { primary: "#0b0b0b", secondary: "#ffffff" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, k.primary) +
      polygon(hexagonPoints(250, 150, 90), "none", `stroke="${k.secondary}" stroke-opacity="0.07" stroke-width="18"`) +
      logo(c.logo, 26, 44, { mark: k.secondary, textColor: k.secondary, taglineColor: "#9ca3af", maxWidth: 240 }) +
      pic(ctx, c, "hexagon", 94, 146, 62, { border: k.secondary, borderWidth: 3 }) +
      fitted(26, 246, c.name, 250, { size: 20, fill: k.secondary, bold: true, minSize: 12 }) +
      fitted(26, 264, c.role.toUpperCase(), 250, { size: 8, fill: "#9ca3af", letterSpacing: 1.4 }) +
      path("M26 272H274", "none", `stroke="#4b5563" stroke-width="0.8"`) +
      iconDetailRows(c, 26, 300, { color: "#d1d5db", textColor: k.secondary, rule: "#374151", maxY: 408 }) +
      fitted(26, 452, c.logo.orgName.toUpperCase(), 150, { size: 7, fill: "#9ca3af", bold: true, letterSpacing: 1 }) +
      (c.barcode ? barcode(c.barcode, 184, 438, 90, 18, k.secondary) : "") +
      path("M250 476L300 426", "none", `stroke="${k.secondary}" stroke-opacity="0.4" stroke-width="2"`)
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, k.primary),
      decor: polygon(hexagonPoints(150, 250, 170), "none", `stroke="${k.secondary}" stroke-opacity="0.05" stroke-width="26"`),
      textColor: k.secondary,
      mutedColor: "#d1d5db",
      accent: k.secondary,
    });
  },
};

// ---------------------------------------------------------------------------
// Op Art: black with bold white wave corners and a big serif-style title.

const opArt: IdCardDesign = {
  id: "op-art",
  name: "Op Art",
  defaults: { primary: "#111111", secondary: "#ffffff" },
  front(c, k, ctx) {
    return (
      roundedCard(k.primary) +
      waves(170, -10, 7, 12, 180, k.secondary) +
      waves(-40, 412, 7, 12, 180, k.secondary, true) +
      rect(34, 40, 150, 26, "none", `rx="13" stroke="${k.secondary}" stroke-width="1.4"`) +
      fitted(109, 58, c.logo.orgName.toUpperCase(), 136, { size: 9, fill: k.secondary, bold: true, anchor: "middle" }) +
      pic(ctx, c, "circle", W / 2, 158, 54, { border: k.secondary, borderWidth: 3 }) +
      fitted(W / 2, 268, c.name.toUpperCase(), 250, { size: 30, fill: k.secondary, bold: true, anchor: "middle", minSize: 13 }) +
      fitted(W / 2, 292, c.role.toUpperCase(), 230, { size: 11, fill: "#d4d4d4", anchor: "middle", letterSpacing: 1.5 }) +
      rows(idRows(c, dateRows(c)), 60, 330, { labelWidth: 70, maxWidth: 190, lineHeight: 16, size: 9, labelColor: "#a3a3a3", valueColor: k.secondary, maxY: 396 }).svg
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: roundedCard(k.primary),
      decor: waves(-40, 420, 5, 12, 180, k.secondary, true) + waves(170, -20, 4, 12, 180, k.secondary),
      textColor: k.secondary,
      mutedColor: "#d4d4d4",
      accent: k.secondary,
      bottom: 400,
    });
  },
};

// ---------------------------------------------------------------------------
// Crew Tape: black with a huge stacked title and a yellow tape banner for the role.

const crewTape: IdCardDesign = {
  id: "crew-tape",
  name: "Crew Tape",
  defaults: { primary: "#0a0a0a", secondary: "#f5d90a" },
  front(c, k, ctx) {
    const words = c.logo.orgName.toUpperCase().split(/\s+/);
    return (
      roundedCard(k.primary) +
      circle(40, 60, 60, "none", `stroke="#ffffff" stroke-width="6"`) +
      circle(40, 60, 30, "#ffffff") +
      circle(272, 448, 40, "none", `stroke="#ffffff" stroke-width="5"`) +
      fitted(112, 40, c.logo.tagline.toUpperCase(), 165, { size: 10, fill: "#ffffff", bold: true }) +
      fitted(150, 150, words[0] ?? "", 250, { size: 64, fill: "#ffffff", bold: true, anchor: "middle", minSize: 20 }) +
      fitted(150, 208, words.slice(1).join(" "), 250, { size: 64, fill: "#ffffff", bold: true, anchor: "middle", minSize: 20 }) +
      `<g transform="rotate(-8 150 244)">${rect(14, 226, 272, 36, k.secondary)}${fitted(150, 251, roleOrName(c), 250, { size: 17, fill: k.primary, bold: true, anchor: "middle", minSize: 9 })}</g>` +
      pic(ctx, c, "circle", 150, 322, 38, { border: "#ffffff", borderWidth: 3 }) +
      fitted(150, 386, c.name, 250, { size: 16, fill: "#ffffff", bold: true, anchor: "middle", minSize: 10 }) +
      fitted(150, 402, c.registrationNumber, 240, { size: 9, fill: "#a3a3a3", anchor: "middle" }) +
      (c.barcode ? barcode(c.barcode, 90, 412, 120, 18, "#ffffff") : "")
    );
  },
  back(c, k) {
    return (
      themedBack(c, {
        background: roundedCard(k.primary),
        textColor: "#ffffff",
        mutedColor: "#d4d4d4",
        accent: k.secondary,
        bottom: 410,
      }) +
      rect(60, 424, 180, 26, k.secondary, `rx="4"`) +
      fitted(150, 442, c.contact.website ?? c.logo.orgName, 170, { size: 10, fill: k.primary, bold: true, anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Proclaim: black with giant faint letters and a vertical name.

const proclaim: IdCardDesign = {
  id: "proclaim",
  name: "Proclaim",
  defaults: { primary: "#0c0c0c", secondary: "#f59e0b" },
  front(c, k, ctx) {
    const faint = c.logo.orgName.toUpperCase().replace(/\s+/g, "");
    let letters = "";
    for (let i = 0; i < 5; i++) letters += fitted(-10, 110 + i * 92, faint.slice(i * 3, i * 3 + 5) || faint, 360, { size: 110, fill: "#ffffff", bold: true, opacity: 0.05, minSize: 40 });
    return (
      roundedCard(k.primary) +
      letters +
      sideways(70, 440, c.name.toUpperCase(), 380, { size: 50, fill: "#ffffff", bold: true, minSize: 20 }) +
      sideways(100, 440, c.role.toUpperCase(), 300, { size: 12, fill: "#ffffff", letterSpacing: 6 }) +
      pic(ctx, c, "square", 214, 110, 52, { border: k.secondary, borderWidth: 3, h: 62 }) +
      rows(idRows(c, dateRows(c)), 160, 220, { labelWidth: 50, maxWidth: 124, lineHeight: 16, size: 8, labelColor: "#a3a3a3", valueColor: "#ffffff", maxY: 330 }).svg +
      logo(c.logo, 160, 430, { mark: k.secondary, textColor: "#ffffff", taglineColor: "#a3a3a3", maxWidth: 120, scale: 0.6 })
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: roundedCard(k.primary),
      textColor: "#ffffff",
      mutedColor: "#d4d4d4",
      accent: k.secondary,
    });
  },
};

// ---------------------------------------------------------------------------
// Soft Arc: white with bold indigo arcs and a QR code on the front.

const softArc: IdCardDesign = {
  id: "soft-arc",
  name: "Soft Arc",
  defaults: { primary: "#3b1fb8", secondary: "#10b981" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M0 330A170 170 0 0 1 170 476H110A110 110 0 0 0 0 390Z", k.primary) +
      path("M0 410A66 66 0 0 1 66 476H0Z", shade(k.primary, 0.3)) +
      circle(262, 60, 8, k.secondary) +
      fitted(274, 34, c.contact.website ?? "", 160, { size: 8, fill: MUTED, anchor: "end" }) +
      logo(c.logo, 30, 92, { mark: k.primary, textColor: k.primary, taglineColor: MUTED, maxWidth: 240, scale: 1.2 }) +
      pic(ctx, c, "circle", 76, 190, 44, { border: k.primary, borderWidth: 3 }) +
      fitted(136, 184, c.name, 150, { size: 17, fill: INK, bold: true, minSize: 10 }) +
      fitted(136, 202, c.role, 150, { size: 10, fill: k.primary, bold: true }) +
      rows(idRows(c, dateRows(c)), 30, 262, { labelWidth: 72, maxWidth: 240, lineHeight: 17, size: 9.5, labelColor: MUTED, valueColor: INK, boldLabels: true, upperLabels: false, maxY: 330 }).svg +
      qrOrNothing(c, 196, 360, 80, k.primary)
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, k.primary),
      decor: path("M300 0V150A150 150 0 0 1 150 0Z", shade(k.primary, 0.3)) + path("M0 476V360A116 116 0 0 1 116 476Z", tint(k.primary, 0.15)),
      textColor: "#ffffff",
      mutedColor: "#e0e7ff",
      accent: k.secondary,
      qrColor: k.primary,
    });
  },
};

// ---------------------------------------------------------------------------
// Zenith: light with a teal zigzag mark and a QR code in the corner.

const zenith: IdCardDesign = {
  id: "zenith",
  name: "Zenith",
  defaults: { primary: "#2bb5a8", secondary: "#e9f7f5" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, "#f8fafc") +
      polygon([[40, 60], [230, 60], [120, 190], [250, 190], [250, 250], [40, 250], [150, 120], [40, 120]], k.secondary) +
      fitted(30, 36, c.role, 150, { size: 8, fill: MUTED }) +
      fitted(30, 48, c.contact.email ?? "", 150, { size: 8, fill: MUTED }) +
      qrOrNothing(c, 214, 20, 66, INK) +
      pic(ctx, c, "square", 150, 170, 60, { border: "#ffffff", borderWidth: 4, h: 64 }) +
      polygon([[34, 280], [74, 280], [54, 304], [74, 304], [74, 316], [34, 316], [54, 292], [34, 292]], k.primary) +
      fitted(30, 350, c.name.toUpperCase(), 250, { size: 20, fill: INK, bold: true, letterSpacing: 1, minSize: 11 }) +
      fitted(30, 372, c.logo.orgName.toUpperCase(), 250, { size: 13, fill: MUTED, letterSpacing: 2 }) +
      rows(idRows(c, dateRows(c)), 30, 404, { labelWidth: 70, maxWidth: 240, lineHeight: 15, size: 8.5, labelColor: MUTED, valueColor: INK, upperLabels: false, maxY: 452 }).svg
    );
  },
  back(c, k) {
    return (
      rect(0, 0, W, H, k.primary) +
      polygon([[60, 330], [250, 330], [150, 430], [250, 430], [250, 476], [40, 476], [150, 376], [60, 376]], "#ffffff", `fill-opacity="0.9"`) +
      sideways(236, 300, c.logo.orgName.toUpperCase(), 280, { size: 26, fill: "#ffffff", bold: true, letterSpacing: 3 }) +
      sideways(262, 300, c.logo.tagline.toUpperCase(), 280, { size: 12, fill: "#ffffff", letterSpacing: 3, opacity: 0.8 }) +
      (c.qr ? rect(28, 30, 110, 110, "#ffffff", `rx="8"`) + qrCode(c.qr, 34, 36, 98, INK, "#ffffff") : "") +
      bullets(c.terms, 28, 168, 180, { style: "dot", bulletColor: "#ffffff", textColor: "#ffffff", size: 8, lineHeight: 10.5, gap: 6, maxY: 290 }).svg +
      signature(90, 318, 110, c.signatureLabel, "#ffffff")
    );
  },
};

// ---------------------------------------------------------------------------
// Conclave: a blue event badge with a bold role band (Delegate, Participant, Guest).

const conclave: IdCardDesign = {
  id: "conclave",
  name: "Conclave",
  defaults: { primary: "#0b3a8c", secondary: "#1d4ed8" },
  front(c, k, ctx) {
    const words = c.logo.tagline.toUpperCase().split(/\s+/);
    return (
      rect(0, 0, W, H, "#ffffff") +
      rect(0, 0, W, 330, ctx.linear([shade(k.primary, 0.3), k.secondary], [0, 0, 1, 1])) +
      circle(150, 196, 110, "none", `stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"`) +
      logo(c.logo, 26, 36, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#bfdbfe", maxWidth: 200, scale: 0.8 }) +
      (c.photo || c.hidePhoto ? pic(ctx, c, "circle", 236, 70, 34, { border: "#ffffff", borderWidth: 3 }) : "") +
      fitted(W / 2, 170, words.slice(0, 2).join(" "), 240, { size: 30, fill: "#ffffff", bold: true, anchor: "middle", minSize: 12 }) +
      fitted(W / 2, 200, words.slice(2, 4).join(" "), 240, { size: 20, fill: "#dbeafe", bold: true, anchor: "middle", minSize: 9 }) +
      fitted(W / 2, 252, words.slice(4).join(" ") || (c.validUntil ?? ""), 240, { size: 40, fill: "#ffffff", bold: true, anchor: "middle", minSize: 12 }) +
      fitted(W / 2, 306, c.name, 250, { size: 15, fill: "#ffffff", bold: true, anchor: "middle", minSize: 9 }) +
      rect(16, 342, W - 32, 110, "#ffffff", `rx="6" stroke="${tint(k.primary, 0.7)}" stroke-width="1.5"`) +
      fitted(W / 2, 406, roleOrName(c), 250, { size: 32, fill: k.secondary, anchor: "middle", minSize: 12 }) +
      fitted(W / 2, 432, c.registrationNumber, 250, { size: 9, fill: MUTED, anchor: "middle" })
    );
  },
  back(c, k, ctx) {
    return themedBack(c, {
      background: rect(0, 0, W, H, "#ffffff") + rect(0, 0, W, 20, ctx.linear([shade(k.primary, 0.3), k.secondary], [0, 0, 1, 0])),
      textColor: INK,
      mutedColor: MUTED,
      accent: k.secondary,
    });
  },
};

// ---------------------------------------------------------------------------
// Seminar: purple top with a stacked event title and a huge role on white.

const seminar: IdCardDesign = {
  id: "seminar",
  name: "Seminar",
  defaults: { primary: "#2e1f8f", secondary: "#facc15" },
  front(c, k, ctx) {
    const words = c.logo.tagline.toUpperCase().split(/\s+/);
    return (
      rect(0, 0, W, H, "#ffffff") +
      rect(0, 0, W, 318, ctx.linear([k.primary, tint(k.primary, 0.2)], [0, 0, 1, 1])) +
      polygon([[220, 0], [W, 0], [W, 60]], "#8b5cf6", `fill-opacity="0.6"`) +
      polygon([[250, 0], [W, 0], [W, 30]], "#c4b5fd", `fill-opacity="0.6"`) +
      fitted(W / 2, 44, c.logo.orgName, 250, { size: 9, fill: "#e0e7ff", anchor: "middle" }) +
      fitted(W / 2, 90, words.slice(0, 2).join(" "), 250, { size: 22, fill: k.secondary, bold: true, anchor: "middle", minSize: 10 }) +
      fitted(W / 2, 134, words.slice(2, 4).join(" ") || c.name.toUpperCase(), 250, { size: 40, fill: "#ffffff", bold: true, anchor: "middle", minSize: 14 }) +
      fitted(W / 2, 176, words.slice(4).join(" "), 250, { size: 40, fill: "#ffffff", bold: true, anchor: "middle", minSize: 14 }) +
      rect(W / 2 - 60, 196, 120, 20, "#ffffff", `rx="2"`) +
      fitted(W / 2, 210, "SEMINAR", 110, { size: 10, fill: k.primary, bold: true, anchor: "middle", letterSpacing: 3 }) +
      pic(ctx, c, "circle", W / 2, 262, 36, { border: "#ffffff", borderWidth: 3 }) +
      rect(14, 330, W - 28, 118, "#ffffff", `rx="8" stroke="#c7d2fe" stroke-width="2"`) +
      fitted(W / 2, 404, roleOrName(c), 260, { size: 44, fill: k.primary, bold: true, anchor: "middle", minSize: 14 }) +
      fitted(W / 2, 432, c.role ? c.name : c.registrationNumber, 250, { size: 10, fill: MUTED, anchor: "middle", bold: true }) +
      rect(14, 454, W - 28, 10, k.primary, `rx="3"`)
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, "#ffffff") + rect(0, H - 14, W, 14, k.primary),
      textColor: INK,
      mutedColor: MUTED,
      accent: k.primary,
      bottom: H - 26,
    });
  },
};

// ---------------------------------------------------------------------------
// Vision: magenta with concentric arcs and a condensed title; the role on a curved band.

const vision: IdCardDesign = {
  id: "vision",
  name: "Vision",
  defaults: { primary: "#b0169b", secondary: "#fde68a" },
  front(c, k, ctx) {
    let arcs = "";
    for (let i = 0; i < 6; i++) arcs += circle(150, -40, 120 + i * 36, "none", `stroke="#ffffff" stroke-opacity="0.08" stroke-width="10"`);
    const words = c.logo.tagline.split(/\s+/);
    return (
      rect(0, 0, W, H, ctx.linear([shade(k.primary, 0.2), tint(k.primary, 0.2)], [0, 0, 1, 1])) +
      arcs +
      logo(c.logo, W / 2, 40, { anchor: "middle", mark: "#ffffff", textColor: "#ffffff", taglineColor: "#fbcfe8", maxWidth: 200, scale: 0.6 }) +
      fitted(W / 2, 150, (words[0] ?? c.logo.orgName).toLowerCase(), 240, { size: 76, fill: k.secondary, bold: true, anchor: "middle", minSize: 20 }) +
      fitted(W / 2, 196, words.slice(1).join(" "), 240, { size: 32, fill: "#ffffff", bold: true, anchor: "middle", minSize: 12 }) +
      pic(ctx, c, "circle", W / 2, 258, 32, { border: k.secondary, borderWidth: 3 }) +
      fitted(W / 2, 312, c.name, 240, { size: 13, fill: "#ffffff", bold: true, anchor: "middle" }) +
      fitted(W / 2, 330, c.validUntil ?? c.registrationNumber, 240, { size: 9, fill: "#fbcfe8", anchor: "middle" }) +
      path("M0 370Q150 340 300 370V476H0Z", "#ffffff") +
      fitted(W / 2, 436, roleOrName(c), 270, { size: 50, fill: k.primary, bold: true, anchor: "middle", minSize: 14 })
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, k.primary),
      decor: circle(150, 520, 200, "#ffffff", `fill-opacity="0.06"`),
      textColor: "#ffffff",
      mutedColor: "#fbcfe8",
      accent: k.secondary,
      qrColor: k.primary,
    });
  },
};

// ---------------------------------------------------------------------------
// Spotlight: all-magenta event card with the role spelled out underneath.

const spotlight: IdCardDesign = {
  id: "spotlight",
  name: "Spotlight",
  defaults: { primary: "#c026d3", secondary: "#fef08a" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, "#ffffff") +
      rect(0, 0, W, 380, ctx.linear([shade(k.primary, 0.35), k.primary], [0, 0, 1, 1]), `rx="18"`) +
      bokeh(0, 0, W, 380, "#ffffff", 10, 21, 40) +
      logo(c.logo, W / 2, 40, { anchor: "middle", mark: "#ffffff", textColor: "#ffffff", taglineColor: "#f5d0fe", maxWidth: 220, scale: 0.6 }) +
      fitted(W / 2, 90, c.logo.orgName, 240, { size: 9, fill: "#f5d0fe", anchor: "middle" }) +
      pic(ctx, c, "circle", W / 2, 170, 58, { border: k.secondary, borderWidth: 4 }) +
      fitted(W / 2, 270, c.name, 250, { size: 26, fill: k.secondary, bold: true, anchor: "middle", minSize: 12 }) +
      fitted(W / 2, 294, c.logo.tagline, 250, { size: 12, fill: "#ffffff", italic: true, anchor: "middle" }) +
      rows(idRows(c, dateRows(c)), 70, 324, { labelWidth: 60, maxWidth: 170, lineHeight: 14, size: 8.5, labelColor: "#f5d0fe", valueColor: "#ffffff", maxY: 362 }).svg +
      fitted(W / 2, 444, roleOrName(c), 280, { size: 48, fill: k.primary, bold: true, anchor: "middle", minSize: 14 })
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, "#ffffff") + rect(0, 0, W, 16, k.primary),
      textColor: INK,
      mutedColor: MUTED,
      accent: k.primary,
    });
  },
};

// ---------------------------------------------------------------------------
// Wavelength: white with fine wave lines, a square photo, and a QR code.

const wavelength: IdCardDesign = {
  id: "wavelength",
  name: "Wavelength",
  defaults: { primary: "#1d4ed8", secondary: "#93c5fd" },
  front(c, k, ctx) {
    const rand = seeded(8);
    let lines = "";
    for (let i = 0; i < 9; i++) {
      const y = 260 + i * 22;
      lines += path(`M0 ${y}C${60 + rand() * 40} ${y - 30} ${160 + rand() * 40} ${y + 30} 300 ${y - 10}`, "none", `stroke="${k.secondary}" stroke-opacity="0.45" stroke-width="1"`);
    }
    return (
      rect(0, 0, W, H, "#ffffff") +
      lines +
      logo(c.logo, 30, 50, { mark: k.primary, textColor: k.primary, taglineColor: MUTED, maxWidth: 240, scale: 1.1 }) +
      pic(ctx, c, "square", 150, 170, 70, { border: tint(k.primary, 0.85), borderWidth: 4, h: 70 }) +
      fitted(W / 2, 276, c.name, 250, { size: 22, fill: INK, bold: true, anchor: "middle", minSize: 12 }) +
      fitted(W / 2, 296, c.role, 250, { size: 12, fill: k.primary, anchor: "middle" }) +
      rows(idRows(c, dateRows(c)), 34, 330, { labelWidth: 70, maxWidth: 150, lineHeight: 15, size: 8.5, labelColor: MUTED, valueColor: INK, upperLabels: false, maxY: 420 }).svg +
      qrOrNothing(c, 194, 318, 82, INK) +
      fitted(W / 2, 456, c.contact.website ?? c.contact.email ?? "", 250, { size: 9, fill: k.primary, anchor: "middle" })
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, "#ffffff") + path("M0 430C80 400 200 470 300 420V476H0Z", k.primary),
      textColor: INK,
      mutedColor: MUTED,
      accent: k.primary,
      bottom: 410,
    });
  },
};

// ---------------------------------------------------------------------------
// Campus: white with a blue header, a portrait photo, and a name band.

const campus: IdCardDesign = {
  id: "campus",
  name: "Campus",
  defaults: { primary: "#1e3a8a", secondary: "#f59e0b" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, "#ffffff") +
      rect(0, 0, W, 70, k.primary) +
      logo(c.logo, 22, 36, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#bfdbfe", maxWidth: 260, scale: 0.85 }) +
      pic(ctx, c, "square", W / 2, 180, 72, { border: tint(k.primary, 0.85), borderWidth: 4, h: 88 }) +
      rect(0, 290, W, 54, k.primary) +
      fitted(W / 2, 316, c.name.toUpperCase(), 270, { size: 18, fill: "#ffffff", bold: true, anchor: "middle", minSize: 10 }) +
      fitted(W / 2, 334, c.role.toUpperCase(), 270, { size: 9, fill: k.secondary, anchor: "middle", letterSpacing: 1 }) +
      rows(idRows(c, dateRows(c)), 40, 372, { labelWidth: 76, maxWidth: 220, lineHeight: 16, size: 9, labelColor: k.primary, valueColor: INK, boldLabels: true, upperLabels: false, maxY: 446 }).svg +
      rect(0, 466, W, 10, k.secondary)
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, k.primary),
      decor: path("M0 420C100 360 200 470 300 380", "none", `stroke="${k.secondary}" stroke-width="10"`) + path("M0 440C100 380 200 490 300 400", "none", `stroke="${k.secondary}" stroke-opacity="0.5" stroke-width="4"`),
      textColor: "#ffffff",
      mutedColor: "#dbeafe",
      accent: k.secondary,
      qrColor: k.primary,
      bottom: 380,
    });
  },
};

export const ID_CARD_DESIGNS_A: IdCardDesign[] = [
  obsidian,
  opArt,
  crewTape,
  proclaim,
  softArc,
  zenith,
  conclave,
  seminar,
  vision,
  spotlight,
  wavelength,
  campus,
];
