import { bokeh, seeded, sideways } from "./art.js";
import { contactRows, dateRows, H, idRows, INK, MUTED, pic, qrOrNothing, W, type IdCardContent, type IdCardDesign } from "./idCardKit.js";
import { roleOrName, roundedCard, themedBack, waves } from "./idCardsMoreA.js";
import { barcode, circle, fitted, logo, path, polygon, rect, rows, shade, text, tint, wrapText } from "./svg.js";

/** Rows of registration details in small type, e.g. ID / District / Issued. */
function details(c: IdCardContent, x: number, y: number, width: number, labelColor: string, valueColor: string, maxY: number) {
  return rows(idRows(c, dateRows(c)), x, y, { labelWidth: 64, maxWidth: width, lineHeight: 14.5, size: 8.5, labelColor, valueColor, upperLabels: false, maxY }).svg;
}

/** A city skyline silhouette along a baseline. */
function skyline(x: number, baseline: number, width: number, maxHeight: number, fill: string, seed = 4) {
  const rand = seeded(seed);
  let d = `M${x} ${baseline}`;
  let cx = x;
  while (cx < x + width) {
    const w = 8 + rand() * 16;
    const h = maxHeight * (0.3 + rand() * 0.7);
    d += `V${baseline - h}H${Math.min(cx + w, x + width)}`;
    cx += w;
  }
  d += `V${baseline}Z`;
  return path(d, fill);
}

// ---------------------------------------------------------------------------
// Engineer: blue with an orange chevron under the photo and a white name pill.

const engineer: IdCardDesign = {
  id: "engineer",
  name: "Engineer",
  defaults: { primary: "#1d3fcf", secondary: "#f97316" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, k.primary) +
      path(`M0 0H${W}V170L150 236L0 170Z`, "#ffffff") +
      path(`M0 170L150 236L300 170V196L150 262L0 196Z`, k.secondary) +
      logo(c.logo, 22, 38, { mark: k.primary, textColor: k.primary, taglineColor: MUTED, maxWidth: 256, scale: 0.85 }) +
      pic(ctx, c, "circle", W / 2, 150, 56, { border: k.secondary, borderWidth: 4 }) +
      fitted(W / 2, 296, c.name.toUpperCase(), 260, { size: 17, fill: "#ffffff", bold: true, anchor: "middle", minSize: 10 }) +
      (c.role ? rect(W / 2 - 70, 306, 140, 22, "#ffffff", `rx="11"`) + fitted(W / 2, 321, c.role.toUpperCase(), 126, { size: 10, fill: k.primary, bold: true, anchor: "middle", letterSpacing: 1 }) : "") +
      details(c, 44, 356, 220, "#bfdbfe", "#ffffff", 420) +
      contactRows(c, 44, 430, 220, k.secondary, "#ffffff", 440).svg +
      rect(0, H - 10, W, 10, k.secondary)
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, "#ffffff") + path(`M0 ${H - 60}L150 ${H - 20}L300 ${H - 60}V${H}H0Z`, k.primary) + path(`M0 ${H - 70}L150 ${H - 30}L300 ${H - 70}V${H - 58}L150 ${H - 18}L0 ${H - 58}Z`, k.secondary),
      textColor: INK,
      mutedColor: MUTED,
      accent: k.primary,
      bottom: H - 72,
    });
  },
};

// ---------------------------------------------------------------------------
// Onboard: deep blue with an orange block behind a large photo and a white name panel.

const onboard: IdCardDesign = {
  id: "onboard",
  name: "Onboard",
  defaults: { primary: "#12309c", secondary: "#f7931e" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, k.primary) +
      rect(0, 160, 60, 110, k.secondary) +
      rect(220, 160, 80, 110, k.secondary) +
      logo(c.logo, W / 2, 44, { anchor: "middle", mark: "#ffffff", textColor: "#ffffff", taglineColor: "#c7d2fe", maxWidth: 250 }) +
      pic(ctx, c, "square", W / 2, 196, 92, { border: k.primary, borderWidth: 0, h: 100 }) +
      path(`M20 290H280V420L220 ${H - 20}H20Z`, "#ffffff") +
      fitted(40, 324, c.name, 230, { size: 20, fill: k.primary, bold: true, minSize: 11 }) +
      fitted(40, 342, c.role, 230, { size: 10, fill: k.secondary, bold: true }) +
      details(c, 40, 370, 220, MUTED, INK, 440)
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, k.primary) + rect(0, H - 12, W, 12, k.secondary),
      textColor: "#ffffff",
      mutedColor: "#dbeafe",
      accent: k.secondary,
      qrColor: k.primary,
      bottom: H - 24,
    });
  },
};

// ---------------------------------------------------------------------------
// Aurora Badge: teal with a lime photo panel and a handwritten-feel name.

const auroraBadge: IdCardDesign = {
  id: "aurora-badge",
  name: "Aurora Badge",
  defaults: { primary: "#1f5f63", secondary: "#d9e021" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, k.primary) +
      rect(30, 50, 240, 240, k.secondary, `rx="26"`) +
      pic(ctx, c, "square", W / 2, 196, 92, { h: 94 }) +
      fitted(30, 336, c.name, 240, { size: 24, fill: "#ffffff", bold: true, minSize: 12 }) +
      fitted(30, 356, c.role, 240, { size: 11, fill: k.secondary, bold: true }) +
      details(c, 30, 384, 240, "#a7d3d3", "#ffffff", 430) +
      logo(c.logo, 270 - 150, 450, { mark: k.secondary, textColor: "#ffffff", taglineColor: "#a7d3d3", maxWidth: 150, scale: 0.7 })
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, k.primary),
      decor: rect(30, 30, 240, 416, "none", `rx="26" stroke="${k.secondary}" stroke-opacity="0.35" stroke-width="2"`),
      textColor: "#ffffff",
      mutedColor: "#d1e7e7",
      accent: k.secondary,
      qrColor: k.primary,
      bottom: H - 40,
    });
  },
};

// ---------------------------------------------------------------------------
// Redline: black with a monochrome photo, a red bar on the right, and a mark.

const redline: IdCardDesign = {
  id: "redline",
  name: "Redline",
  defaults: { primary: "#0d0d0d", secondary: "#ff3b1f" },
  front(c, k, ctx) {
    return (
      roundedCard(k.primary) +
      rect(24, 52, 252, 250, "#e5e7eb") +
      rect(212, 52, 64, 250, k.secondary) +
      pic(ctx, c, "square", 118, 177, 94, { h: 125 }) +
      rect(212, 52, 64, 250, k.secondary, `fill-opacity="0.85"`) +
      fitted(24, 336, c.name, 250, { size: 22, fill: "#ffffff", bold: true, minSize: 12 }) +
      fitted(24, 354, c.role, 250, { size: 10, fill: "#a3a3a3" }) +
      details(c, 24, 380, 250, "#737373", "#e5e5e5", 420) +
      path("M24 430l12 12-12 12h8l12-12-12-12Zm24 0l-12 12 12 12h-8l-12-12 12-12Z", k.secondary) +
      fitted(276, 448, c.contact.website ?? c.logo.orgName, 200, { size: 9, fill: "#d4d4d4", anchor: "end" })
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: roundedCard(k.primary) + rect(W - 36, 0, 36, H, k.secondary),
      textColor: "#ffffff",
      mutedColor: "#d4d4d4",
      accent: k.secondary,
    });
  },
};

// ---------------------------------------------------------------------------
// Talent: dark card with a colored frame, bokeh lights, and a white info footer.

const talent: IdCardDesign = {
  id: "talent",
  name: "Talent",
  defaults: { primary: "#1c1c1f", secondary: "#c043c9" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, k.secondary, `rx="20"`) +
      rect(12, 12, W - 24, H - 24, k.primary, `rx="12"`) +
      `<g clip-path="${ctx.clip(rect(12, 12, W - 24, 330, "#fff"))}">${bokeh(12, 180, W - 24, 160, "#2dd4bf", 14, 12, 22)}</g>` +
      logo(c.logo, W / 2, 60, { anchor: "middle", mark: "#38bdf8", textColor: "#ffffff", taglineColor: "#a1a1aa", maxWidth: 230, scale: 0.8 }) +
      pic(ctx, c, "circle", W / 2, 196, 60, { border: "#ffffff", borderWidth: 5 }) +
      rect(12, 342, W - 24, H - 354, "#e5e7eb", `rx="0"`) +
      fitted(30, 374, c.name, 240, { size: 17, fill: INK, bold: true, minSize: 10 }) +
      fitted(30, 390, c.role, 240, { size: 9, fill: shade(k.secondary, 0.2), bold: true }) +
      details(c, 30, 410, 240, MUTED, INK, 450)
    );
  },
  back(c, k, ctx) {
    return (
      rect(0, 0, W, H, k.secondary, `rx="20"`) +
      `<g clip-path="${ctx.clip(rect(12, 12, W - 24, H - 24, "#fff", `rx="12"`))}">` +
      themedBack(c, {
        background: rect(0, 0, W, H, k.primary),
        textColor: "#ffffff",
        mutedColor: "#d4d4d8",
        accent: tint(k.secondary, 0.2),
        bottom: H - 28,
      }) +
      `</g>`
    );
  },
};

// ---------------------------------------------------------------------------
// Kraft: black on orange with geometric quarter-circle tiles.

function kraftTiles(x: number, y: number, size: number, a: string, b: string) {
  const s = size;
  return (
    rect(x, y, s * 3, s * 2, b) +
    path(`M${x} ${y}h${s}a${s} ${s} 0 0 1 ${-s} ${s}Z`, a) +
    path(`M${x + s} ${y + s}a${s} ${s} 0 0 1 ${s} ${-s}v${s}Z`, a) +
    path(`M${x + 2 * s} ${y}h${s}v${s}a${s} ${s} 0 0 1 ${-s} ${-s}Z`, a) +
    path(`M${x} ${y + 2 * s}v${-s}a${s} ${s} 0 0 1 ${s} ${s}Z`, a) +
    path(`M${x + s} ${y + 2 * s}l${s / 2} ${-s}l${s / 2} ${s}Z`, a) +
    path(`M${x + 2 * s} ${y + s}h${s}v${s}a${s} ${s} 0 0 1 ${-s} ${-s}Z`, a)
  );
}

const kraft: IdCardDesign = {
  id: "kraft",
  name: "Kraft",
  defaults: { primary: "#1f1f1f", secondary: "#ff6a00" },
  front(c, k, ctx) {
    return (
      roundedCard(k.primary) +
      rect(W / 2 - 22, 18, 44, 8, "#3f3f3f", `rx="4"`) +
      pic(ctx, c, "circle", W / 2, 96, 44, { border: "#ffffff", borderWidth: 3 }) +
      fitted(W / 2, 166, c.name, 250, { size: 18, fill: k.secondary, bold: true, anchor: "middle", minSize: 10 }) +
      fitted(W / 2, 182, c.role, 250, { size: 9, fill: "#d4d4d4", anchor: "middle" }) +
      details(c, 56, 208, 200, "#a3a3a3", "#ffffff", 270) +
      `<g clip-path="${ctx.clip(rect(0, 0, W, H, "#fff", `rx="18"`))}">${kraftTiles(0, 296, 100, k.secondary, k.primary)}</g>`
    );
  },
  back(c, k) {
    return (
      roundedCard(k.primary) +
      rect(W / 2 - 22, 18, 44, 8, "#3f3f3f", `rx="4"`) +
      fitted(W / 2, 70, c.logo.tagline, 250, { size: 16, fill: k.secondary, bold: true, anchor: "middle", minSize: 10 }) +
      wrapText(c.terms.join(" "), 230, 8, 5)
        .map((line, i) => text(W / 2, 94 + i * 11, line, { size: 8, fill: "#d4d4d4", anchor: "middle" }))
        .join("") +
      (c.qr ? rect(W / 2 - 52, 170, 104, 104, "#ffffff", `rx="8"`) + qrOrNothing(c, W / 2 - 48, 174, 96) : "") +
      contactRows(c, 50, 310, 200, k.secondary, "#ffffff", 380).svg +
      logo(c.logo, W / 2, 440, { anchor: "middle", mark: k.secondary, textColor: "#ffffff", taglineColor: "#a3a3a3", maxWidth: 200, scale: 0.7 })
    );
  },
};

// ---------------------------------------------------------------------------
// Creator: white with a big orange photo panel and a sideways hashtag.

const creator: IdCardDesign = {
  id: "creator",
  name: "Creator",
  defaults: { primary: "#ff6b1a", secondary: "#1f2937" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M0 0H226V210C226 270 180 300 120 300H0Z", k.primary) +
      pic(ctx, c, "square", 113, 160, 96, { h: 130 }) +
      sideways(270, 250, `#${c.logo.orgName.replace(/\s+/g, "")}`, 230, { size: 22, fill: k.primary, bold: true, minSize: 10 }) +
      fitted(276, 346, c.name, 250, { size: 20, fill: k.secondary, bold: true, anchor: "end", minSize: 11 }) +
      fitted(276, 364, c.role, 250, { size: 9.5, fill: MUTED, anchor: "end" }) +
      fitted(276, 382, c.registrationNumber, 250, { size: 9.5, fill: k.secondary, bold: true, anchor: "end" }) +
      rect(24, 410, 42, 42, k.primary, `rx="10"`) +
      fitted(45, 436, c.logo.orgName.slice(0, 4).toLowerCase(), 36, { size: 12, fill: "#ffffff", bold: true, anchor: "middle" }) +
      rows([...c.fields, ...dateRows(c)], 90, 418, { labelWidth: 60, maxWidth: 186, lineHeight: 12, size: 8, labelColor: MUTED, valueColor: INK, upperLabels: false, maxY: 460 }).svg
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, "#ffffff") + path(`M${W} ${H}V400C${W - 50} 400 ${W - 70} 430 ${W - 70} ${H}Z`, k.primary),
      textColor: INK,
      mutedColor: MUTED,
      accent: k.primary,
    });
  },
};

// ---------------------------------------------------------------------------
// Angular: dark with bold orange angular shapes and a sideways brand name.

const angular: IdCardDesign = {
  id: "angular",
  name: "Angular",
  defaults: { primary: "#2a2d34", secondary: "#f26a2e" },
  front(c, k, ctx) {
    return (
      roundedCard(k.primary) +
      polygon([[0, 330], [110, 270], [150, 350], [110, 370], [150, 410], [230, 410], [260, H], [0, H]], k.secondary) +
      fitted(24, 58, c.name, 220, { size: 22, fill: "#ffffff", minSize: 11 }) +
      fitted(24, 76, c.role, 220, { size: 10, fill: "#d4d4d4" }) +
      fitted(24, 100, c.contact.website ?? c.contact.email ?? "", 200, { size: 9, fill: "#d4d4d4" }) +
      pic(ctx, c, "circle", 70, 160, 40, { border: k.secondary, borderWidth: 3 }) +
      details(c, 24, 226, 200, "#a3a3a3", "#ffffff", 282) +
      sideways(272, 330, c.logo.orgName, 280, { size: 28, fill: "#ffffff", bold: true, minSize: 12 }) +
      (c.barcode ? barcode(c.barcode, 170, 440, 100, 16, "#ffffff") : "")
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: roundedCard(k.secondary),
      decor: polygon([[0, 380], [90, 330], [130, 410], [220, 410], [250, H], [0, H]], k.primary, `fill-opacity="0.9"`),
      textColor: "#ffffff",
      mutedColor: "#fff7ed",
      accent: k.primary,
      qrColor: k.primary,
      bottom: 360,
    });
  },
};

// ---------------------------------------------------------------------------
// Skyline: lime with a dark city skyline and a two-tone name.

const skylineCard: IdCardDesign = {
  id: "skyline",
  name: "Skyline",
  defaults: { primary: "#c6f432", secondary: "#1f2421" },
  front(c, k, ctx) {
    const [first, ...rest] = c.name.split(/\s+/);
    return (
      roundedCard(k.primary) +
      polygon([[236, 20], [280, 20], [258, 50]], k.secondary) +
      polygon([[250, 34], [290, 34], [270, 62]], "none", `stroke="${k.secondary}" stroke-width="2"`) +
      fitted(24, 40, c.logo.orgName, 180, { size: 9, fill: k.secondary, bold: true }) +
      pic(ctx, c, "circle", 70, 126, 44, { border: k.secondary, borderWidth: 3 }) +
      fitted(128, 118, first ?? "", 150, { size: 24, fill: k.secondary, bold: true, italic: true, minSize: 12 }) +
      fitted(128, 142, rest.join(" "), 150, { size: 20, fill: k.secondary, bold: true, minSize: 10 }) +
      (c.role ? rect(128, 150, 90, 14, k.secondary, `rx="3"`) + fitted(173, 160, c.role.toUpperCase(), 84, { size: 7.5, fill: k.primary, bold: true, anchor: "middle" }) : "") +
      details(c, 28, 200, 240, shade(k.primary, 0.6), k.secondary, 290) +
      skyline(0, 440, W, 110, k.secondary) +
      rect(0, 440, W, 36, k.secondary) +
      fitted(276, 462, "ID CARD", 100, { size: 9, fill: k.primary, bold: true, anchor: "end", letterSpacing: 1 })
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: roundedCard(k.secondary) + skyline(0, H, W, 70, shade(k.secondary, 0.4), 9),
      textColor: "#ffffff",
      mutedColor: "#d9f99d",
      accent: k.primary,
      qrColor: k.secondary,
      bottom: 400,
    });
  },
};

// ---------------------------------------------------------------------------
// Press Orange: orange-on-black media badge with bold waves and a slanted title.

const pressOrange: IdCardDesign = {
  id: "press-orange",
  name: "Press Orange",
  defaults: { primary: "#1a1a1a", secondary: "#ff5a1f" },
  front(c, k, ctx) {
    return (
      roundedCard(k.primary) +
      waves(-40, 390, 6, 12, 200, k.secondary, true) +
      `<g transform="rotate(-8 150 150)">` +
      fitted(150, 140, c.logo.orgName.toUpperCase(), 250, { size: 42, fill: "#ffffff", bold: true, anchor: "middle", minSize: 14 }) +
      rect(70, 152, 160, 18, k.secondary, `rx="3"`) +
      fitted(150, 165, c.logo.tagline, 150, { size: 9, fill: "#ffffff", bold: true, anchor: "middle" }) +
      `</g>` +
      pic(ctx, c, "circle", W / 2, 248, 44, { border: k.secondary, borderWidth: 3 }) +
      fitted(W / 2, 320, c.name, 250, { size: 22, fill: "#ffffff", bold: true, anchor: "middle", minSize: 11 }) +
      fitted(W / 2, 340, roleOrName(c) === c.name.toUpperCase() ? c.registrationNumber : c.role.toUpperCase(), 250, { size: 10, fill: k.secondary, bold: true, anchor: "middle", letterSpacing: 1.5 }) +
      rect(20, 30, 20, 20, k.secondary, `rx="10"`)
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: roundedCard(k.primary),
      decor: waves(-40, 420, 5, 12, 200, k.secondary, true),
      textColor: "#ffffff",
      mutedColor: "#d4d4d4",
      accent: k.secondary,
      bottom: 400,
    });
  },
};

// ---------------------------------------------------------------------------
// Inauguration: deep red event pass with date/time/venue and a huge role at the bottom.

const inauguration: IdCardDesign = {
  id: "inauguration",
  name: "Inauguration",
  defaults: { primary: "#8b0a0a", secondary: "#e11d2a" },
  front(c, k, ctx) {
    const title = wrapText(c.logo.tagline.toUpperCase(), 250, 26, 3, true);
    let stripes = "";
    for (let i = 0; i < 4; i++) stripes += rect(0, 120 + i * 8, 12, 4, "#ffffff", `fill-opacity="0.8"`) + rect(W - 12, 300 + i * 8, 12, 4, "#ffffff", `fill-opacity="0.8"`);
    return (
      rect(0, 0, W, H, ctx.linear([k.secondary, shade(k.primary, 0.4)], [0, 0, 0.6, 1])) +
      stripes +
      logo(c.logo, 22, 40, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#fecaca", maxWidth: 170, scale: 0.7 }) +
      qrOrNothing(c, 232, 20, 48) +
      title.map((line, i) => fitted(W / 2, 150 + i * 30, line, 260, { size: 26, fill: "#ffffff", bold: true, anchor: "middle", minSize: 12 })).join("") +
      (c.validUntil ? fitted(W / 2, 150 + title.length * 30 + 10, `Valid until ${c.validUntil}`, 250, { size: 11, fill: "#ffffff", anchor: "middle" }) : "") +
      pic(ctx, c, "circle", 70, 290, 34, { border: "#ffffff", borderWidth: 2 }) +
      fitted(116, 284, c.name, 164, { size: 15, fill: "#ffffff", bold: true, minSize: 9 }) +
      fitted(116, 302, c.registrationNumber, 164, { size: 9, fill: "#fecaca" }) +
      rect(0, 350, W, 10, k.secondary) +
      rect(0, 360, W, H - 360, shade(k.primary, 0.3)) +
      fitted(W / 2, 438, roleOrName(c), 270, { size: 58, fill: "#e5e7eb", bold: true, anchor: "middle", minSize: 16 })
    );
  },
  back(c, k) {
    return themedBack(c, {
      background: rect(0, 0, W, H, shade(k.primary, 0.3)) + rect(0, 0, W, 12, k.secondary),
      textColor: "#ffffff",
      mutedColor: "#fecaca",
      accent: tint(k.secondary, 0.3),
      qrColor: k.primary,
    });
  },
};

// ---------------------------------------------------------------------------
// Nexus: black-to-red with a bold angular mark and a red glow at the bottom.

const nexus: IdCardDesign = {
  id: "nexus",
  name: "Nexus",
  defaults: { primary: "#0e0e10", secondary: "#e3122d" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, ctx.linear([k.primary, shade(k.secondary, 0.35)], [0, 0.45, 0, 1])) +
      polygon([[0, H], [150, 380], [W, H]], k.secondary, `fill-opacity="0.35"`) +
      polygon([[40, H], [150, 410], [260, H]], k.secondary, `fill-opacity="0.5"`) +
      fitted(24, 34, c.logo.orgName.toUpperCase(), 200, { size: 7, fill: "#a1a1aa", letterSpacing: 1 }) +
      polygon([[90, 70], [150, 70], [140, 92], [175, 92], [195, 70], [220, 70], [150, 150], [165, 118], [130, 118]], k.secondary) +
      pic(ctx, c, "circle", W / 2, 206, 42, { border: k.secondary, borderWidth: 3 }) +
      fitted(W / 2, 278, c.name, 250, { size: 20, fill: "#ffffff", bold: true, anchor: "middle", minSize: 11 }) +
      fitted(W / 2, 296, c.role, 250, { size: 10, fill: "#fca5a5", anchor: "middle" }) +
      details(c, 60, 326, 190, "#a1a1aa", "#ffffff", 380)
    );
  },
  back(c, k, ctx) {
    return themedBack(c, {
      background: rect(0, 0, W, H, ctx.linear([k.primary, shade(k.secondary, 0.4)], [0, 0.5, 0, 1])),
      textColor: "#ffffff",
      mutedColor: "#e4e4e7",
      accent: k.secondary,
    });
  },
};

export const ID_CARD_DESIGNS_B: IdCardDesign[] = [
  engineer,
  onboard,
  auroraBadge,
  redline,
  talent,
  kraft,
  creator,
  angular,
  skylineCard,
  pressOrange,
  inauguration,
  nexus,
];


