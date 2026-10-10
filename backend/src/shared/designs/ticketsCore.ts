import {
  barcode,
  checker,
  circle,
  fitted,
  iconBadge,
  image,
  logo,
  n,
  path,
  polygon,
  qrCode,
  rect,
  shade,
  text,
  tint,
} from "./svg.js";
import { detailLines, H, INK, issuedTo, numberText, perforation, priceTag, W, type TicketDesign } from "./ticketKit.js";

// ---------------------------------------------------------------------------
// Horizon: teal checkered panel, detail rows, QR, barcode stub.

export const horizon: TicketDesign = {
  id: "horizon",
  name: "Horizon",
  defaults: { primary: "#0f6f8c", secondary: "#0b4a60" },
  codes: "both",
  render(c, k, ctx) {
    const STUB = 540;
    const panel: [number, number][] = [[0, 0], [214, 0], [166, H], [0, H]];
    const band = ctx.linear([k.primary, k.secondary], [0, 0, 1, 0]);
    const details = detailLines(c);
    const textX = 272;
    const rowsMax = c.qr ? 158 : 250;
    const fieldsLine = c.fields.map((f) => `${f.label}: ${f.value}`).join("   |   ");

    let rowsSvg = "";
    details.forEach((d, i) => {
      const y = 132 + i * 23;
      rowsSvg += iconBadge(d.icon, 257, y - 4, 16, k.primary, "#ffffff", false);
      rowsSvg += fitted(textX, y, d.value, rowsMax, { size: d.strong ? 13 : 10.5, fill: INK, bold: d.strong, minSize: 8 });
    });

    let stubRows = "";
    details.forEach((d, i) => {
      const y = 104 + i * 15;
      stubRows += iconBadge(d.icon, 562, y - 3, 10, k.primary, "#ffffff", false);
      stubRows += fitted(572, y, d.value, 132, { size: d.strong ? 8.5 : 7.5, fill: INK, bold: d.strong, minSize: 6 });
    });

    const contact = [c.phone, c.website].filter(Boolean) as string[];

    return (
      rect(0, 0, W, H, "#eef2f4") +
      polygon(panel, k.primary) +
      checker(ctx, polygon(panel, "#fff"), [0, 0, 214, H], 17, shade(k.primary, 0.35), 0.35) +
      [0, 1, 2].map((i) => rect(14 + i * 13, 14, 9, 9, "#ffffff", `rx="2"`)).join("") +
      polygon([[224, 0], [238, 0], [190, H], [176, H]], k.primary) +
      polygon([[246, 150], [258, 150], [240, H], [228, H]], tint(k.primary, 0.35)) +
      logo(c.logo, 86, 70, { anchor: "middle", mark: "#ffffff", textColor: "#ffffff", taglineColor: "#ffffff", maxWidth: 150 }) +
      issuedTo(24, c.price ? 132 : 158, c, 140, { labelColor: "#dbeafe", nameColor: "#ffffff", size: 16 }) +
      priceTag(24, 176, c, 130, { labelColor: "#dbeafe", valueColor: "#ffffff", size: 22 }) +
      rect(160, 206, STUB - 160, 34, band) +
      polygon([[166, H], [176, 206], [196, 206], [186, H]], "#eef2f4") +
      fitted(textX - 12, 42, c.kicker, 260, { size: 16, fill: INK, italic: true }) +
      fitted(textX - 12, 78, c.title.toUpperCase(), 262, { size: 30, fill: k.primary, bold: true, minSize: 14 }) +
      fitted(textX - 12, 100, c.subtitle, 262, { size: 13, fill: INK, minSize: 9 }) +
      rowsSvg +
      (fieldsLine ? fitted(textX - 12, 198, fieldsLine, 262, { size: 8.5, fill: "#4b5563", minSize: 7 }) : "") +
      (c.qr ? rect(446, 108, 84, 84, "#ffffff", `rx="4"`) + qrCode(c.qr, 450, 112, 76, INK, "#ffffff") : "") +
      (contact.length
        ? iconBadge(contact[0] === c.phone ? "phone" : "globe", 222, 223, 16, "none", "#ffffff") +
          fitted(236, 219, contact[0]!, 150, { size: 9.5, fill: "#ffffff", bold: true }) +
          (contact[1] ? fitted(236, 232, contact[1], 150, { size: 8.5, fill: "#ffffff", opacity: 0.9 }) : "")
        : "") +
      fitted(STUB - 12, 228, numberText(c), 130, { size: 9, fill: "#ffffff", anchor: "end", bold: true }) +
      perforation(STUB, "#94a3b8", "#ffffff") +
      fitted(558, 34, c.kicker, 150, { size: 11, fill: INK, italic: true }) +
      fitted(558, 57, c.title.toUpperCase(), 150, { size: 16, fill: k.primary, bold: true, minSize: 9 }) +
      fitted(558, 72, c.subtitle, 150, { size: 8, fill: INK }) +
      stubRows +
      (c.price
        ? priceTag(704, 158, c, 146, { labelColor: "#6b7280", valueColor: k.primary, size: 20, anchor: "end" })
        : issuedTo(558, 162, c, 148, { labelColor: "#6b7280", nameColor: k.primary, size: 12 })) +
      (c.barcode ? rect(556, 194, 150, 34, "#ffffff") + barcode(c.barcode, 562, 197, 138, 22, INK) : "") +
      fitted(631, 235, c.registrationNumber, 140, { size: 6.5, fill: INK, anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Orbit: a purple circle filled by the QR code.

export const orbit: TicketDesign = {
  id: "orbit",
  name: "Orbit",
  defaults: { primary: "#6b2fa0", secondary: "#9b59d0" },
  codes: "both",
  render(c, k, ctx) {
    const STUB = 548;
    const cx = 380;
    const cy = 112;
    const r = 98;
    // The largest square that fits inside the circle.
    const qrBox = Math.floor(r * Math.SQRT2) - 4;
    const details = detailLines(c);

    let rowsSvg = "";
    details.forEach((d, i) => {
      const y = 150 + i * 20;
      rowsSvg += iconBadge(d.icon, 32, y - 4, 15, k.primary, "#ffffff");
      rowsSvg += fitted(46, y, d.value, 212, { size: d.strong ? 12 : 10, fill: INK, bold: d.strong, minSize: 8 });
    });

    let stubRows = "";
    details.forEach((d, i) => {
      const y = 131 + i * 11.5;
      stubRows += iconBadge(d.icon, 570, y - 2.5, 9, "#ffffff", k.primary);
      stubRows += fitted(580, y, d.value, 126, { size: 7, fill: "#ffffff", bold: d.strong, minSize: 5.5 });
    });

    // Partial outer ring on the left of the circle.
    const ring = (angle: number) => [cx + (r + 12) * Math.cos(angle), cy + (r + 12) * Math.sin(angle)] as const;
    const [ax, ay] = ring((115 * Math.PI) / 180);
    const [bx, by] = ring((245 * Math.PI) / 180);

    return (
      rect(0, 0, W, H, "#ffffff") +
      rect(cx, 62, W - cx, 100, k.primary) +
      path(`M${n(ax)} ${n(ay)}A${r + 12} ${r + 12} 0 0 1 ${n(bx)} ${n(by)}`, "none", `stroke="${k.primary}" stroke-width="7"`) +
      circle(cx, cy, r, k.primary) +
      (c.qr
        ? rect(cx - qrBox / 2, cy - qrBox / 2, qrBox, qrBox, "#ffffff", `rx="10"`) +
          qrCode(c.qr, cx - qrBox / 2 + 8, cy - qrBox / 2 + 8, qrBox - 16, INK, "#ffffff")
        : checker(ctx, circle(cx, cy, r - 14, "#fff"), [cx - r, cy - r, r * 2, r * 2], 19, tint(k.primary, 0.3), 0.35) +
          issuedTo(cx, cy - 6, c, 150, { labelColor: "#ede9fe", nameColor: "#ffffff", size: 15, anchor: "middle" })) +
      [0, 1, 2].map((i) => circle(488 + i * 18, 222, 4.5, k.primary)).join("") +
      path("M492.5 222h9 M510.5 222h9", "none", `stroke="${k.primary}" stroke-width="2"`) +
      logo(c.logo, 22, 30, { mark: k.primary, textColor: INK, taglineColor: "#6b7280", maxWidth: 230 }) +
      fitted(22, 74, c.kicker, 240, { size: 15, fill: INK, italic: true }) +
      fitted(22, 104, c.title.toUpperCase(), 232, { size: 27, fill: k.primary, bold: true, minSize: 13 }) +
      fitted(22, 124, c.subtitle, 236, { size: 12, fill: INK, minSize: 8.5 }) +
      rowsSvg +
      issuedTo(22, 212, c, 240, { labelColor: "#6b7280", nameColor: INK, size: 13 }) +
      perforation(STUB, "#94a3b8", "#ffffff") +
      (c.barcode ? barcode(c.barcode, 568, 14, 136, 28, INK) : "") +
      fitted(636, 54, c.registrationNumber, 136, { size: 7, fill: INK, anchor: "middle" }) +
      fitted(566, 84, c.kicker, 140, { size: 10, fill: "#ffffff", italic: true }) +
      fitted(566, 104, c.title.toUpperCase(), 140, { size: 14.5, fill: "#ffffff", bold: true, minSize: 8 }) +
      fitted(566, 117, c.subtitle, 140, { size: 7.5, fill: "#ffffff", opacity: 0.9 }) +
      stubRows +
      (c.price
        ? priceTag(636, 184, c, 140, { labelColor: "#6b7280", valueColor: k.primary, size: 20, anchor: "middle" })
        : issuedTo(636, 186, c, 140, { labelColor: "#6b7280", nameColor: k.primary, size: 12, anchor: "middle" })) +
      rect(580, 222, 112, 30, k.secondary, `rx="15"`)
    );
  },
};

// ---------------------------------------------------------------------------
// Custom: an uploaded ticket design with the details laid over it.

export const customTicket: TicketDesign = {
  id: "custom",
  name: "Your design",
  defaults: { primary: "#1d4ed8", secondary: "#0ea5e9" },
  codes: "qr",
  render(c, k, ctx) {
    const STUB = 540;
    const light = c.background ? c.textColor !== "dark" : true;
    const fg = light ? "#ffffff" : "#0f172a";
    const muted = light ? "#e2e8f0" : "#475569";
    const bg = c.background
      ? image(c.background, 0, 0, W, H, "slice") +
        rect(0, 0, W, H, light ? "#0f172a" : "#ffffff", `fill-opacity="${n(c.overlayOpacity ?? 0.35)}"`)
      : rect(0, 0, W, H, ctx.linear([k.primary, k.secondary]));
    const details = [c.date, c.time].filter(Boolean).join("  |  ");
    return (
      bg +
      fitted(30, 38, c.kicker.toUpperCase(), 480, { size: 10, fill: fg, bold: true, letterSpacing: 1.6 }) +
      fitted(30, 76, c.title, 480, { size: 30, fill: fg, bold: true, minSize: 14 }) +
      issuedTo(30, 110, c, 480, { labelColor: muted, nameColor: fg, size: 18 }) +
      (details ? fitted(30, 164, details, 480, { size: 13, fill: fg }) : "") +
      (c.venue ? fitted(30, 184, c.venue, 480, { size: 11.5, fill: muted }) : "") +
      (c.fields.length
        ? fitted(30, 206, c.fields.map((f) => `${f.label}: ${f.value}`).join("   |   "), 480, { size: 9.5, fill: muted, minSize: 7 })
        : "") +
      (c.terms ? fitted(30, 228, c.terms, 480, { size: 8, fill: muted, italic: true, minSize: 6.5 }) : "") +
      path(`M${STUB} 12V${H - 12}`, "none", `stroke="${fg}" stroke-opacity="0.6" stroke-width="1.4" stroke-dasharray="5 5"`) +
      (c.qr ? rect(572, 30, 116, 116, "#ffffff", `rx="8"`) + qrCode(c.qr, 578, 36, 104, INK, "#ffffff") : "") +
      (c.registrationNumber
        ? text(630, 172, "NO.", { size: 8.5, fill: muted, bold: true, anchor: "middle", letterSpacing: 1.2 }) +
          fitted(630, 190, c.registrationNumber, 160, { size: 11, fill: fg, bold: true, anchor: "middle", minSize: 7 })
        : "") +
      priceTag(630, 212, c, 160, { labelColor: muted, valueColor: fg, size: 14, anchor: "middle" })
    );
  },
};

