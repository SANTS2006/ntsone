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
import {
  contactRows,
  dateRows,
  H,
  idRows,
  INK,
  MUTED,
  pic,
  qrOrNothing,
  W,
  type DesignColors,
  type IdCardContent,
  type IdCardDesign,
} from "./idCardKit.js";

// ---------------------------------------------------------------------------
// Aurora: orange and blue waves, round photo, two-tone name.

export const aurora: IdCardDesign = {
  id: "aurora",
  name: "Aurora",
  defaults: { primary: "#1f5fbf", secondary: "#f7931e" },
  front(c, k, ctx) {
    const hot = mix(k.secondary, "#ef4136", 0.75);
    const warm = ctx.linear([k.secondary, hot], [0, 0, 1, 0.4]);
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M170 0H300V262C288 214 266 176 236 148C206 120 184 66 170 0Z", k.primary) +
      path("M0 0H282C302 64 290 124 248 152C206 180 150 170 110 150C70 130 32 138 0 168Z", warm) +
      path("M0 150C34 124 76 118 112 136C72 150 34 176 0 210Z", k.primary) +
      logo(c.logo, W / 2, 44, { anchor: "middle", mark: "#ffffff", textColor: "#ffffff", taglineColor: "#ffffff", maxWidth: 220 }) +
      pic(ctx, c, "circle", 132, 178, 56, { border: "#ffffff", borderWidth: 6 }) +
      twoToneName(W / 2, 294, c.name, 250, { size: 24, first: INK, last: k.primary, upper: true }) +
      fitted(W / 2, 314, c.role.toUpperCase(), 240, { size: 12, fill: INK, anchor: "middle", letterSpacing: 1 }) +
      rows(idRows(c), 58, 344, { labelWidth: 66, maxWidth: 200, lineHeight: 17, size: 10.5, labelColor: INK, valueColor: INK, maxY: 425 }).svg +
      path("M0 440C70 418 150 424 220 444C252 452 280 452 300 444V476H0Z", k.primary) +
      path("M118 476C178 448 250 440 300 454V476Z", warm)
    );
  },
  back(c, k, ctx) {
    const hot = mix(k.secondary, "#ef4136", 0.75);
    const warm = ctx.linear([k.secondary, hot], [0, 0, 1, 0.4]);
    const list = bullets(c.terms, 40, 218, 226, { style: "dot", bulletColor: hot, textColor: MUTED, maxY: 350 });
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M150 0H300V58C254 38 204 20 150 0Z", k.primary) +
      path("M0 0H214C160 26 92 46 0 62Z", warm) +
      logo(c.logo, W / 2, 100, { anchor: "middle", mark: k.secondary, textColor: INK, taglineColor: hot, maxWidth: 230 }) +
      text(40, 160, "TERMS", { size: 17, fill: INK, bold: true }) +
      text(40, 181, "AND CONDITIONS :", { size: 17, fill: INK, bold: true }) +
      rect(40, 191, 44, 4, warm) +
      list.svg +
      qrOrNothing(c, 38, 366, 58) +
      signature(226, 410, 90, c.signatureLabel, INK) +
      path("M0 440C70 418 150 424 220 444C252 452 280 452 300 444V476H0Z", k.primary) +
      path("M118 476C178 448 250 440 300 454V476Z", warm)
    );
  },
};

// ---------------------------------------------------------------------------
// Chevron: navy with red and yellow chevrons, hexagon photo.

const NAVY = "#22304a";

function chevronBand(y: number, depth: number, thickness: number, fill: string) {
  return polygon(
    [
      [0, y],
      [W / 2, y + depth],
      [W, y],
      [W, y + thickness],
      [W / 2, y + depth + thickness],
      [0, y + thickness],
    ],
    fill,
  );
}

export const chevron: IdCardDesign = {
  id: "chevron",
  name: "Chevron",
  defaults: { primary: "#ef233c", secondary: "#fdb827" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, "#ffffff") +
      logo(c.logo, W / 2, 40, { anchor: "middle", mark: k.primary, textColor: NAVY, taglineColor: MUTED, maxWidth: 230 }) +
      polygon([[0, 226], [W / 2, 286], [W, 226], [W, H], [0, H]], NAVY) +
      chevronBand(185, 60, 25, k.primary) +
      chevronBand(210, 60, 16, k.secondary) +
      pic(ctx, c, "hexagon", W / 2, 176, 64, { border: k.secondary, borderWidth: 7 }) +
      twoToneName(W / 2, 324, c.name, 250, { size: 23, first: "#ffffff", last: "#ffffff", upper: true }) +
      fitted(W / 2, 344, c.role.toUpperCase(), 240, { size: 12, fill: "#ffffff", anchor: "middle", letterSpacing: 1, opacity: 0.9 }) +
      rows(idRows(c), 62, 376, { labelWidth: 64, maxWidth: 190, lineHeight: 17, size: 10.5, labelColor: "#ffffff", valueColor: "#ffffff", maxY: 455 }).svg
    );
  },
  back(c, k) {
    const list = bullets(c.terms, 34, 122, 232, { style: "dot", bulletColor: k.secondary, textColor: "#ffffff", maxY: 262 });
    return (
      rect(0, 0, W, H, "#ffffff") +
      polygon([[0, 0], [W, 0], [W, 300], [W / 2, 360], [0, 300]], NAVY) +
      chevronBand(300, 60, 22, k.primary) +
      chevronBand(322, 60, 14, k.secondary) +
      text(34, 60, "TERMS", { size: 17, fill: k.secondary, bold: true }) +
      text(34, 81, "AND CONDITIONS :", { size: 17, fill: k.secondary, bold: true }) +
      rect(34, 92, 50, 4, k.primary) +
      list.svg +
      (c.qr ? qrOrNothing(c, 232, 404, 50, NAVY) : "") +
      logo(c.logo, c.qr ? 24 : W / 2, 438, { anchor: c.qr ? "start" : "middle", mark: k.primary, textColor: NAVY, taglineColor: MUTED, maxWidth: c.qr ? 196 : 240 })
    );
  },
};

// ---------------------------------------------------------------------------
// Noir: charcoal top with an orange swoosh.

const CHARCOAL = "#2b2b2e";

export const noir: IdCardDesign = {
  id: "noir",
  name: "Noir",
  defaults: { primary: "#f39c12", secondary: "#e8590c" },
  front(c, k, ctx) {
    const swoosh = ctx.linear([k.primary, k.secondary], [0, 0, 1, 0]);
    const details = rows([...idRows(c)], 40, 292, { labelWidth: 64, maxWidth: 225, lineHeight: 19, size: 11, labelColor: INK, valueColor: INK, maxY: 380 });
    const dates = rows(dateRows(c), 40, Math.max(details.y + 8, 404), {
      labelWidth: 64,
      maxWidth: 225,
      lineHeight: 18,
      size: 11,
      labelColor: k.secondary,
      valueColor: k.secondary,
      boldLabels: true,
      upperLabels: false,
    });
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M0 0H300V204C250 178 200 202 150 228C100 254 50 252 0 232Z", CHARCOAL) +
      path("M0 232C50 252 100 254 150 228C200 202 250 178 300 204V230C250 204 200 228 150 254C100 278 50 272 0 252Z", swoosh) +
      path("M0 258C50 276 100 282 150 260C200 236 250 214 300 236V244C250 224 200 246 150 268C100 290 50 284 0 266Z", k.primary, `fill-opacity="0.45"`) +
      pic(ctx, c, "circle", W / 2, 92, 52, { border: k.primary, borderWidth: 5 }) +
      twoToneName(W / 2, 180, c.name, 250, { size: 23, first: "#ffffff", last: k.primary, lastBold: true }) +
      fitted(W / 2, 199, c.role, 230, { size: 12, fill: "#ffffff", anchor: "middle", opacity: 0.9 }) +
      details.svg +
      dates.svg +
      rect(0, 468, W, 8, swoosh)
    );
  },
  back(c, k, ctx) {
    const swoosh = ctx.linear([k.primary, k.secondary], [0, 0, 1, 0]);
    const qrTop = 190;
    const listTop = c.qr ? 290 : 200;
    const list = bullets(c.terms, 36, listTop, 230, { style: "dot", bulletColor: k.primary, textColor: MUTED, size: 9, lineHeight: 12, maxLinesEach: 2, maxY: 350 });
    const contact = contactRows(c, 34, Math.max(list.y + 4, 372), 232, k.secondary, INK, 410);
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M0 0H300V150C240 124 180 160 120 176C70 190 30 184 0 172Z", CHARCOAL) +
      path("M0 172C30 184 70 190 120 176C180 160 240 124 300 150V172C240 148 180 182 120 198C70 212 30 206 0 194Z", swoosh) +
      logo(c.logo, W / 2, 72, { anchor: "middle", mark: k.primary, textColor: "#ffffff", taglineColor: "#d1d5db", maxWidth: 230 }) +
      (c.qr ? qrOrNothing(c, W / 2 - 40, qrTop, 80, CHARCOAL) : "") +
      list.svg +
      contact.svg +
      signature(226, 450, 90, c.signatureLabel, INK)
    );
  },
};

// ---------------------------------------------------------------------------
// Sunrise: golden waves, photo beside the logo, QR on the front.

export const sunrise: IdCardDesign = {
  id: "sunrise",
  name: "Sunrise",
  defaults: { primary: "#f59e0b", secondary: "#fcd34d" },
  front(c, k, ctx) {
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M0 0H300V150C250 122 200 176 150 172C100 168 60 132 0 154Z", k.primary) +
      path("M0 154C60 132 100 168 150 172C200 176 250 122 300 150V168C250 142 200 196 150 190C100 186 60 152 0 172Z", k.secondary, `fill-opacity="0.8"`) +
      pic(ctx, c, "circle", 86, 94, 52, { border: "#ffffff", borderWidth: 5 }) +
      logo(c.logo, 156, 94, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#ffffff", maxWidth: 132 }) +
      fitted(34, 232, c.name, 236, { size: 23, fill: INK, bold: true, minSize: 14 }) +
      fitted(34, 251, c.role, 236, { size: 12, fill: shade(k.primary, 0.1) }) +
      rows([...idRows(c), ...dateRows(c)], 34, 286, { labelWidth: 80, maxWidth: c.qr ? 186 : 236, lineHeight: 18, size: 10.5, labelColor: INK, valueColor: MUTED, boldLabels: true, maxY: 400 }).svg +
      qrOrNothing(c, 222, 370, 56, shade(k.primary, 0.55)) +
      path("M0 448C60 428 120 468 180 452C230 440 270 438 300 448V476H0Z", k.primary) +
      path("M0 458C70 444 130 476 200 462C240 454 280 452 300 458V476H0Z", k.secondary, `fill-opacity="0.7"`)
    );
  },
  back(c, k, ctx) {
    const list = bullets(c.terms, 40, 64, 226, { style: "square", bulletColor: k.primary, textColor: MUTED, maxY: 210 });
    return (
      rect(0, 0, W, H, "#ffffff") +
      list.svg +
      signature(210, 262, 110, c.signatureLabel, INK) +
      path("M0 318C70 290 130 346 200 322C240 308 270 302 300 312V476H0Z", k.secondary, `fill-opacity="0.75"`) +
      path("M0 336C70 306 130 360 200 338C240 324 270 318 300 328V476H0Z", ctx.linear([k.primary, shade(k.primary, 0.12)], [0, 0, 0, 1])) +
      logo(c.logo, W / 2, 408, { anchor: "middle", scale: 1.25, mark: "#ffffff", textColor: "#ffffff", taglineColor: "#ffffff", maxWidth: 250 })
    );
  },
};

// ---------------------------------------------------------------------------
// Crimson: red header with a centered photo and a date panel.

export const crimson: IdCardDesign = {
  id: "crimson",
  name: "Crimson",
  defaults: { primary: "#dc2626", secondary: "#991b1b" },
  front(c, k, ctx) {
    const dates = dateRows(c);
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M0 0H300V122C236 162 186 172 150 172C114 172 64 162 0 122Z", ctx.linear([k.primary, k.secondary], [0, 0, 1, 1])) +
      path("M0 70C60 96 110 60 170 84C220 104 260 80 300 64V110C250 130 210 112 160 96C100 76 50 110 0 94Z", "#ffffff", `fill-opacity="0.08"`) +
      logo(c.logo, W / 2, 26, { anchor: "middle", scale: 0.8, mark: "#ffffff", textColor: "#ffffff", taglineColor: "#ffffff", maxWidth: 220 }) +
      pic(ctx, c, "circle", W / 2, 116, 56, { border: "#ffffff", borderWidth: 6 }) +
      fitted(W / 2, 216, c.name, 250, { size: 23, fill: "#374151", bold: true, anchor: "middle", minSize: 14 }) +
      fitted(W / 2, 235, c.role, 230, { size: 12, fill: k.primary, anchor: "middle", italic: true }) +
      rows(idRows(c), 64, 268, { labelWidth: 70, maxWidth: 190, lineHeight: 18, size: 10.5, labelColor: "#374151", valueColor: MUTED, boldLabels: true, maxY: 350 }).svg +
      (dates.length
        ? rect(W / 2 - 82, 370, 164, 22 + dates.length * 15, "#f1f1f3", `rx="3"`) +
          rows(dates, W / 2 - 68, 390, { labelWidth: 62, maxWidth: 140, lineHeight: 15, size: 10, labelColor: k.primary, valueColor: k.primary, boldLabels: true, upperLabels: false }).svg
        : "") +
      rect(0, 470, W, 6, k.primary)
    );
  },
  back(c, k, ctx) {
    const list = bullets(c.terms, 36, c.qr ? 146 : 60, 230, { style: "square", bulletColor: k.primary, textColor: MUTED, maxY: 270 });
    return (
      rect(0, 0, W, H, "#ffffff") +
      qrOrNothing(c, 34, 34, 70, shade(k.primary, 0.5)) +
      (c.qr ? signature(208, 88, 100, c.signatureLabel, INK) : signature(W / 2, 300, 120, c.signatureLabel, INK)) +
      list.svg +
      path("M0 330C60 364 112 364 150 330C188 364 240 364 300 330V476H0Z", ctx.linear([k.primary, k.secondary], [0, 0, 1, 1])) +
      logo(c.logo, W / 2, 414, { anchor: "middle", scale: 1.25, mark: "#ffffff", textColor: "#ffffff", taglineColor: "#ffffff", maxWidth: 250 })
    );
  },
};

// ---------------------------------------------------------------------------
// Executive: deep navy with a large photo and lime accents.

function dotGrid(x: number, y: number, cols: number, rowsCount: number, color: string) {
  let out = "";
  for (let r = 0; r < rowsCount; r++) for (let col = 0; col < cols; col++) out += circle(x + col * 8, y + r * 8, 1.6, color);
  return out;
}

export const executive: IdCardDesign = {
  id: "executive",
  name: "Executive",
  defaults: { primary: "#0d2b6b", secondary: "#c6d82b" },
  front(c, k, ctx) {
    const light = tint(k.primary, 0.14);
    return (
      rect(0, 0, W, H, k.primary) +
      polygon([[170, 0], [W, 0], [W, 160]], light, `fill-opacity="0.6"`) +
      polygon([[0, 290], [130, H], [0, H]], light, `fill-opacity="0.6"`) +
      polygon([[210, H], [W, 360], [W, H]], shade(k.primary, 0.25)) +
      rect(20, 26, 4, 44, k.secondary) +
      rect(276, 400, 4, 50, k.secondary) +
      dotGrid(236, 34, 4, 4, k.secondary) +
      dotGrid(24, 420, 4, 3, k.secondary) +
      logo(c.logo, 34, 48, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#dbe4ff", maxWidth: 190 }) +
      pic(ctx, c, "circle", W / 2, 188, 78, { border: tint(k.primary, 0.3), borderWidth: 8 }) +
      fitted(W / 2, 314, c.name, 256, { size: 27, fill: "#ffffff", bold: true, anchor: "middle", minSize: 15 }) +
      fitted(W / 2, 338, c.role.toUpperCase(), 230, { size: 12, fill: "#ffffff", anchor: "middle", letterSpacing: 1.5 }) +
      rect(W / 2 - 75, 347, 150, 2, k.secondary) +
      (c.registrationNumber
        ? fitted(W / 2, 372, `ID: ${c.registrationNumber}`, 230, { size: 10.5, fill: "#ffffff", anchor: "middle", opacity: 0.85 })
        : "")
    );
  },
  back(c, k) {
    const details = rows([...c.fields, ...dateRows(c)], 30, 118, { labelWidth: 76, maxWidth: 240, lineHeight: 17, size: 10, labelColor: k.primary, valueColor: MUTED, boldLabels: true, upperLabels: false, maxY: 200 });
    const contact = contactRows(c, 30, Math.max(details.y + 8, 140), 240, k.primary, INK, 300);
    const note = c.terms[0] ? wrapText(c.terms[0], 240, 8, 3) : [];
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M186 0H300V150C270 112 232 60 186 0Z", k.primary) +
      path("M230 0H300V90C282 64 258 32 230 0Z", tint(k.primary, 0.3)) +
      logo(c.logo, 30, 62, { mark: k.primary, textColor: k.primary, taglineColor: MUTED, maxWidth: 170 }) +
      details.svg +
      contact.svg +
      note.map((line, i) => text(30, 330 + i * 11, line, { size: 8, fill: MUTED })).join("") +
      path("M0 392C80 372 180 414 300 376V476H0Z", k.primary) +
      path("M0 380C90 360 170 396 300 360V372C180 408 90 372 0 392Z", tint(k.primary, 0.35)) +
      (c.qr ? qrOrNothing(c, 30, 396, 58, k.primary) : "") +
      dotGrid(252, 408, 3, 3, k.secondary) +
      (c.contact.website
        ? fitted(270, 462, c.contact.website, 170, { size: 9, fill: "#ffffff", anchor: "end", bold: true })
        : "")
    );
  },
};

// ---------------------------------------------------------------------------
// Prism: navy and cyan geometry, square photo, name pill.

export const prism: IdCardDesign = {
  id: "prism",
  name: "Prism",
  defaults: { primary: "#0f2847", secondary: "#1ec8e7" },
  front(c, k, ctx) {
    const lines = [...(c.registrationNumber ? [{ label: "ID", value: c.registrationNumber }] : []), ...dateRows(c)];
    const nameFit = fitted(W / 2, 330, c.name.toUpperCase(), 170, { size: 16, fill: "#ffffff", bold: true, anchor: "middle", minSize: 10 });
    return (
      rect(0, 0, W, H, "#ffffff") +
      polygon([[0, 0], [W, 0], [W, 232], [W / 2, 304], [0, 232]], k.primary) +
      polygon([[0, 118], [W / 2, 196], [W, 118], [W, 148], [W / 2, 226], [0, 148]], tint(k.primary, 0.12)) +
      polygon([[196, 0], [236, 0], [W, 64], [W, 104]], k.secondary, `fill-opacity="0.9"`) +
      polygon([[0, 176], [0, 206], [40, 246], [40, 216]], k.secondary, `fill-opacity="0.9"`) +
      logo(c.logo, 28, 42, { mark: k.secondary, textColor: "#ffffff", taglineColor: "#cfe9f5", maxWidth: 170 }) +
      pic(ctx, c, "square", W / 2, 172, 58, { border: "#ffffff", borderWidth: 5, h: 68 }) +
      rect(W / 2 - 96, 310, 192, 30, k.primary, `rx="15"`) +
      nameFit +
      (c.role
        ? rect(W / 2 - 70, 348, 140, 20, k.secondary, `rx="10"`) +
          fitted(W / 2, 362, c.role.toUpperCase(), 124, { size: 9.5, fill: "#ffffff", bold: true, anchor: "middle", letterSpacing: 0.8 })
        : "") +
      qrOrNothing(c, 24, 390, 60, k.primary) +
      rows(lines, c.qr ? 96 : 40, 406, { labelWidth: 62, maxWidth: c.qr ? 150 : 210, lineHeight: 16, size: 10, labelColor: k.primary, valueColor: k.primary, boldLabels: true, upperLabels: false }).svg +
      polygon([[238, H], [W, 414], [W, H]], k.primary) +
      polygon([[206, H], [W, 382], [W, 398], [222, H]], k.secondary)
    );
  },
  back(c, k) {
    const list = bullets(c.terms, 28, 134, 244, { style: "number", bulletColor: k.secondary, textColor: MUTED, size: 9, lineHeight: 11.5, gap: 12, maxLinesEach: 3, maxY: 290 });
    const details = rows(c.fields, 28, Math.max(list.y + 4, 250), { labelWidth: 76, maxWidth: 244, lineHeight: 15, size: 9.5, labelColor: k.primary, valueColor: MUTED, boldLabels: true, upperLabels: false, maxY: 320 });
    const contact = contactRows(c, 28, Math.max(details.y + 6, 300), 244, k.primary, INK, 440);
    return (
      rect(0, 0, W, H, "#ffffff") +
      polygon([[0, 0], [70, 0], [0, 70]], k.secondary) +
      polygon([[0, 0], [36, 0], [0, 36]], k.primary) +
      logo(c.logo, W / 2, 50, { anchor: "middle", mark: k.primary, textColor: k.primary, taglineColor: MUTED, maxWidth: 220 }) +
      rect(W / 2 - 94, 86, 188, 24, k.primary, `rx="12"`) +
      text(W / 2, 102, "TERMS & CONDITIONS", { size: 10.5, fill: "#ffffff", bold: true, anchor: "middle", letterSpacing: 0.5 }) +
      list.svg +
      details.svg +
      contact.svg +
      polygon([[238, H], [W, 414], [W, H]], k.primary) +
      polygon([[206, H], [W, 382], [W, 398], [222, H]], k.secondary)
    );
  },
};

// ---------------------------------------------------------------------------
// Business: charcoal and red, ID number bar and barcode.

export const business: IdCardDesign = {
  id: "business",
  name: "Business",
  defaults: { primary: "#e3173e", secondary: "#23232b" },
  front(c, k, ctx) {
    const idLabel = "ID NO";
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M0 0H300V196C240 180 190 212 150 212C110 212 60 180 0 196Z", k.secondary) +
      path("M0 196C60 180 110 212 150 212C190 212 240 180 300 196V222C240 206 190 240 150 240C110 240 60 206 0 222Z", k.primary) +
      path("M0 210C60 194 110 226 150 226C190 226 240 194 300 210", "none", `stroke="#ffffff" stroke-width="1.4" stroke-opacity="0.75"`) +
      logo(c.logo, W / 2, 36, { anchor: "middle", mark: k.primary, textColor: "#ffffff", taglineColor: "#d1d5db", maxWidth: 230 }) +
      pic(ctx, c, "circle", W / 2, 128, 56, { border: "#ffffff", borderWidth: 5 }) +
      twoToneName(W / 2, 280, c.name, 250, { size: 24, first: k.primary, last: k.secondary, upper: true }) +
      fitted(W / 2, 299, c.role.toUpperCase(), 240, { size: 12, fill: k.secondary, anchor: "middle", letterSpacing: 1 }) +
      (c.registrationNumber
        ? rect(0, 318, 96, 30, k.primary) +
          text(48, 338, idLabel, { size: 12, fill: "#ffffff", bold: true, anchor: "middle" }) +
          rect(96, 318, 204, 30, k.secondary) +
          fitted(198, 338, c.registrationNumber, 190, { size: 13, fill: "#ffffff", bold: true, anchor: "middle", minSize: 9 })
        : rect(0, 330, W, 6, k.primary)) +
      rows(c.fields, 50, 374, { labelWidth: 76, maxWidth: 200, lineHeight: 15, size: 9.5, labelColor: k.secondary, valueColor: MUTED, upperLabels: false, boldLabels: true, maxY: c.barcode ? 392 : 440 }).svg +
      (c.barcode ? rect(54, 410, 192, 44, "#ffffff") + barcode(c.barcode, 62, 412, 176, 38, k.secondary) : "")
    );
  },
  back(c, k) {
    const details = rows(
      [...(c.role ? [{ label: "Role", value: c.role }] : []), ...c.fields],
      40,
      150,
      { labelWidth: 84, maxWidth: 230, lineHeight: 19, size: 10.5, labelColor: MUTED, valueColor: INK, upperLabels: false, maxY: 250 },
    );
    const dates = dateRows(c);
    let y = Math.max(details.y + 12, 272);
    const dateMarkup = dates
      .map((d) => {
        const line = text(W / 2, y, `${d.label}: ${d.value}`, { size: 11, fill: k.primary, anchor: "middle", bold: true });
        y += 17;
        return line;
      })
      .join("");
    const footer = [c.contact.address, [c.contact.phone, c.contact.email].filter(Boolean).join("   ")].filter(Boolean) as string[];
    return (
      rect(0, 0, W, H, "#ffffff") +
      path("M0 0H300V70C240 96 196 62 150 82C104 102 60 72 0 92Z", k.secondary) +
      path("M0 92C60 72 104 102 150 82C196 62 240 96 300 70V88C240 114 196 80 150 100C104 120 60 90 0 110Z", k.primary) +
      logo(c.logo, W / 2, 40, { anchor: "middle", mark: k.primary, textColor: "#ffffff", taglineColor: "#d1d5db", maxWidth: 230 }) +
      details.svg +
      dateMarkup +
      (c.qr ? qrOrNothing(c, 40, 336, 60, k.secondary) + signature(206, 380, 100, c.signatureLabel, INK) : signature(W / 2, 380, 120, c.signatureLabel, INK)) +
      rect(0, 426, W, 50, k.primary) +
      footer.map((line, i) => fitted(W / 2, 446 + i * 13, line, 270, { size: 8.5, fill: "#ffffff", anchor: "middle", minSize: 6.5 })).join("") +
      (footer.length === 0 ? fitted(W / 2, 455, c.logo.orgName, 270, { size: 9, fill: "#ffffff", anchor: "middle", bold: true }) : "")
    );
  },
};

// ---------------------------------------------------------------------------
// Custom: the organization's uploaded design with the details laid over it.

export const customIdCard: IdCardDesign = {
  id: "custom",
  name: "Your design",
  defaults: { primary: "#2563eb", secondary: "#0ea5e9" },
  front(c, k, ctx) {
    return (
      customBackground(c, k, ctx) +
      logo(c.logo, W / 2, 40, { anchor: "middle", mark: "#ffffff", textColor: "#ffffff", taglineColor: "#ffffff", maxWidth: 240 }) +
      pic(ctx, c, "circle", W / 2, 150, 60, { border: "#ffffff", borderWidth: 4 }) +
      fitted(W / 2, 250, c.name, 260, { size: 23, fill: "#ffffff", bold: true, anchor: "middle", minSize: 14 }) +
      fitted(W / 2, 270, c.role, 240, { size: 12, fill: "#ffffff", anchor: "middle", opacity: 0.9 }) +
      rows([...idRows(c), ...dateRows(c)], 40, 306, { labelWidth: 70, maxWidth: c.qr ? 170 : 225, lineHeight: 17, size: 10.5, labelColor: "#ffffff", valueColor: "#ffffff", maxY: 440 }).svg +
      qrOrNothing(c, 214, 384, 62)
    );
  },
  back(c, k, ctx) {
    const list = bullets(c.terms, 34, 70, 232, { style: "dot", bulletColor: "#ffffff", textColor: "#ffffff", maxY: 260 });
    const contact = contactRows(c, 32, Math.max(list.y + 8, 290), 236, k.primary, "#ffffff", 380);
    return (
      customBackground(c, k, ctx) +
      text(34, 44, "TERMS AND CONDITIONS", { size: 14, fill: "#ffffff", bold: true }) +
      list.svg +
      contact.svg +
      signature(W / 2, 440, 130, c.signatureLabel, "#ffffff")
    );
  },
};

function customBackground(c: IdCardContent, k: DesignColors, ctx: Ctx) {
  if (!c.background) return rect(0, 0, W, H, ctx.linear([k.primary, k.secondary]));
  // Darkened so the white details stay legible over any uploaded artwork.
  return image(c.background, 0, 0, W, H, "slice") + rect(0, 0, W, H, "#0f172a", `fill-opacity="0.38"`);
}

