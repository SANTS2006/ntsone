import {
  bokeh,
  checkerBand,
  crowd,
  dots,
  infoBoxes,
  microphone,
  musicNote,
  outlinedTitle,
  planet,
  rocket,
  seeded,
  sideways,
  star,
  stripes,
  ticketInfo,
  vinyl,
} from "./art.js";
import { barcode, circle, fitted, logo, n, path, polygon, qrCode, rect, shade, text, tint } from "./svg.js";
import { H, INK, issuedTo, numberText, perforation, priceTag, W, type TicketContent, type TicketDesign } from "./ticketKit.js";
import { picture, twoTone, vbarcode } from "./ticketsMoreA.js";

function qrOn(c: TicketContent, x: number, y: number, size: number, fg = INK, bg = "#ffffff", radius = 4) {
  if (!c.qr) return "";
  const pad = size * 0.06;
  return rect(x, y, size, size, bg, `rx="${radius}"`) + qrCode(c.qr, x + pad, y + pad, size - pad * 2, fg, bg);
}

function dateBadge(c: TicketContent, x: number, y: number, color: string) {
  if (!c.date) return "";
  const [day, ...rest] = c.date.split(" ");
  return (
    fitted(x, y, day ?? "", 40, { size: 26, fill: color, bold: true, minSize: 12 }) +
    fitted(x + 36, y - 12, rest.join(" ").toUpperCase(), 70, { size: 8, fill: color, bold: true }) +
    fitted(x + 36, y, c.time ?? "", 70, { size: 8, fill: color })
  );
}

// ---------------------------------------------------------------------------
// Art Centre: purple gradient with bokeh, info boxes, and a barcode.

const artCentre: TicketDesign = {
  id: "art-centre",
  name: "Art Centre",
  defaults: { primary: "#6d28d9", secondary: "#db2777" },
  codes: "barcode",
  render(c, k, ctx) {
    const STUB = 560;
    const info = ticketInfo(c, 4);
    return (
      rect(0, 0, W, H, ctx.linear([k.primary, k.secondary], [0, 1, 1, 0])) +
      bokeh(0, 0, STUB, H, "#ffffff", 30, 19, 18) +
      circle(470, 20, 60, k.secondary, `fill-opacity="0.6"`) +
      rect(20, 18, 58, 40, "none", `stroke="#ffffff" stroke-width="1.6"`) +
      fitted(49, 38, c.logo.orgName.split(" ")[0]?.toUpperCase() ?? "", 52, { size: 14, fill: "#ffffff", bold: true, anchor: "middle", minSize: 7 }) +
      fitted(49, 52, "PRESENTS", 52, { size: 7, fill: "#ffffff", anchor: "middle", letterSpacing: 1 }) +
      dateBadge(c, 440, 50, "#ffffff") +
      fitted(530, 78, c.kicker.toUpperCase(), 300, { size: 10, fill: tint(k.secondary, 0.4), anchor: "end", letterSpacing: 1.4 }) +
      fitted(24, 120, c.title.toUpperCase(), 500, { size: 40, fill: "#ffffff", bold: true, minSize: 16 }) +
      fitted(530, 146, c.subtitle.toUpperCase(), 300, { size: 12, fill: "#ffffff", anchor: "end", letterSpacing: 1.4 }) +
      priceTag(24, 150, c, 110, { labelColor: "#f5d0fe", valueColor: "#ffffff", size: 16, label: "TICKET PRICE" }) +
      (c.barcode ? barcode(c.barcode, 24, 192, 110, 22, "#ffffff") : "") +
      infoBoxes(info, 160, 180, 86, 38, { fill: shade(k.primary, 0.35), labelColor: "#e9d5ff", valueColor: "#ffffff", gap: 8, radius: 10 }) +
      fitted(160, 232, c.participantName ? `Issued to ${c.participantName}` : "", 300, { size: 8, fill: "#ffffff", bold: true }) +
      perforation(STUB, "#ffffff", "#ffffff") +
      rect(STUB, 0, W - STUB, H, shade(k.primary, 0.15), `fill-opacity="0.6"`) +
      sideways(600, 222, c.title.toUpperCase(), 200, { size: 22, fill: "#ffffff", bold: true }) +
      sideways(624, 222, c.subtitle.toUpperCase(), 200, { size: 9, fill: "#f5d0fe", letterSpacing: 1 }) +
      sideways(660, 222, numberText(c), 200, { size: 8, fill: "#ffffff" }) +
      sideways(684, 222, c.date ?? "", 200, { size: 10, fill: "#ffffff", bold: true }) +
      sideways(702, 222, c.price ?? "", 200, { size: 9, fill: "#f5d0fe", bold: true })
    );
  },
};

// ---------------------------------------------------------------------------
// Music Concert: pink and purple with a crowd, gate boxes, and a QR code.

const musicConcert: TicketDesign = {
  id: "music-concert",
  name: "Music Concert",
  defaults: { primary: "#7c3aed", secondary: "#ec4899" },
  codes: "qr",
  render(c, k, ctx) {
    const STUB = 580;
    const info = ticketInfo(c, 3);
    return (
      rect(0, 0, W, H, ctx.linear([k.primary, k.secondary], [0, 0, 1, 0])) +
      crowd(0, 200, STUB, 110, "#ffffff", 29, 0.1) +
      stripes(ctx, 420, 120, 34, 34, "#ffffff", 6, 2, 0.5) +
      dateBadge(c, 20, 44, "#ffffff") +
      rect(140, 20, 120, 14, "none", `stroke="#ffffff" stroke-opacity="0.8"`) +
      fitted(200, 31, c.kicker.toUpperCase(), 116, { size: 7, fill: "#ffffff", anchor: "middle", letterSpacing: 1 }) +
      rect(270, 20, 110, 14, "#ffffff") +
      fitted(325, 31, numberText(c), 104, { size: 7, fill: k.primary, anchor: "middle", bold: true }) +
      twoTone(20, 98, c.title.toUpperCase(), 400, { size: 38, first: tint(k.secondary, 0.4), second: "#ffffff", minSize: 14 }) +
      fitted(20, 124, c.date ?? "", 300, { size: 14, fill: "#ffffff", bold: true }) +
      fitted(20, 142, c.venue ?? c.subtitle, 360, { size: 11, fill: "#fce7f3", letterSpacing: 1 }) +
      infoBoxes(info, 20, 160, 70, 50, { fill: shade(k.primary, 0.3), labelColor: "#fce7f3", valueColor: "#ffffff", gap: 8, radius: 6 }) +
      issuedTo(260, 176, c, 180, { labelColor: "#fce7f3", nameColor: "#ffffff", size: 12 }) +
      priceTag(260, 206, c, 150, { labelColor: "#fce7f3", valueColor: "#ffffff", size: 14 }) +
      qrOn(c, 470, 150, 74, INK) +
      rect(STUB, 0, W - STUB, H, shade(k.secondary, 0.05)) +
      path(`M${STUB} 0V${H}`, "none", `stroke="#ffffff" stroke-width="2" stroke-dasharray="5 4"`) +
      sideways(622, 226, c.title.toUpperCase(), 210, { size: 20, fill: "#ffffff", bold: true }) +
      sideways(642, 226, c.date ?? "", 210, { size: 9, fill: "#ffffff" }) +
      qrOn(c, 656, 176, 50, INK, "#ffffff", 3)
    );
  },
};

// ---------------------------------------------------------------------------
// Artist Night: diagonal purple with a pill label and entrance boxes; barcode.

const artistNight: TicketDesign = {
  id: "artist-night",
  name: "Artist Night",
  defaults: { primary: "#5b21b6", secondary: "#f472b6" },
  codes: "barcode",
  render(c, k, ctx) {
    const STUB = 550;
    const info = ticketInfo(c, 4);
    return (
      rect(0, 0, W, H, ctx.linear([shade(k.primary, 0.1), tint(k.primary, 0.1)], [0, 0, 1, 1])) +
      polygon([[300, 0], [420, 0], [260, H], [140, H]], "#ffffff", `fill-opacity="0.05"`) +
      polygon([[430, 0], [480, 0], [360, H], [310, H]], k.secondary, `fill-opacity="0.12"`) +
      circle(500, 190, 60, tint(k.primary, 0.2), `fill-opacity="0.6"`) +
      dots(470, 30, 530, 30, 2, 5, k.secondary) +
      dateBadge(c, 20, 38, k.secondary) +
      fitted(530, 32, numberText(c), 200, { size: 8, fill: "#e9d5ff", anchor: "end" }) +
      fitted(20, 106, c.title.toUpperCase(), 500, { size: 40, fill: "#ffffff", bold: true, minSize: 16 }) +
      rect(20, 118, 180, 22, k.secondary) +
      fitted(28, 134, c.subtitle.toUpperCase(), 166, { size: 11, fill: "#ffffff", bold: true }) +
      (c.barcode ? barcode(c.barcode, 210, 118, 110, 22, "#ffffff") : "") +
      infoBoxes(info, 20, 164, 104, 44, { fill: shade(k.primary, 0.4), labelColor: "#e9d5ff", valueColor: "#ffffff", gap: 10, radius: 12 }) +
      fitted(20, 228, [c.participantName, c.price].filter(Boolean).join("  |  "), 400, { size: 9, fill: "#f5d0fe", bold: true }) +
      perforation(STUB, "#e9d5ff", "#ffffff") +
      sideways(600, 222, c.title.toUpperCase(), 200, { size: 22, fill: "#ffffff", bold: true }) +
      sideways(622, 222, c.subtitle.toUpperCase(), 200, { size: 9, fill: k.secondary, bold: true, letterSpacing: 1 }) +
      vbarcode(c.barcode, 640, 20, 22, 110, "#ffffff") +
      sideways(700, 222, c.date ?? "", 200, { size: 10, fill: "#ffffff", bold: true })
    );
  },
};

// ---------------------------------------------------------------------------
// Music Festival: purple with a pink barcode stub on the left and music notes.

const musicFestival: TicketDesign = {
  id: "music-festival",
  name: "Music Festival",
  defaults: { primary: "#5b21b6", secondary: "#f472b6" },
  codes: "barcode",
  render(c, k, ctx) {
    const STUB = 150;
    return (
      rect(0, 0, W, H, ctx.linear([k.primary, shade(k.primary, 0.3)], [0, 0, 1, 1])) +
      path(`M${STUB} 170C300 130 420 220 ${W} 160V${H}H${STUB}Z`, tint(k.primary, 0.15), `fill-opacity="0.6"`) +
      rect(0, 0, STUB, H, k.secondary) +
      rect(10, 10, 60, 220, "#ffffff", `rx="3"`) +
      vbarcode(c.barcode, 18, 20, 44, 200) +
      sideways(96, 222, numberText(c, "TICKET NUMBER "), 200, { size: 9, fill: "#ffffff", bold: true }) +
      sideways(120, 222, c.participantName, 200, { size: 10, fill: "#ffffff", bold: true }) +
      path(`M${STUB} 0V${H}`, "none", `stroke="#ffffff" stroke-width="2" stroke-dasharray="4 4"`) +
      fitted(176, 58, c.title.toUpperCase(), 400, { size: 38, fill: "#ffffff", bold: true, minSize: 14 }) +
      fitted(176, 86, c.subtitle, 380, { size: 12, fill: "#f3e8ff" }) +
      fitted(176, 106, [c.time, c.date].filter(Boolean).join("  |  "), 380, { size: 12, fill: "#ffffff", bold: true }) +
      fitted(176, 124, c.venue ?? "", 380, { size: 10, fill: "#e9d5ff" }) +
      rect(176, 138, 130, 28, k.secondary, `rx="4"`) +
      fitted(241, 157, c.price ? `TICKET PASS  ${c.price}` : "TICKET PASS", 122, { size: 10, fill: "#ffffff", bold: true, anchor: "middle" }) +
      musicNote(600, 40, 80, "#ffffff") +
      musicNote(660, 120, 40, tint(k.secondary, 0.3)) +
      path("M520 150C560 110 620 180 690 130", "none", `stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.6"`) +
      path("M520 160C560 120 620 190 690 140", "none", `stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.6"`) +
      fitted(700, 226, c.website ?? c.kicker, 300, { size: 8, fill: "#e9d5ff", anchor: "end" }) +
      logo(c.logo, 176, 206, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#e9d5ff", maxWidth: 220, scale: 0.6 })
    );
  },
};

// ---------------------------------------------------------------------------
// Concert Ticket: two-sided. Front: white with cyan and pink bands and a QR code;
// back: bold bands with a large outlined title.

const concertTicket: TicketDesign = {
  id: "concert-ticket",
  name: "Concert Ticket",
  defaults: { primary: "#1e293b", secondary: "#22d3ee" },
  codes: "qr",
  render(c, k) {
    const pink = "#f43f5e";
    const line = (x: number, y: number, label: string, value: string) =>
      value
        ? text(x, y, label.toUpperCase(), { size: 7, fill: "#6b7280" }) +
          fitted(x, y + 16, value, 150, { size: 13, fill: k.primary, bold: true }) +
          path(`M${x} ${y + 22}h150`, "none", `stroke="#d1d5db" stroke-width="0.8"`)
        : "";
    return (
      rect(0, 0, W, H, k.primary) +
      rect(8, 8, W - 16, H - 16, "#ffffff", `rx="6"`) +
      polygon([[8, 8], [110, 8], [8, 90]], k.secondary) +
      sideways(38, 62, "SPECIAL", 80, { size: 10, fill: k.primary, bold: true }, -45) +
      polygon([[W - 8, 150], [W - 8, 232], [610, 232]], pink) +
      polygon([[W - 8, 118], [W - 8, 140], [584, 232], [560, 232]], k.secondary) +
      path("M150 16V224", "none", `stroke="${k.primary}" stroke-width="1.2" stroke-dasharray="4 4"`) +
      fitted(80, 112, c.date ?? "", 120, { size: 11, fill: k.primary, bold: true, anchor: "middle" }) +
      fitted(80, 130, c.time ?? "", 120, { size: 11, fill: k.primary, bold: true, anchor: "middle" }) +
      fitted(80, 186, c.registrationNumber, 120, { size: 8, fill: "#6b7280", anchor: "middle" }) +
      outlinedTitle(430, 60, c.title.toUpperCase(), Math.min(36, 760 / Math.max(8, c.title.length)), k.primary, "#ffffff", "middle") +
      rect(170, 76, 80, 18, k.primary) +
      fitted(210, 89, c.price ?? "ADMIT ONE", 74, { size: 10, fill: "#ffffff", bold: true, anchor: "middle" }) +
      qrOn(c, 176, 104, 90, k.primary) +
      line(290, 96, "Date", c.date ?? "") +
      line(290, 132, "Time", c.time ?? "") +
      line(290, 168, "Venue", c.venue ?? "") +
      line(460, 96, "Issued to", c.participantName) +
      line(460, 132, "Number", c.registrationNumber) +
      line(460, 168, c.fields[0]?.label ?? "", c.fields[0]?.value ?? "") +
      fitted(176, 214, c.kicker, 360, { size: 8, fill: "#6b7280" })
    );
  },
  back(c, k) {
    const pink = "#f43f5e";
    return (
      rect(0, 0, W, H, k.primary) +
      rect(8, 8, W - 16, H - 16, "#ffffff", `rx="6"`) +
      polygon([[8, 60], [260, 8], [380, 8], [8, 170]], k.secondary) +
      polygon([[300, 232], [712, 40], [712, 110], [460, 232]], pink) +
      polygon([[500, 8], [620, 8], [240, 232], [120, 232]], "#ffffff", `fill-opacity="0.35"`) +
      star(26, 26, 6, k.primary) +
      star(42, 26, 6, k.primary) +
      star(58, 26, 6, k.primary) +
      outlinedTitle(360, 122, c.title.toUpperCase(), Math.min(56, 960 / Math.max(8, c.title.length)), k.primary, "#ffffff", "middle") +
      fitted(360, 156, c.subtitle.toUpperCase(), 500, { size: 18, fill: k.primary, bold: true, anchor: "middle" }) +
      fitted(690, 206, c.website ?? "", 220, { size: 8, fill: k.primary, anchor: "end" }) +
      fitted(690, 220, c.phone ?? "", 220, { size: 8, fill: k.primary, anchor: "end" })
    );
  },
};

// ---------------------------------------------------------------------------
// Boarding Pass: two-sided. Front: navy "from/to" pass with a cyan stub; back: a planet
// scene with a big message.

const boardingPass: TicketDesign = {
  id: "boarding-pass",
  name: "Boarding Pass",
  defaults: { primary: "#0f1b3d", secondary: "#2de2e6" },
  codes: "qr",
  render(c, k, ctx) {
    const STUB = 500;
    // "From" is the organization and "To" the event, unless the venue reads like "Freetown to Bo".
    const route = (c.venue ?? "").split(/\s+to\s+|\s*->\s*|\s*→\s*/i);
    const [from, to] = route.length === 2 ? route : [c.logo.orgName, c.title];
    const small = (x: number, y: number, label: string, value: string, color: string, width = 100) =>
      value
        ? text(x, y, label.toUpperCase(), { size: 6.5, fill: color, letterSpacing: 0.8 }) +
          fitted(x, y + 12, value.toUpperCase(), width, { size: 9, fill: color, bold: true })
        : "";
    return (
      rect(0, 0, W, H, "#7c3aed") +
      rect(8, 8, STUB - 12, H - 16, ctx.linear([k.primary, shade(k.primary, 0.4)], [0, 0, 1, 1]), `rx="12"`) +
      rect(STUB + 4, 8, W - STUB - 12, H - 16, k.secondary, `rx="12"`) +
      fitted(30, 38, "BOARDING PASS", 200, { size: 9, fill: k.secondary, letterSpacing: 2 }) +
      fitted(470, 36, c.logo.orgName.toUpperCase(), 150, { size: 8, fill: "#ffffff", bold: true, anchor: "end" }) +
      text(30, 94, "FROM", { size: 7, fill: k.secondary }) +
      fitted(30, 118, (from ?? c.logo.orgName).toUpperCase(), 150, { size: 22, fill: k.secondary, bold: true, minSize: 10 }) +
      path("M190 110h120", "none", `stroke="${k.secondary}" stroke-width="1.2"`) +
      rocket(250, 110, 30, k.secondary) +
      text(330, 94, "TO", { size: 7, fill: k.secondary }) +
      fitted(330, 118, (to ?? c.title).toUpperCase(), 140, { size: 22, fill: k.secondary, bold: true, minSize: 10 }) +
      fitted(30, 134, c.date ?? "", 150, { size: 8, fill: "#cbd5e1" }) +
      fitted(330, 134, c.time ?? "", 150, { size: 8, fill: "#cbd5e1" }) +
      qrOn(c, 408, 58, 70, k.primary, k.secondary, 3) +
      small(30, 186, "Passenger", c.participantName, "#ffffff", 140) +
      small(190, 186, "Pass no.", c.registrationNumber, "#ffffff", 110) +
      small(310, 186, c.fields[0]?.label ?? "Gate", c.fields[0]?.value ?? "", "#ffffff", 60) +
      small(390, 186, c.fields[1]?.label ?? "Seat", c.fields[1]?.value ?? c.price ?? "", "#ffffff", 80) +
      fitted(STUB + 20, 34, "BOARDING PASS", 110, { size: 7, fill: k.primary, letterSpacing: 1.5 }) +
      qrOn(c, 668, 18, 36, k.primary, k.secondary, 2) +
      text(STUB + 60, 70, "TO", { size: 6, fill: k.primary }) +
      fitted(STUB + 60, 90, (to ?? c.title).toUpperCase(), 140, { size: 18, fill: k.primary, bold: true, minSize: 9 }) +
      text(STUB + 60, 116, "FROM", { size: 6, fill: k.primary }) +
      fitted(STUB + 60, 136, (from ?? c.logo.orgName).toUpperCase(), 140, { size: 18, fill: k.primary, bold: true, minSize: 9 }) +
      sideways(STUB + 36, 150, c.participantName.toUpperCase(), 110, { size: 7, fill: k.primary, bold: true }) +
      small(STUB + 20, 186, "No.", c.registrationNumber, k.primary, 90) +
      small(STUB + 120, 186, "Date", c.date ?? "", k.primary, 80)
    );
  },
  back(c, k, ctx) {
    const rand = seeded(12);
    let stars = "";
    for (let i = 0; i < 50; i++) stars += circle(rand() * W, rand() * 160, 0.6 + rand() * 1.2, "#ffffff", `fill-opacity="${n(0.3 + rand() * 0.6)}"`);
    return (
      rect(0, 0, W, H, "#7c3aed") +
      rect(8, 8, W - 16, H - 16, ctx.linear([k.primary, "#312e81"], [0, 0, 1, 1]), `rx="12"`) +
      stars +
      planet(560, 300, 190, ctx, "#1e1b4b", "#6366f1") +
      sideways(60, 214, c.logo.orgName.toUpperCase(), 190, { size: 40, fill: "#ffffff", bold: true, opacity: 0.08 }) +
      path("M160 20V220", "none", `stroke="${k.secondary}" stroke-opacity="0.3" stroke-dasharray="4 4"`) +
      fitted(190, 80, (c.subtitle || c.title).toUpperCase(), 380, { size: 36, fill: k.secondary, bold: true, minSize: 14 }) +
      fitted(190, 118, c.title.toUpperCase(), 380, { size: 22, fill: "#ffffff", bold: true, minSize: 10 }) +
      fitted(190, 212, c.website ?? "", 300, { size: 8, fill: "#c7d2fe" }) +
      logo(c.logo, 520, 212, { mark: k.secondary, textColor: "#ffffff", taglineColor: "#c7d2fe", maxWidth: 170, scale: 0.55 })
    );
  },
};

// ---------------------------------------------------------------------------
// Racing: light grey with a teal stub, a picture panel, and a checkered band.

const racing: TicketDesign = {
  id: "racing",
  name: "Racing",
  defaults: { primary: "#0d9488", secondary: "#111827" },
  codes: "barcode",
  render(c, k, ctx) {
    const STUB = 600;
    const art =
      rect(16, 16, 170, 190, ctx.linear([shade(k.primary, 0.3), tint(k.primary, 0.4)], [0, 0, 1, 1])) +
      Array.from({ length: 8 }, (_, i) => path(`M16 ${40 + i * 22}L186 ${20 + i * 22}`, "none", `stroke="#ffffff" stroke-opacity="0.18" stroke-width="3"`)).join("") +
      checkerBand(56, 70, 88, 44, 11, k.secondary, "#ffffff") +
      rect(52, 66, 4, 120, k.secondary);
    const tags = [c.date, c.time, c.venue, ...c.fields.map((f) => `${f.label}: ${f.value}`)].filter(Boolean).slice(0, 5) as string[];
    return (
      rect(0, 0, W, H, k.secondary) +
      rect(8, 8, STUB - 8, H - 16, "#ececec", `rx="4"`) +
      picture(ctx, c, rect(16, 16, 170, 190, "#fff"), [16, 16, 170, 190], art) +
      fitted(206, 36, c.kicker.toUpperCase(), 380, { size: 9, fill: k.secondary, bold: true, letterSpacing: 0.6 }) +
      fitted(206, 80, c.title.toUpperCase(), 380, { size: 40, fill: k.secondary, bold: true, minSize: 14 }) +
      fitted(206, 106, c.subtitle, 380, { size: 12, fill: "#374151" }) +
      tags
        .map((tag, i) => {
          const x = 206 + (i % 3) * 128;
          const y = 124 + Math.floor(i / 3) * 22;
          return rect(x, y, 120, 16, i === 0 ? k.primary : "none", `rx="8" stroke="${k.secondary}" stroke-width="1"`) +
            fitted(x + 60, y + 11.5, tag, 110, { size: 7.5, fill: i === 0 ? "#ffffff" : k.secondary, bold: true, anchor: "middle" });
        })
        .join("") +
      issuedTo(206, 186, c, 250, { labelColor: "#6b7280", nameColor: k.secondary, size: 12 }) +
      priceTag(470, 186, c, 120, { labelColor: "#6b7280", valueColor: k.primary, size: 16 }) +
      (c.barcode ? barcode(c.barcode, 16, 212, 120, 14, k.secondary) : "") +
      checkerBand(456, 212, 136, 12, 6, k.secondary, "#ffffff") +
      rect(STUB, 8, W - STUB - 8, H - 16, k.primary, `rx="4"`) +
      path(`M${STUB} 8V232`, "none", `stroke="#ffffff" stroke-width="1.5" stroke-dasharray="4 4"`) +
      sideways(630, 222, c.title.toUpperCase(), 200, { size: 12, fill: "#ffffff", bold: true }) +
      sideways(648, 222, c.date ?? "", 200, { size: 8, fill: "#ffffff" }) +
      vbarcode(c.barcode, 664, 30, 34, 150, "#ffffff") +
      fitted(681, 212, c.registrationNumber.slice(-6), 60, { size: 10, fill: "#ffffff", bold: true, anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Vinyl: a white ticket with a microphone and records, and a black stub; QR code.

const vinylTicket: TicketDesign = {
  id: "vinyl",
  name: "Vinyl Night",
  defaults: { primary: "#111111", secondary: "#8b5cf6" },
  codes: "qr",
  render(c, k) {
    const STUB = 590;
    return (
      rect(0, 0, W, H, "#f5f5f4") +
      vinyl(70, 220, 70, k.primary, "#f5f5f4") +
      vinyl(180, 250, 50, k.primary, "#f5f5f4") +
      microphone(96, 44, 150, k.primary, "#f5f5f4") +
      fitted(240, 70, c.title.toUpperCase(), 330, { size: 36, fill: k.primary, bold: true, minSize: 14 }) +
      fitted(240, 98, c.subtitle.toUpperCase(), 330, { size: 14, fill: k.primary, bold: true, minSize: 8 }) +
      rect(240, 112, 250, 26, k.primary) +
      fitted(365, 130, [c.date, c.time].filter(Boolean).join("  |  ").toUpperCase(), 236, { size: 11, fill: "#ffffff", bold: true, anchor: "middle", letterSpacing: 1.5 }) +
      fitted(240, 160, c.venue ?? "", 330, { size: 10, fill: "#44403c" }) +
      issuedTo(240, 186, c, 250, { labelColor: "#78716c", nameColor: k.primary, size: 13 }) +
      priceTag(470, 186, c, 110, { labelColor: "#78716c", valueColor: k.secondary, size: 16 }) +
      path(`M${STUB - 10} 10V230`, "none", `stroke="${k.primary}" stroke-width="1.5" stroke-dasharray="3 5"`) +
      rect(STUB, 0, W - STUB, H, k.primary) +
      sideways(612, 224, numberText(c, "TICKET NUMBER "), 210, { size: 9, fill: "#ffffff", bold: true }) +
      qrOn(c, 628, 14, 80, k.primary) +
      sideways(664, 224, c.fields[1] ? `${c.fields[1].label} ${c.fields[1].value}` : c.price ?? "", 120, { size: 16, fill: "#ffffff", bold: true }) +
      circle(700, 224, 10, "#f5f5f4")
    );
  },
};

// ---------------------------------------------------------------------------
// Food Festival: cream and gold with a round badge and a gold stub; QR code.

const foodFestival: TicketDesign = {
  id: "food-festival",
  name: "Food Festival",
  defaults: { primary: "#c8a24a", secondary: "#fff1c9" },
  codes: "qr",
  render(c, k, ctx) {
    const STUB = 560;
    let rings = "";
    for (let i = 0; i < 6; i++) rings += circle(470, 40, 60 + i * 14, "none", `stroke="${k.primary}" stroke-opacity="0.15"`);
    return (
      rect(0, 0, W, H, "#ec4899") +
      rect(8, 8, W - 16, H - 16, k.secondary, `rx="4"`) +
      rings +
      circle(66, 62, 36, "#ffffff") +
      fitted(30, 68, c.kicker.split(" ")[0]?.toUpperCase() ?? "", 70, { size: 16, fill: "#6b7280" }) +
      fitted(30, 118, c.title.toUpperCase(), 300, { size: 40, fill: "#3f3f46", bold: true, minSize: 14 }) +
      fitted(32, 140, c.subtitle, 300, { size: 16, fill: "#be185d", italic: true }) +
      rect(350, 80, 150, 60, "none", `stroke="#3f3f46" stroke-width="1.5"`) +
      fitted(425, 106, c.date ?? "", 140, { size: 14, fill: "#3f3f46", bold: true, anchor: "middle" }) +
      fitted(425, 126, c.time ?? "", 140, { size: 10, fill: "#3f3f46", anchor: "middle" }) +
      text(32, 184, "YOUR TICKET", { size: 6.5, fill: "#6b7280" }) +
      fitted(32, 198, c.price ?? "", 90, { size: 12, fill: "#3f3f46", bold: true }) +
      text(130, 184, "ISSUED TO", { size: 6.5, fill: "#6b7280" }) +
      fitted(130, 198, c.participantName, 160, { size: 12, fill: "#3f3f46", bold: true }) +
      text(300, 184, "TICKET NUMBER", { size: 6.5, fill: "#6b7280" }) +
      fitted(300, 198, c.registrationNumber, 200, { size: 12, fill: "#3f3f46", bold: true }) +
      fitted(32, 222, c.venue ?? "", 480, { size: 9, fill: "#6b7280" }) +
      rect(STUB, 8, W - STUB - 8, H - 16, ctx.linear([k.primary, tint(k.primary, 0.3)], [0, 0, 1, 1])) +
      circle(STUB, 120, 12, k.secondary) +
      qrOn(c, 578, 30, 88, "#3f3f46") +
      sideways(690, 224, c.title.toUpperCase(), 200, { size: 20, fill: "#ffffff", bold: true }) +
      fitted(622, 146, c.date ?? "", 100, { size: 9, fill: "#ffffff", bold: true, anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Rock Concert: deep red with a microphone, and a price and barcode stub.

const rockConcert: TicketDesign = {
  id: "rock-concert",
  name: "Rock Concert",
  defaults: { primary: "#9b111e", secondary: "#facc15" },
  codes: "barcode",
  render(c, k, ctx) {
    const STUB = 560;
    return (
      rect(0, 0, W, H, k.secondary) +
      rect(10, 10, W - 20, H - 20, ctx.linear([k.primary, shade(k.primary, 0.3)], [0, 0, 1, 1])) +
      microphone(96, 30, 190, shade(k.primary, 0.6), k.primary) +
      path("M200 160C260 120 320 200 380 150", "none", `stroke="#ffffff" stroke-opacity="0.15" stroke-width="30"`) +
      fitted(220, 54, c.kicker, 320, { size: 11, fill: "#fecaca", letterSpacing: 1 }) +
      fitted(220, 88, c.title, 320, { size: 26, fill: "#ffffff", bold: true, minSize: 12 }) +
      fitted(220, 108, c.subtitle, 320, { size: 10, fill: "#fecaca" }) +
      dots(220, 124, 320, 124, 1.2, 12, "#fecaca") +
      fitted(220, 150, c.date ?? "", 320, { size: 10, fill: "#ffffff", bold: true }) +
      fitted(220, 168, c.time ?? "", 320, { size: 10, fill: "#ffffff" }) +
      fitted(220, 186, c.venue ?? "", 320, { size: 10, fill: "#ffffff" }) +
      issuedTo(220, 206, c, 300, { labelColor: "#fecaca", nameColor: "#ffffff", size: 11 }) +
      path(`M${STUB} 20V220`, "none", `stroke="#fecaca" stroke-width="1"`) +
      fitted(640, 50, "TICKET PRICE", 140, { size: 8, fill: "#fecaca", anchor: "middle", letterSpacing: 1.5 }) +
      fitted(640, 90, c.price ?? "", 140, { size: 32, fill: "#ffffff", bold: true, anchor: "middle", minSize: 12 }) +
      fitted(640, 118, "ADMIT ONE", 140, { size: 14, fill: "#ffffff", bold: true, anchor: "middle" }) +
      (c.barcode ? rect(580, 136, 120, 52, "#ffffff") + barcode(c.barcode, 586, 140, 108, 36, INK) : "") +
      fitted(640, 184, c.registrationNumber, 110, { size: 7, fill: INK, anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Vocal VIP: black and gold with dashed frames, a VIP seal, and a side barcode.

const vocalVip: TicketDesign = {
  id: "vocal-vip",
  name: "Gold VIP",
  defaults: { primary: "#0b0b0b", secondary: "#d4af37" },
  codes: "barcode",
  render(c, k) {
    return (
      rect(0, 0, W, H, k.primary) +
      circle(160, 0, 16, "#e5e5e5") +
      circle(160, H, 16, "#e5e5e5") +
      path("M160 16V224", "none", `stroke="${k.secondary}" stroke-width="3" stroke-dasharray="14 8"`) +
      rect(40, 40, 70, 160, k.secondary, `fill-opacity="0.12"`) +
      vbarcode(c.barcode, 48, 48, 54, 144, k.secondary) +
      rect(186, 24, 510, 192, "none", `stroke="${k.secondary}" stroke-width="2.5" stroke-dasharray="16 8"`) +
      fitted(420, 58, [c.date, c.time].filter(Boolean).join("  ").toUpperCase(), 340, { size: 10, fill: "#ffffff", bold: true, anchor: "middle" }) +
      fitted(420, 74, c.venue ? c.venue.toUpperCase() : "", 340, { size: 9, fill: "#ffffff", anchor: "middle" }) +
      rect(400, 84, 40, 6, k.secondary, `rx="3"`) +
      fitted(390, 126, c.title.toUpperCase(), 330, { size: 32, fill: "#ffffff", bold: true, anchor: "middle", minSize: 12 }) +
      fitted(390, 152, c.subtitle ? c.subtitle.toUpperCase() : "TICKET", 300, { size: 16, fill: k.secondary, bold: true, anchor: "middle", minSize: 8 }) +
      fitted(420, 176, c.participantName ? `ISSUED TO ${c.participantName.toUpperCase()}` : "", 340, { size: 9, fill: "#e5e5e5", anchor: "middle" }) +
      fitted(420, 194, c.price ?? "", 200, { size: 12, fill: k.secondary, bold: true, anchor: "middle" }) +
      circle(635, 118, 48, "none", `stroke="${k.secondary}" stroke-width="3" stroke-dasharray="10 6"`) +
      fitted(635, 132, "VIP", 80, { size: 36, fill: k.secondary, bold: true, anchor: "middle" }) +
      fitted(420, 208, c.registrationNumber, 200, { size: 7, fill: "#a3a3a3", anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// VIP Pass: black with gold hatching, a dotted gold frame, and a QR code stub.

const vipPass: TicketDesign = {
  id: "vip-pass",
  name: "VIP Pass",
  defaults: { primary: "#141414", secondary: "#e2b340" },
  codes: "qr",
  render(c, k, ctx) {
    const STUB = 570;
    return (
      rect(0, 0, W, H, "#2a2a2a") +
      stripes(ctx, 0, 0, W, H, "#3a3a3a", 14, 5) +
      rect(16, 16, W - 32, H - 32, k.primary) +
      rect(26, 26, 190, H - 52, "none", `stroke="${k.secondary}" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"`) +
      fitted(121, 118, "VIP", 170, { size: 64, fill: k.secondary, bold: true, anchor: "middle" }) +
      fitted(121, 158, "PASS", 170, { size: 22, fill: "#ffffff", bold: true, anchor: "middle" }) +
      rect(240, 30, 310, 16, k.secondary) +
      fitted(395, 42, c.kicker.toUpperCase(), 300, { size: 8, fill: k.primary, bold: true, anchor: "middle", letterSpacing: 0.8 }) +
      fitted(395, 82, c.title.toUpperCase(), 300, { size: 20, fill: "#ffffff", bold: true, anchor: "middle", minSize: 10 }) +
      fitted(395, 104, c.subtitle, 300, { size: 9, fill: "#d4d4d4", anchor: "middle" }) +
      fitted(395, 126, c.venue ?? "", 300, { size: 9, fill: "#d4d4d4", anchor: "middle" }) +
      fitted(250, 164, c.date ?? "", 150, { size: 11, fill: "#ffffff", bold: true }) +
      fitted(540, 164, c.time ?? "", 150, { size: 11, fill: "#ffffff", bold: true, anchor: "end" }) +
      fitted(395, 184, c.participantName, 300, { size: 11, fill: k.secondary, bold: true, anchor: "middle" }) +
      rect(240, 196, 310, 16, k.secondary) +
      fitted(395, 208, c.price ? `ADMISSION ${c.price}` : "GUARANTEED ACCESS", 300, { size: 8, fill: k.primary, bold: true, anchor: "middle" }) +
      circle(STUB, 16, 12, "#2a2a2a") +
      circle(STUB, H - 16, 12, "#2a2a2a") +
      path(`M${STUB} 30V210`, "none", `stroke="${k.secondary}" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"`) +
      rect(588, 30, 106, 16, k.secondary) +
      fitted(641, 42, "ADMIT ONE", 100, { size: 8, fill: k.primary, bold: true, anchor: "middle" }) +
      qrOn(c, 596, 58, 90, INK) +
      fitted(641, 170, c.logo.orgName.toUpperCase(), 110, { size: 10, fill: "#ffffff", bold: true, anchor: "middle" }) +
      fitted(641, 196, c.registrationNumber, 110, { size: 7, fill: "#a3a3a3", anchor: "middle" })
    );
  },
};

export const TICKET_DESIGNS_B: TicketDesign[] = [
  artCentre,
  musicConcert,
  artistNight,
  musicFestival,
  concertTicket,
  boardingPass,
  racing,
  vinylTicket,
  foodFestival,
  rockConcert,
  vocalVip,
  vipPass,
];
