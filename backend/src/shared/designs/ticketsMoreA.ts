import {
  bokeh,
  crowd,
  dots,
  giftBox,
  guitarHead,
  infoBoxes,
  microphone,
  musicNote,
  seeded,
  sideways,
  star,
  stripes,
  ticketInfo,
} from "./art.js";
import {
  barcode,
  circle,
  fitted,
  image,
  logo,
  mix,
  n,
  path,
  polygon,
  qrCode,
  rect,
  shade,
  text,
  textWidth,
  tint,
  type Ctx,
} from "./svg.js";
import { detailRows, H, INK, issuedTo, numberText, perforation, priceTag, W, type TicketContent, type TicketDesign } from "./ticketKit.js";

// ---------------------------------------------------------------------------
// Helpers shared by these designs

/** A title whose last word takes the accent color, e.g. "EVENT" white + "TICKET" orange. */
export function twoTone(
  x: number,
  y: number,
  value: string,
  maxWidth: number,
  { size, first, second, anchor = "start", minSize }: { size: number; first: string; second: string; anchor?: "start" | "end" | "middle"; minSize?: number },
) {
  const words = value.trim().split(/\s+/);
  if (words.length < 2) return fitted(x, y, value, maxWidth, { size, fill: first, bold: true, anchor, minSize });
  const head = words.slice(0, -1).join(" ") + " ";
  const tail = words[words.length - 1]!;
  let s = size;
  const min = minSize ?? size * 0.5;
  while (s > min && textWidth(head + tail, s, true) > maxWidth) s -= 0.5;
  const total = textWidth(head + tail, s, true);
  const start = anchor === "end" ? x - total : anchor === "middle" ? x - total / 2 : x;
  return (
    text(start, y, head, { size: s, fill: first, bold: true }) +
    text(start + textWidth(head, s, true), y, tail, { size: s, fill: second, bold: true })
  );
}

/** A barcode standing on its side inside a box `w` wide and `h` tall. */
export function vbarcode(bits: string | null, x: number, y: number, w: number, h: number, color = INK) {
  if (!bits) return "";
  return `<g transform="translate(${n(x + w)} ${n(y)}) rotate(90)">${barcode(bits, 0, 0, h, w, color)}</g>`;
}

/** The event photo clipped to a shape, or the design's own artwork when there is none. */
export function picture(ctx: Ctx, c: TicketContent, clipShape: string, box: [number, number, number, number], fallback: string) {
  const clip = ctx.clip(clipShape);
  const [x, y, w, h] = box;
  if (c.image) return image(c.image, x, y, w, h, "slice", clip);
  return `<g clip-path="${clip}">${fallback}</g>`;
}

function qrBox(c: TicketContent, x: number, y: number, size: number, fg = INK, radius = 4) {
  if (!c.qr) return "";
  const pad = size * 0.06;
  return rect(x, y, size, size, "#ffffff", `rx="${radius}"`) + qrCode(c.qr, x + pad, y + pad, size - pad * 2, fg, "#ffffff");
}

function priceDiamond(c: TicketContent, cx: number, cy: number, size: number, accent: string) {
  if (!c.price) return "";
  const h = size / 2;
  return (
    polygon([[cx, cy - h], [cx + h, cy], [cx, cy + h], [cx - h, cy]], "#ffffff") +
    text(cx, cy - size * 0.07, "PRICE", { size: size * 0.15, fill: INK, bold: true, anchor: "middle", letterSpacing: 0.6 }) +
    fitted(cx, cy + size * 0.18, c.price, size * 0.62, { size: size * 0.2, fill: accent, bold: true, anchor: "middle", minSize: 6 })
  );
}

// ---------------------------------------------------------------------------
// Blaze: charcoal with orange diagonals and a picture panel; barcode on the stub.

const blaze: TicketDesign = {
  id: "blaze",
  name: "Blaze",
  defaults: { primary: "#f26522", secondary: "#e2231a" },
  codes: "barcode",
  render(c, k, ctx) {
    const STUB = 548;
    const panel = polygon([[0, 0], [300, 0], [196, H], [0, H]], "#fff");
    const art =
      rect(0, 0, 300, H, ctx.linear([shade(k.primary, 0.55), "#1c1c1c"], [0, 0, 1, 1])) +
      stripes(ctx, 0, 0, 300, H, k.primary, 16, 2, 0.25) +
      microphone(110, 40, 150, "#111111", k.primary);
    return (
      rect(0, 0, W, H, "#262626") +
      picture(ctx, c, panel, [0, 0, 300, H], art) +
      polygon([[300, 0], [316, 0], [212, H], [196, H]], "#ffffff") +
      polygon([[170, H], [300, 118], [430, H]], k.primary) +
      polygon([[440, 0], [STUB, 0], [STUB, H], [330, H]], ctx.linear([k.primary, k.secondary], [0, 0, 1, 1]), `fill-opacity="0.9"`) +
      polygon([[STUB, 0], [W, 0], [W, 80]], k.secondary) +
      rect(STUB, 0, W - STUB, H, "#2b2b2b", `fill-opacity="0.55"`) +
      rect(20, 16, 7, 7, "#ffffff", `transform="rotate(45 23 19)"`) +
      fitted(528, 34, c.kicker.toUpperCase(), 200, { size: 10, fill: "#ffffff", anchor: "end", bold: true, letterSpacing: 0.8 }) +
      twoTone(528, 72, c.title.toUpperCase(), 205, { size: 32, first: "#ffffff", second: k.primary, anchor: "end", minSize: 12 }) +
      fitted(528, 90, c.subtitle, 200, { size: 10, fill: tint(k.primary, 0.3), anchor: "end", letterSpacing: 1 }) +
      fitted(528, 124, (c.date ?? "").toUpperCase(), 250, { size: 24, fill: "#ffffff", anchor: "end", bold: true, minSize: 12 }) +
      fitted(528, 144, c.time ?? "", 250, { size: 13, fill: "#ffffff", anchor: "end", bold: true }) +
      fitted(528, 160, c.venue ?? "", 250, { size: 10, fill: "#e5e7eb", anchor: "end" }) +
      issuedTo(528, 186, c, 220, { labelColor: tint(k.primary, 0.2), nameColor: "#ffffff", size: 15, anchor: "end" }) +
      fitted(528, 228, numberText(c, "NO: "), 200, { size: 9, fill: "#ffffff", anchor: "end", bold: true }) +
      priceDiamond(c, 250, 196, 64, k.secondary) +
      logo(c.logo, 18, 214, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#e5e7eb", maxWidth: 170, scale: 0.8 }) +
      perforation(STUB, "#ffffff", "#ffffff") +
      fitted(634, 30, c.kicker.toUpperCase(), 150, { size: 7, fill: "#ffffff", anchor: "middle", bold: true }) +
      twoTone(634, 52, c.title.toUpperCase(), 150, { size: 17, first: "#ffffff", second: k.primary, anchor: "middle", minSize: 8 }) +
      fitted(634, 74, (c.date ?? "").toUpperCase(), 150, { size: 12, fill: "#ffffff", anchor: "middle", bold: true }) +
      fitted(634, 88, c.time ?? "", 150, { size: 8, fill: "#ffffff", anchor: "middle" }) +
      priceDiamond(c, 634, 132, 52, k.secondary) +
      (c.barcode ? rect(566, 176, 136, 40, "#ffffff", `rx="2"`) + barcode(c.barcode, 572, 179, 124, 26, INK) : "") +
      fitted(634, 212, c.registrationNumber, 124, { size: 6.5, fill: INK, anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Neon Pass: purple to pink with slanted banners and a vertical barcode.

const neonPass: TicketDesign = {
  id: "neon-pass",
  name: "Neon Pass",
  defaults: { primary: "#5b2a86", secondary: "#e84393" },
  codes: "barcode",
  render(c, k, ctx) {
    const info = c.fields.length ? c.fields.slice(0, 3) : ticketInfo(c, 3);
    return (
      rect(0, 0, W, H, ctx.linear([k.primary, k.secondary], [0, 0, 1, 0])) +
      bokeh(420, 0, 230, H, "#ffffff", 24, 11, 30) +
      polygon([[0, 0], [430, 0], [390, H], [0, H]], shade(k.primary, 0.25), `fill-opacity="0.75"`) +
      polygon([[300, 0], [380, 0], [340, H], [260, H]], "#ffffff", `fill-opacity="0.06"`) +
      logo(c.logo, 22, 24, { mark: "#ffffff", textColor: "#ffffff", taglineColor: tint(k.secondary, 0.4), maxWidth: 170, scale: 0.75 }) +
      fitted(40, 64, c.kicker, 300, { size: 12, fill: "#ffffff", italic: true }) +
      polygon([[34, 74], [370, 66], [364, 116], [28, 124]], shade(k.primary, 0.45)) +
      fitted(52, 108, c.title.toUpperCase(), 300, { size: 30, fill: "#ffffff", bold: true, minSize: 13 }) +
      polygon([[34, 132], [330, 126], [326, 158], [30, 164]], k.secondary) +
      fitted(48, 153, c.subtitle ? c.subtitle.toUpperCase() : "YOUR ENTRY PASS", 270, { size: 16, fill: "#ffffff", bold: true, minSize: 8 }) +
      issuedTo(40, 190, c, 300, { labelColor: tint(k.secondary, 0.5), nameColor: "#ffffff", size: 14 }) +
      fitted(40, 228, [c.venue, c.phone].filter(Boolean).join("  |  "), 330, { size: 8.5, fill: "#f3e8ff" }) +
      fitted(530, 46, c.title, 200, { size: 24, fill: shade(k.primary, 0.1), bold: true, anchor: "middle", minSize: 11 }) +
      fitted(530, 76, (c.date ?? "").toUpperCase(), 200, { size: 20, fill: shade(k.primary, 0.2), bold: true, anchor: "middle", minSize: 10 }) +
      fitted(530, 94, c.time ?? "", 200, { size: 9, fill: shade(k.primary, 0.3), anchor: "middle", bold: true }) +
      infoBoxes(info, 530 - (info.length * 56 - 8) / 2, 106, 48, 40, {
        fill: mix(k.primary, k.secondary, 0.4),
        labelColor: "#fce7f3",
        valueColor: "#ffffff",
      }) +
      (c.price
        ? rect(478, 158, 104, 36, shade(k.primary, 0.1), `rx="4"`) +
          priceTag(530, 172, c, 96, { labelColor: "#fbcfe8", valueColor: "#ffffff", size: 15, anchor: "middle", label: "ADMIT ONE" })
        : "") +
      fitted(530, 222, numberText(c), 200, { size: 8, fill: shade(k.primary, 0.3), anchor: "middle", bold: true }) +
      rect(652, 10, 58, 220, "#ffffff", `rx="3"`) +
      vbarcode(c.barcode, 664, 24, 34, 176) +
      sideways(704, 214, c.registrationNumber, 190, { size: 6.5, fill: INK }, -90)
    );
  },
};

// ---------------------------------------------------------------------------
// Awards: deep navy with a stacked gold title and bright dots; QR code on a white stub.

const awards: TicketDesign = {
  id: "awards",
  name: "Awards Night",
  defaults: { primary: "#26215c", secondary: "#f4b400" },
  codes: "qr",
  render(c, k) {
    const STUB = 540;
    const words = c.title.toUpperCase().split(/\s+/);
    const half = Math.ceil(words.length / 2);
    return (
      rect(0, 0, W, H, k.primary) +
      circle(505, 18, 22, k.secondary) +
      circle(520, 118, 10, "#ef4444") +
      circle(528, 232, 20, "#10b981") +
      circle(24, 230, 14, k.secondary, `fill-opacity="0.8"`) +
      fitted(28, 30, c.kicker.toUpperCase(), 220, { size: 8, fill: "#c7d2fe", letterSpacing: 1.4, bold: true }) +
      fitted(28, 78, words.slice(0, half).join(" "), 250, { size: 44, fill: "#ffffff", bold: true, minSize: 16 }) +
      fitted(28, 122, words.slice(half).join(" "), 250, { size: 44, fill: "#ffffff", bold: true, minSize: 16 }) +
      (c.subtitle ? rect(300, 44, 76, 16, k.secondary, `rx="2"`) + fitted(338, 56, "THEME", 70, { size: 9, fill: k.primary, bold: true, anchor: "middle" }) : "") +
      fitted(300, 84, c.subtitle.toUpperCase(), 200, { size: 20, fill: "#ffffff", bold: true, minSize: 9 }) +
      detailRows(c, 300, 116, { badge: k.secondary, glyph: k.primary, textColor: "#e0e7ff", size: 10, step: 18, maxWidth: 190 }) +
      issuedTo(28, 170, c, 250, { labelColor: "#a5b4fc", nameColor: k.secondary, size: 15 }) +
      priceTag(300, 184, c, 190, { labelColor: "#a5b4fc", valueColor: k.secondary, size: 18 }) +
      logo(c.logo, 28, 218, { mark: k.secondary, textColor: "#ffffff", taglineColor: "#c7d2fe", maxWidth: 230, scale: 0.7 }) +
      rect(STUB, 0, W - STUB, H, "#ffffff") +
      perforation(STUB, k.primary, k.primary) +
      qrBox(c, 566, 30, 128, INK) +
      fitted(630, 184, c.participantName, 150, { size: 11, fill: k.primary, bold: true, anchor: "middle" }) +
      fitted(630, 200, c.registrationNumber, 150, { size: 8, fill: "#6b7280", anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Fun Fair: a white ticket on purple with colourful pills and a stamp; QR on the stub.

const funFair: TicketDesign = {
  id: "fun-fair",
  name: "Fun Fair",
  defaults: { primary: "#4c1d95", secondary: "#f97316" },
  codes: "qr",
  render(c, k) {
    const STUB = 560;
    const pills = ["#ec4899", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#06b6d4"];
    const infoItems = [c.date, c.time, c.venue, ...c.fields.map((f) => `${f.label}: ${f.value}`)].filter(Boolean) as string[];
    return (
      rect(0, 0, W, H, k.primary) +
      rect(10, 12, STUB - 16, 196, "#ffffff", `rx="10"`) +
      rect(STUB + 6, 12, W - STUB - 16, 196, "#ffffff", `rx="10"`) +
      path(`M${STUB} 22V198`, "none", `stroke="${k.primary}" stroke-width="2" stroke-dasharray="4 5"`) +
      logo(c.logo, 26, 34, { mark: k.primary, textColor: k.primary, taglineColor: "#6b7280", maxWidth: 220, scale: 0.65 }) +
      fitted(30, 86, c.title.toUpperCase(), 250, { size: 36, fill: k.primary, bold: true, minSize: 14 }) +
      fitted(30, 108, c.subtitle, 250, { size: 12, fill: k.secondary, bold: true }) +
      pills
        .slice(0, 4)
        .map((color, i) => rect(30 + (i % 2) * 118, 124 + Math.floor(i / 2) * 20, 110, 14, color, `rx="7"`))
        .join("") +
      infoItems
        .slice(0, 4)
        .map((item, i) => fitted(36 + (i % 2) * 118, 134 + Math.floor(i / 2) * 20, item, 98, { size: 7.5, fill: "#ffffff", bold: true }))
        .join("") +
      priceTag(290, 50, c, 120, { labelColor: "#6b7280", valueColor: k.primary, size: 22, label: "RATE" }) +
      issuedTo(290, 118, c, 250, { labelColor: "#6b7280", nameColor: INK, size: 14 }) +
      detailRows(c, 290, 160, { badge: k.primary, textColor: INK, size: 9, step: 15, maxWidth: 240 }) +
      fitted(30, 200, numberText(c), 250, { size: 8, fill: "#6b7280", bold: true }) +
      (c.phone ? fitted(40, 226, `Info and enquiries: ${c.phone}`, 480, { size: 10, fill: "#ffffff", bold: true }) : "") +
      qrBox(c, 584, 38, 108, k.primary) +
      (c.qr ? "" : sideways(640, 150, "TICKET", 120, { size: 30, fill: k.primary, bold: true, anchor: "middle" })) +
      fitted(638, 176, c.price ?? "", 110, { size: 13, fill: k.secondary, bold: true, anchor: "middle" }) +
      fitted(638, 196, c.registrationNumber, 110, { size: 7, fill: "#6b7280", anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Gift Voucher: two-sided. Front: blue with gift boxes and stars; back: details form.

const giftVoucher: TicketDesign = {
  id: "gift-voucher",
  name: "Gift Voucher",
  defaults: { primary: "#1e40af", secondary: "#f5b700" },
  codes: "qr",
  render(c, k, ctx) {
    return (
      rect(0, 0, W, H, ctx.linear([shade(k.primary, 0.3), k.primary], [0, 0, 1, 1])) +
      bokeh(0, 0, 300, H, "#93c5fd", 16, 7, 24) +
      star(18, 18, 26, k.secondary) +
      star(700, 222, 30, k.secondary) +
      star(690, 26, 14, k.secondary) +
      giftBox(40, 70, 100, tint(k.primary, 0.25), "#e0f2fe") +
      giftBox(140, 110, 70, tint(k.primary, 0.45), "#e0f2fe") +
      fitted(24, 222, c.kicker, 250, { size: 20, fill: "#ffffff", italic: true, bold: true, minSize: 10 }) +
      fitted(300, 44, "THE VOUCHER", 250, { size: 13, fill: "#e0f2fe", bold: true, letterSpacing: 3 }) +
      polygon([[290, 58], [640, 52], [632, 118], [284, 124]], "#ffffff") +
      fitted(306, 104, c.title.toUpperCase(), 310, { size: 38, fill: k.primary, bold: true, minSize: 14 }) +
      rect(292, 126, 250, 24, shade(k.primary, 0.35), `rx="3"`) +
      fitted(302, 143, c.subtitle ? c.subtitle.toUpperCase() : "GIFT FOR YOU", 232, { size: 13, fill: "#ffffff", bold: true }) +
      fitted(300, 176, [c.date, c.time].filter(Boolean).join("  |  "), 250, { size: 12, fill: "#ffffff", bold: true }) +
      fitted(300, 194, c.venue ?? "", 250, { size: 10, fill: "#dbeafe" }) +
      issuedTo(300, 214, c, 250, { labelColor: "#bfdbfe", nameColor: "#ffffff", size: 12 }) +
      (c.qr
        ? circle(612, 172, 50, "#ffffff") + qrCode(c.qr, 578, 138, 68, k.primary, "#ffffff")
        : circle(612, 172, 30, "#ffffff", `fill-opacity="0.9"`)) +
      logo(c.logo, 560, 26, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#bfdbfe", maxWidth: 140, scale: 0.6 })
    );
  },
  back(c, k) {
    const line = (x: number, y: number, label: string, value: string, width: number) =>
      text(x, y, label, { size: 9, fill: "#374151", bold: true }) +
      path(`M${x + textWidth(label, 9, true) + 6} ${y + 2}h${n(width - textWidth(label, 9, true) - 6)}`, "none", `stroke="#9ca3af" stroke-width="0.8"`) +
      fitted(x + textWidth(label, 9, true) + 10, y - 2, value, width - textWidth(label, 9, true) - 12, { size: 10, fill: k.primary, bold: true });
    const terms = c.terms ? c.terms : "Valid for the named holder only. Not exchangeable for cash.";
    return (
      rect(0, 0, W, H, "#ffffff") +
      path(`M0 0H${W}V36C${W * 0.7} 56 ${W * 0.3} 24 0 44Z`, k.primary) +
      fitted(28, 30, c.kicker, 250, { size: 16, fill: "#ffffff", italic: true, bold: true }) +
      rect(20, 60, 190, 162, "#ffffff", `rx="14" stroke="${k.primary}" stroke-width="1.5"`) +
      text(34, 84, "HOW TO REDEEM", { size: 9, fill: k.primary, bold: true, letterSpacing: 1 }) +
      fitted(34, 102, "Present this voucher and its code", 170, { size: 8, fill: "#4b5563" }) +
      fitted(34, 116, "when you arrive.", 170, { size: 8, fill: "#4b5563" }) +
      text(34, 142, "TERMS", { size: 9, fill: k.primary, bold: true, letterSpacing: 1 }) +
      fitted(34, 160, terms, 170, { size: 8, fill: "#4b5563", minSize: 6 }) +
      fitted(34, 208, c.phone ?? c.website ?? "", 170, { size: 8, fill: "#4b5563", bold: true }) +
      line(236, 96, "TO:", c.participantName, 220) +
      line(476, 96, "FROM:", c.logo.orgName, 220) +
      line(236, 136, "AMOUNT:", c.price ?? "", 220) +
      line(476, 136, "ISSUE DATE:", c.date ?? "", 220) +
      line(236, 176, "SIGNATURE:", "", 220) +
      line(476, 176, "NUMBER:", c.registrationNumber, 220) +
      rect(236, 196, 460, 26, "#f3f4f6", `rx="4"`) +
      fitted(466, 213, "Present this voucher to redeem your gift.", 440, { size: 9, fill: "#374151", anchor: "middle", bold: true })
    );
  },
};

// ---------------------------------------------------------------------------
// Summit: a blue conference ticket with a photo box and a white barcode stub.

const summit: TicketDesign = {
  id: "summit",
  name: "Summit",
  defaults: { primary: "#2f5fb3", secondary: "#e8eef9" },
  codes: "barcode",
  render(c, k, ctx) {
    const STUB = 560;
    const art =
      rect(360, 58, 110, 76, ctx.linear([shade(k.primary, 0.4), tint(k.primary, 0.3)], [0, 1, 1, 0])) +
      crowd(360, 134, 110, 36, shade(k.primary, 0.6), 9);
    return (
      rect(0, 0, W, H, k.primary) +
      dots(420, 20, 520, 20, 1.4, 12, "#ffffff") +
      fitted(32, 34, c.kicker.toUpperCase(), 250, { size: 8, fill: "#dbeafe", letterSpacing: 1.2, bold: true }) +
      fitted(420, 34, numberText(c), 120, { size: 8, fill: "#dbeafe", bold: true }) +
      fitted(32, 90, c.title.toUpperCase(), 310, { size: 34, fill: "#ffffff", bold: true, minSize: 14 }) +
      fitted(32, 118, c.subtitle, 310, { size: 12, fill: "#dbeafe" }) +
      path("M32 132h200", "none", `stroke="#ffffff" stroke-width="1.4"`) +
      fitted(32, 160, (c.date ?? "").toUpperCase(), 250, { size: 16, fill: "#ffffff", bold: true }) +
      fitted(32, 178, c.venue ?? "", 300, { size: 9, fill: "#dbeafe" }) +
      issuedTo(32, 200, c, 300, { labelColor: "#bfdbfe", nameColor: "#ffffff", size: 12 }) +
      picture(ctx, c, rect(360, 58, 110, 76, "#fff"), [360, 58, 110, 76], art) +
      fitted(470, 150, c.venue ?? "", 110, { size: 7, fill: "#ffffff", anchor: "end" }) +
      fitted(540, 86, c.price ?? "", 70, { size: 20, fill: "#ffffff", bold: true, anchor: "end" }) +
      fitted(540, 176, c.time ?? "", 170, { size: 13, fill: "#ffffff", bold: true, anchor: "end", minSize: 8 }) +
      logo(c.logo, 360, 200, { mark: "#ffffff", textColor: "#ffffff", taglineColor: "#dbeafe", maxWidth: 180, scale: 0.6 }) +
      rect(STUB, 0, W - STUB, H, k.secondary) +
      perforation(STUB, shade(k.secondary, 0.3), "#ffffff") +
      vbarcode(c.barcode, 578, 26, 30, 188) +
      sideways(630, 212, c.title.toUpperCase(), 190, { size: 12, fill: k.primary, bold: true }) +
      sideways(648, 212, c.date ?? "", 190, { size: 8, fill: INK }) +
      sideways(664, 212, c.participantName, 190, { size: 8, fill: INK, bold: true }) +
      sideways(686, 212, c.price ? `ENTRY ${c.price}` : "", 190, { size: 9, fill: k.primary, bold: true }) +
      sideways(704, 212, c.registrationNumber, 190, { size: 7, fill: "#6b7280" })
    );
  },
};

// ---------------------------------------------------------------------------
// Stage: white panel, a slanted concert picture, and a purple details panel.

const stage: TicketDesign = {
  id: "stage",
  name: "Stage",
  defaults: { primary: "#4f2aa8", secondary: "#8b5cf6" },
  codes: "barcode",
  render(c, k, ctx) {
    const shape = polygon([[220, 0], [380, 0], [340, H], [180, H]], "#fff");
    const art =
      rect(180, 0, 200, H, ctx.linear(["#0f172a", shade(k.primary, 0.3)], [0, 0, 0, 1])) +
      polygon([[280, 0], [230, H], [330, H]], "#a5b4fc", `fill-opacity="0.18"`) +
      polygon([[300, 0], [350, H], [390, H]], "#f0abfc", `fill-opacity="0.14"`) +
      bokeh(180, 20, 200, 90, "#e0e7ff", 12, 13, 12) +
      crowd(170, 200, 230, 70, "#050510", 21);
    const words = c.title.toUpperCase().split(/\s+/);
    const first = words[0] ?? "";
    const rest = words.slice(1).join(" ");
    const titleBits = (x: number, y: number, size: number, maxWidth: number, color: string, lightColor: string) => {
      let s = size;
      while (s > 9 && textWidth(`${first} `, s, true) + textWidth(rest, s) > maxWidth) s -= 0.5;
      return (
        text(x, y, first, { size: s, fill: color, bold: true }) +
        fitted(x + textWidth(`${first} `, s, true), y, rest, maxWidth - textWidth(`${first} `, s, true), { size: s, fill: lightColor })
      );
    };
    return (
      rect(0, 0, W, H, "#ffffff") +
      picture(ctx, c, shape, [180, 0, 200, H], art) +
      polygon([[380, 0], [W, 0], [W, H], [340, H]], ctx.linear([k.primary, k.secondary], [0, 0, 1, 1])) +
      titleBits(24, 44, 20, 170, INK, "#6b7280") +
      fitted(24, 70, c.kicker, 170, { size: 9, fill: "#374151" }) +
      fitted(24, 84, c.subtitle, 170, { size: 9, fill: "#374151" }) +
      fitted(24, 124, (c.date ?? "").toUpperCase(), 170, { size: 18, fill: INK, bold: true, minSize: 10 }) +
      fitted(24, 142, c.time ?? "", 170, { size: 9, fill: "#374151" }) +
      priceTag(24, 176, c, 150, { labelColor: "#6b7280", valueColor: INK, size: 20, label: "TICKET PRICE" }) +
      logo(c.logo, 24, 222, { mark: k.primary, textColor: INK, taglineColor: "#6b7280", maxWidth: 150, scale: 0.55 }) +
      titleBits(400, 44, 18, 300, "#ffffff", "#e9d5ff") +
      fitted(400, 78, c.participantName ? `ISSUED TO: ${c.participantName}` : "", 300, { size: 10, fill: "#ffffff", bold: true }) +
      fitted(400, 100, c.venue ?? "", 300, { size: 10, fill: "#f3e8ff" }) +
      fitted(400, 122, c.date ?? "", 300, { size: 10, fill: "#f3e8ff" }) +
      c.fields
        .slice(0, 2)
        .map((f, i) => fitted(400, 144 + i * 20, `${f.label}: ${f.value}`, 300, { size: 10, fill: "#f3e8ff" }))
        .join("") +
      (c.barcode ? rect(560, 178, 140, 44, "#ffffff", `rx="3"`) + barcode(c.barcode, 566, 182, 128, 26, INK) : "") +
      fitted(630, 218, c.registrationNumber, 124, { size: 6.5, fill: INK, anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Night Party: red with a dancing crowd; QR code on the stub.

const nightParty: TicketDesign = {
  id: "night-party",
  name: "Night Party",
  defaults: { primary: "#e11d2e", secondary: "#7f1d1d" },
  codes: "qr",
  render(c, k, ctx) {
    const STUB = 560;
    return (
      rect(0, 0, W, H, ctx.linear([k.primary, shade(k.primary, 0.15)], [0, 0, 0, 1])) +
      circle(260, 110, 110, "#ffffff", `fill-opacity="0.06"`) +
      crowd(0, 214, STUB, 120, k.secondary, 17, 0.95) +
      rect(0, 214, STUB, 26, k.secondary) +
      fitted(20, 40, c.logo.orgName.toUpperCase(), 130, { size: 18, fill: "#ffffff", bold: true, minSize: 9 }) +
      fitted(20, 54, c.logo.tagline.toUpperCase(), 130, { size: 7, fill: "#fecaca", letterSpacing: 0.8 }) +
      fitted(90, 90, c.kicker.toUpperCase(), 300, { size: 14, fill: "#ffffff", bold: true }) +
      fitted(90, 140, c.title.toUpperCase(), 380, { size: 48, fill: "#ffffff", bold: true, minSize: 16 }) +
      fitted(300, 162, c.subtitle.toUpperCase(), 250, { size: 12, fill: "#ffffff", letterSpacing: 4, anchor: "middle" }) +
      fitted(540, 44, c.date ?? "", 150, { size: 20, fill: "#ffffff", bold: true, anchor: "end" }) +
      fitted(540, 60, c.time ?? "", 150, { size: 9, fill: "#ffffff", anchor: "end", bold: true }) +
      issuedTo(420, 186, c, 130, { labelColor: "#fecaca", nameColor: "#ffffff", size: 11 }) +
      fitted(20, 232, [c.venue, c.phone].filter(Boolean).join("  |  "), 380, { size: 9, fill: "#fecaca", bold: true }) +
      rect(STUB, 0, W - STUB, H, shade(k.primary, 0.1)) +
      perforation(STUB, "#fecaca", "#ffffff") +
      qrBox(c, 580, 20, 120, INK) +
      fitted(640, 168, c.title.toUpperCase(), 150, { size: 14, fill: "#ffffff", bold: true, anchor: "middle", minSize: 8 }) +
      fitted(640, 186, c.date ?? "", 150, { size: 9, fill: "#ffffff", anchor: "middle" }) +
      fitted(640, 206, c.price ?? "", 150, { size: 14, fill: "#ffffff", anchor: "middle", bold: true }) +
      fitted(640, 226, c.registrationNumber, 150, { size: 7, fill: "#fecaca", anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Stadium: dark with a yellow frame, QR code on the left and a barcode stub.

const stadium: TicketDesign = {
  id: "stadium",
  name: "Stadium",
  defaults: { primary: "#2b1a12", secondary: "#f6a91a" },
  codes: "both",
  render(c, k) {
    const STUB = 580;
    const info = ticketInfo(c, 3);
    return (
      rect(0, 0, W, H, "#fff7e8") +
      rect(8, 8, W - 16, H - 16, k.primary, `rx="14"`) +
      rect(20, 20, 120, 20, k.secondary, `rx="2"`) +
      fitted(80, 34, c.date ?? "", 110, { size: 9, fill: k.primary, bold: true, anchor: "middle" }) +
      rect(20, 46, 120, 20, k.secondary, `rx="2"`) +
      fitted(80, 60, c.time ?? "", 110, { size: 9, fill: k.primary, bold: true, anchor: "middle" }) +
      qrBox(c, 26, 76, 108, k.primary) +
      fitted(80, 206, c.registrationNumber, 120, { size: 7, fill: "#fde68a", anchor: "middle" }) +
      fitted(160, 76, c.title.toUpperCase(), 250, { size: 38, fill: "#ffffff", bold: true, minSize: 14 }) +
      fitted(160, 110, c.subtitle.toUpperCase(), 250, { size: 20, fill: k.secondary, bold: true, minSize: 10 }) +
      rect(160, 132, 404, 2, k.secondary) +
      infoBoxes(info, 160, 146, 92, 36, { fill: k.secondary, labelColor: k.primary, valueColor: k.primary, gap: 8 }) +
      issuedTo(160, 204, c, 250, { labelColor: "#fde68a", nameColor: "#ffffff", size: 12 }) +
      (c.price ? rect(470, 190, 90, 26, k.secondary, `rx="2"`) + fitted(515, 208, c.price, 84, { size: 13, fill: k.primary, bold: true, anchor: "middle" }) : "") +
      fitted(420, 28, c.kicker.toUpperCase(), 140, { size: 7, fill: "#fde68a", bold: true, anchor: "end" }) +
      fitted(560, 50, c.venue ?? "", 140, { size: 8, fill: "#ffffff", anchor: "end" }) +
      path(`M${STUB} 16V224`, "none", `stroke="${k.secondary}" stroke-width="1.5" stroke-dasharray="5 4"`) +
      circle(STUB, 8, 9, "#fff7e8") +
      circle(STUB, 232, 9, "#fff7e8") +
      fitted(650, 44, c.title.toUpperCase(), 110, { size: 16, fill: k.secondary, bold: true, anchor: "middle", minSize: 8 }) +
      fitted(650, 64, c.price ?? "VIP", 110, { size: 12, fill: "#ffffff", bold: true, anchor: "middle" }) +
      vbarcode(c.barcode, 600, 80, 100, 130, "#ffffff")
    );
  },
};

// ---------------------------------------------------------------------------
// Retro: maroon with a VIP pass panel, a record groove backdrop, and a script-style title.

const retro: TicketDesign = {
  id: "retro",
  name: "Retro",
  defaults: { primary: "#7a1020", secondary: "#f3c969" },
  codes: "qr",
  render(c, k) {
    const rings = Array.from({ length: 9 }, (_, i) => circle(470, 120, 40 + i * 16, "none", `stroke="#000000" stroke-opacity="0.18" stroke-width="6"`)).join("");
    return (
      rect(0, 0, W, H, k.primary) +
      circle(470, 120, 190, "#2a1b1b") +
      rings +
      rect(0, 0, 170, H, shade(k.primary, 0.2)) +
      path(`M170 8V232`, "none", `stroke="${k.secondary}" stroke-width="1.2" stroke-dasharray="4 4"`) +
      fitted(85, 32, "VIP PASS", 150, { size: 16, fill: "#ffffff", bold: true, anchor: "middle" }) +
      rect(20, 40, 130, 18, "none", `rx="9" stroke="${k.secondary}" stroke-width="1"`) +
      fitted(85, 53, c.registrationNumber ? `ID ${c.registrationNumber}` : "ADMIT ONE", 120, { size: 8, fill: k.secondary, anchor: "middle", bold: true }) +
      qrBox(c, 38, 68, 94, INK) +
      fitted(85, 188, c.participantName, 150, { size: 12, fill: "#ffffff", bold: true, anchor: "middle" }) +
      fitted(85, 212, c.price ? `Entry ${c.price}` : "", 150, { size: 11, fill: k.secondary, anchor: "middle", bold: true }) +
      fitted(460, 92, c.title.toUpperCase(), 380, { size: 50, fill: "#f8e7c1", bold: true, anchor: "middle", minSize: 16 }) +
      fitted(470, 128, c.subtitle, 300, { size: 26, fill: k.secondary, italic: true, bold: true, anchor: "middle", minSize: 12 }) +
      musicNote(250, 110, 28, k.secondary) +
      musicNote(650, 40, 26, k.secondary) +
      fitted(300, 178, (c.venue ?? "").toUpperCase(), 130, { size: 9, fill: "#ffffff", anchor: "middle", bold: true }) +
      path("M380 160V210 M560 160V210", "none", `stroke="#ffffff" stroke-opacity="0.6"`) +
      text(470, 170, c.kicker ? c.kicker.toUpperCase() : "", { size: 8, fill: "#ffffff", anchor: "middle", letterSpacing: 1 }) +
      fitted(470, 196, c.date ?? "", 160, { size: 18, fill: k.secondary, bold: true, anchor: "middle", minSize: 9 }) +
      fitted(640, 184, c.time ?? "", 150, { size: 10, fill: "#ffffff", anchor: "middle", bold: true }) +
      fitted(640, 200, c.phone ?? "", 150, { size: 9, fill: "#ffffff", anchor: "middle" })
    );
  },
};

// ---------------------------------------------------------------------------
// Rock Festival: black with a guitar headstock, framed date, and a barcode stub.

const rockFestival: TicketDesign = {
  id: "rock-festival",
  name: "Rock Festival",
  defaults: { primary: "#171717", secondary: "#7f1d1d" },
  codes: "barcode",
  render(c, k) {
    const STUB = 590;
    const rand = seeded(4);
    let splatter = "";
    for (let i = 0; i < 40; i++) splatter += circle(rand() * 200, 160 + rand() * 80, 2 + rand() * 12, k.secondary, `fill-opacity="${n(0.2 + rand() * 0.4)}"`);
    return (
      rect(0, 0, W, H, k.primary) +
      splatter +
      guitarHead(90, 10, 190, "#f5f5f4") +
      fitted(380, 50, c.title.toUpperCase(), 330, { size: 28, fill: "#ffffff", bold: true, anchor: "middle", minSize: 12 }) +
      fitted(380, 80, c.subtitle.toUpperCase(), 330, { size: 18, fill: "#ffffff", bold: true, anchor: "middle", minSize: 9 }) +
      rect(250, 94, 260, 28, "none", `stroke="#ffffff" stroke-width="1.6"`) +
      fitted(380, 114, [c.date, c.time].filter(Boolean).join("  "), 250, { size: 14, fill: "#ffffff", bold: true, anchor: "middle" }) +
      fitted(380, 144, c.kicker, 330, { size: 11, fill: "#ffffff", bold: true, anchor: "middle" }) +
      fitted(380, 162, c.venue ?? "", 330, { size: 10, fill: "#e5e5e5", anchor: "middle" }) +
      issuedTo(380, 186, c, 300, { labelColor: "#a3a3a3", nameColor: "#ffffff", size: 12, anchor: "middle" }) +
      fitted(380, 226, [c.website, c.phone].filter(Boolean).join("  |  "), 330, { size: 8, fill: "#a3a3a3", anchor: "middle" }) +
      path(`M${STUB - 20} 10V230`, "none", `stroke="#ffffff" stroke-width="1" stroke-dasharray="3 3"`) +
      sideways(STUB, 224, c.title.toUpperCase(), 210, { size: 12, fill: "#ffffff", bold: true }) +
      sideways(STUB + 18, 224, [c.price, "ADMIT ONE"].filter(Boolean).join("  "), 210, { size: 8, fill: "#ffffff" }) +
      sideways(STUB + 32, 224, c.registrationNumber, 210, { size: 7, fill: "#a3a3a3" }) +
      rect(648, 12, 56, 216, "#ffffff", `rx="3"`) +
      vbarcode(c.barcode, 658, 24, 36, 192)
    );
  },
};

// ---------------------------------------------------------------------------
// Classical: warm brown with a picture panel and gold type; barcode stub.

const classical: TicketDesign = {
  id: "classical",
  name: "Classical",
  defaults: { primary: "#6b4a1f", secondary: "#f1d58a" },
  codes: "barcode",
  render(c, k, ctx) {
    const STUB = 580;
    const art =
      rect(150, 0, 290, H, ctx.linear([shade(k.primary, 0.3), tint(k.primary, 0.2)], [0, 0, 1, 1])) +
      Array.from({ length: 7 }, (_, i) =>
        path(`M${150 + i * 45} 0C${190 + i * 45} 80 ${110 + i * 45} 160 ${170 + i * 45} ${H}`, "none", `stroke="${k.secondary}" stroke-opacity="0.35" stroke-width="3"`),
      ).join("") +
      musicNote(300, 60, 60, k.secondary) +
      musicNote(360, 150, 40, k.secondary);
    return (
      rect(0, 0, STUB, H, ctx.linear([tint(k.primary, 0.1), shade(k.primary, 0.35)], [0, 0, 1, 1])) +
      picture(ctx, c, rect(150, 0, 290, H, "#fff"), [150, 0, 290, H], art) +
      rect(150, 0, 290, H, "#000000", `fill-opacity="${c.image ? "0.15" : "0"}"`) +
      fitted(24, 56, c.title.toUpperCase(), 190, { size: 30, fill: k.secondary, bold: true, minSize: 12 }) +
      fitted(24, 82, c.subtitle.toUpperCase(), 190, { size: 16, fill: "#fdf4dc", bold: true, minSize: 8 }) +
      fitted(24, 128, (c.time ?? "").toUpperCase(), 180, { size: 20, fill: "#fdf4dc", bold: true, minSize: 10 }) +
      fitted(24, 146, (c.date ?? "").toUpperCase(), 180, { size: 11, fill: k.secondary, bold: true }) +
      issuedTo(24, 176, c, 180, { labelColor: k.secondary, nameColor: "#ffffff", size: 12 }) +
      logo(c.logo, 24, 222, { mark: k.secondary, textColor: "#ffffff", taglineColor: k.secondary, maxWidth: 170, scale: 0.55 }) +
      fitted(456, 150, c.kicker.toUpperCase(), 120, { size: 11, fill: "#ffffff", bold: true }) +
      fitted(456, 168, c.venue ?? "", 120, { size: 8, fill: "#fdf4dc" }) +
      rect(STUB, 0, W - STUB, H, "#1f150c") +
      path(`M${STUB} 10V230`, "none", `stroke="${k.secondary}" stroke-width="1.4" stroke-dasharray="5 5"`) +
      fitted(650, 36, "LIVE", 120, { size: 12, fill: "#fdf4dc", bold: true, anchor: "middle" }) +
      fitted(650, 60, c.price ?? "", 120, { size: 18, fill: k.secondary, bold: true, anchor: "middle" }) +
      sideways(612, 224, numberText(c), 150, { size: 8, fill: "#fdf4dc" }) +
      rect(628, 76, 66, 150, "#ffffff", `rx="3"`) +
      vbarcode(c.barcode, 638, 84, 46, 134)
    );
  },
};

export const TICKET_DESIGNS_A: TicketDesign[] = [
  blaze,
  neonPass,
  awards,
  funFair,
  giftVoucher,
  summit,
  stage,
  nightParty,
  stadium,
  retro,
  rockFestival,
  classical,
];
