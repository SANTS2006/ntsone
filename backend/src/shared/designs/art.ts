/**
 * Decorative artwork for the ticket and card designs: crowds, lights, stripes, icons.
 * Everything is plain SVG shapes, so it renders the same in the browser and in PDFs.
 */
import { circle, esc, fitText, n, path, polygon, rect, FONT_FAMILY, text, type Ctx, type TextOptions } from "./svg.js";

/** A small repeatable random sequence, so artwork looks the same every time it's drawn. */
export function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** A concert crowd: heads and raised arms along a baseline. */
export function crowd(x: number, baseline: number, width: number, height: number, fill: string, seed = 3, opacity = 1) {
  const rand = seeded(seed);
  let d = "";
  const step = height * 0.42;
  for (let px = x - step; px < x + width + step; px += step * (0.7 + rand() * 0.5)) {
    const headR = height * (0.13 + rand() * 0.05);
    const headY = baseline - height * (0.45 + rand() * 0.2);
    d += `M${n(px - headR * 1.8)} ${n(baseline)}Q${n(px - headR * 1.6)} ${n(headY + headR * 1.4)} ${n(px)} ${n(headY + headR * 1.3)}Q${n(px + headR * 1.6)} ${n(headY + headR * 1.4)} ${n(px + headR * 1.8)} ${n(baseline)}Z`;
    d += `M${n(px - headR)} ${n(headY)}a${n(headR)} ${n(headR)} 0 1 0 ${n(headR * 2)} 0a${n(headR)} ${n(headR)} 0 1 0 ${n(-headR * 2)} 0Z`;
    if (rand() > 0.45) {
      // A raised arm with an open hand.
      const armX = px + (rand() > 0.5 ? headR * 1.4 : -headR * 1.4);
      const top = baseline - height * (0.85 + rand() * 0.15);
      const lean = (rand() - 0.5) * headR * 2;
      d += `M${n(armX - headR * 0.35)} ${n(headY + headR * 2)}L${n(armX + lean - headR * 0.3)} ${n(top + headR)}L${n(armX + lean + headR * 0.3)} ${n(top + headR)}L${n(armX + headR * 0.35)} ${n(headY + headR * 2)}Z`;
      d += `M${n(armX + lean - headR * 0.55)} ${n(top + headR)}a${n(headR * 0.55)} ${n(headR * 0.7)} 0 1 1 ${n(headR * 1.1)} 0Z`;
    }
  }
  d += `M${n(x)} ${n(baseline)}h${n(width)}v${n(height * 0.25)}h${n(-width)}Z`;
  return path(d, fill, opacity < 1 ? `fill-opacity="${n(opacity)}"` : "");
}

/** Soft out-of-focus light circles. */
export function bokeh(x: number, y: number, width: number, height: number, color: string, count: number, seed = 5, maxR = 26) {
  const rand = seeded(seed);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += circle(x + rand() * width, y + rand() * height, maxR * (0.25 + rand() * 0.75), color, `fill-opacity="${n(0.08 + rand() * 0.22)}"`);
  }
  return out;
}

/** Diagonal stripes filling a box, clipped to it. */
export function stripes(ctx: Ctx, x: number, y: number, width: number, height: number, color: string, gap = 10, weight = 3, opacity = 1) {
  let d = "";
  for (let i = -height; i < width + height; i += gap) {
    d += `M${n(x + i)} ${n(y + height)}L${n(x + i + height)} ${n(y)}`;
  }
  const clip = ctx.clip(rect(x, y, width, height, "#fff"));
  return `<g clip-path="${clip}">${path(d, "none", `stroke="${color}" stroke-width="${n(weight)}" stroke-opacity="${n(opacity)}"`)}</g>`;
}

/** Text turned sideways, reading bottom to top (or top to bottom with `angle` 90). */
export function sideways(x: number, y: number, value: string, maxWidth: number, o: TextOptions & { minSize?: number }, angle = -90) {
  if (!value) return "";
  const fit = fitText(value, maxWidth, o.size, { bold: o.bold, minSize: o.minSize ?? o.size * 0.6, letterSpacing: o.letterSpacing });
  return `<g transform="rotate(${angle} ${n(x)} ${n(y)})">${text(x, y, fit.text, { ...o, size: fit.size })}</g>`;
}

export interface InfoBox {
  label: string;
  value: string;
}

/** Labelled value boxes in a row, e.g. GATE / ROW / SEAT. */
export function infoBoxes(
  items: InfoBox[],
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number,
  { gap = 8, fill, labelColor, valueColor, radius = 4, stroke }: { gap?: number; fill: string; labelColor: string; valueColor: string; radius?: number; stroke?: string },
) {
  return items
    .map((item, i) => {
      const bx = x + i * (boxWidth + gap);
      const valueFit = fitText(item.value, boxWidth - 6, boxHeight * 0.36, { bold: true, minSize: 6 });
      return (
        rect(bx, y, boxWidth, boxHeight, fill, `rx="${radius}"${stroke ? ` stroke="${stroke}" stroke-width="1"` : ""}`) +
        text(bx + boxWidth / 2, y + boxHeight * 0.36, item.label.toUpperCase(), { size: Math.min(8, boxHeight * 0.22), fill: labelColor, anchor: "middle", bold: true, letterSpacing: 0.6 }) +
        text(bx + boxWidth / 2, y + boxHeight * 0.8, valueFit.text, { size: valueFit.size, fill: valueColor, anchor: "middle", bold: true })
      );
    })
    .join("");
}

/** Up to `max` boxes from the ticket's date, time, and chosen form answers. */
export function ticketInfo(c: { date?: string; time?: string; fields: { label: string; value: string }[] }, max = 4): InfoBox[] {
  const items: InfoBox[] = [];
  if (c.date) items.push({ label: "Date", value: c.date });
  if (c.time) items.push({ label: "Time", value: c.time });
  for (const f of c.fields) items.push({ label: f.label, value: f.value });
  return items.slice(0, max);
}

/** A row of evenly spaced dots, e.g. a perforation or a decorative trim. */
export function dots(x1: number, y1: number, x2: number, y2: number, r: number, count: number, fill: string) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    out += circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, fill);
  }
  return out;
}

export function star(cx: number, cy: number, r: number, fill: string, points = 5) {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI / points) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return polygon(pts, fill);
}

/** A stage microphone, `size` tall, drawn from its top centre. */
export function microphone(x: number, y: number, size: number, fill: string, grille = "#ffffff") {
  const s = size / 100;
  const head =
    `M${n(x - 22 * s)} ${n(y + 24 * s)}a${n(22 * s)} ${n(24 * s)} 0 0 1 ${n(44 * s)} 0v${n(22 * s)}a${n(22 * s)} ${n(22 * s)} 0 0 1 ${n(-44 * s)} 0Z`;
  let grid = "";
  for (let i = 1; i < 5; i++) grid += `M${n(x - 20 * s)} ${n(y + (8 + i * 9) * s)}h${n(40 * s)}`;
  for (let i = -2; i <= 2; i++) grid += `M${n(x + i * 8 * s)} ${n(y + 4 * s)}v${n(58 * s)}`;
  return (
    path(head, fill) +
    path(grid, "none", `stroke="${grille}" stroke-width="${n(1.4 * s)}" stroke-opacity="0.55"`) +
    path(`M${n(x - 30 * s)} ${n(y + 40 * s)}a${n(30 * s)} ${n(30 * s)} 0 0 0 ${n(60 * s)} 0`, "none", `stroke="${fill}" stroke-width="${n(5 * s)}"`) +
    rect(x - 3.5 * s, y + 70 * s, 7 * s, 22 * s, fill) +
    rect(x - 18 * s, y + 90 * s, 36 * s, 6 * s, fill, `rx="${n(3 * s)}"`)
  );
}

/** A vinyl record. */
export function vinyl(cx: number, cy: number, r: number, fill: string, label: string) {
  let grooves = "";
  for (let i = 1; i <= 4; i++) {
    grooves += circle(cx, cy, r * (0.45 + i * 0.12), "none", `stroke="#ffffff" stroke-opacity="0.12" stroke-width="${n(r * 0.012)}"`);
  }
  return circle(cx, cy, r, fill) + grooves + circle(cx, cy, r * 0.32, label) + circle(cx, cy, r * 0.05, fill);
}

/** A guitar headstock with tuning pegs, pointing up. */
export function guitarHead(x: number, y: number, size: number, fill: string, pegs = "#9ca3af") {
  const s = size / 100;
  let pegMarks = "";
  for (let i = 0; i < 6; i++) {
    const py = y + (16 + i * 11) * s;
    pegMarks += circle(x - 22 * s, py, 4.5 * s, pegs) + circle(x - 12 * s, py, 2.2 * s, "#374151");
  }
  return (
    path(
      `M${n(x - 14 * s)} ${n(y + 100 * s)}L${n(x - 16 * s)} ${n(y + 12 * s)}Q${n(x - 16 * s)} ${n(y)} ${n(x - 2 * s)} ${n(y + 2 * s)}L${n(x + 16 * s)} ${n(y + 8 * s)}Q${n(x + 22 * s)} ${n(y + 30 * s)} ${n(x + 10 * s)} ${n(y + 42 * s)}L${n(x + 8 * s)} ${n(y + 100 * s)}Z`,
      fill,
    ) +
    pegMarks +
    path(`M${n(x - 6 * s)} ${n(y + 14 * s)}V${n(y + 100 * s)}M${n(x)} ${n(y + 14 * s)}V${n(y + 100 * s)}`, "none", `stroke="#9ca3af" stroke-width="${n(0.8 * s)}"`)
  );
}

/** A wrapped gift box with a bow. */
export function giftBox(x: number, y: number, size: number, box: string, ribbon: string) {
  const s = size / 100;
  return (
    rect(x, y + 30 * s, 100 * s, 70 * s, box, `rx="${n(4 * s)}"`) +
    rect(x - 6 * s, y + 20 * s, 112 * s, 18 * s, box, `rx="${n(3 * s)}"`) +
    rect(x + 44 * s, y + 20 * s, 12 * s, 80 * s, ribbon) +
    path(
      `M${n(x + 50 * s)} ${n(y + 20 * s)}C${n(x + 30 * s)} ${n(y - 10 * s)} ${n(x + 10 * s)} ${n(y + 10 * s)} ${n(x + 50 * s)} ${n(y + 20 * s)}C${n(x + 90 * s)} ${n(y + 10 * s)} ${n(x + 70 * s)} ${n(y - 10 * s)} ${n(x + 50 * s)} ${n(y + 20 * s)}Z`,
      ribbon,
    )
  );
}

/** A planet with a highlight. */
export function planet(cx: number, cy: number, r: number, ctx: Ctx, from: string, to: string) {
  return circle(cx, cy, r, ctx.linear([from, to], [0, 0, 1, 1])) + circle(cx - r * 0.3, cy - r * 0.35, r * 0.18, "#ffffff", `fill-opacity="0.12"`);
}

export function rocket(cx: number, cy: number, size: number, fill: string) {
  const s = size / 100;
  return path(
    `M${n(cx)} ${n(cy - 50 * s)}C${n(cx + 18 * s)} ${n(cy - 30 * s)} ${n(cx + 18 * s)} ${n(cy + 10 * s)} ${n(cx + 12 * s)} ${n(cy + 28 * s)}L${n(cx + 26 * s)} ${n(cy + 44 * s)}L${n(cx + 10 * s)} ${n(cy + 40 * s)}L${n(cx)} ${n(cy + 50 * s)}L${n(cx - 10 * s)} ${n(cy + 40 * s)}L${n(cx - 26 * s)} ${n(cy + 44 * s)}L${n(cx - 12 * s)} ${n(cy + 28 * s)}C${n(cx - 18 * s)} ${n(cy + 10 * s)} ${n(cx - 18 * s)} ${n(cy - 30 * s)} ${n(cx)} ${n(cy - 50 * s)}Z`,
    "none",
    `stroke="${fill}" stroke-width="${n(4 * s)}" stroke-linejoin="round"`,
  );
}

/** A pair of joined eighth notes. */
export function musicNote(x: number, y: number, size: number, fill: string) {
  const s = size / 100;
  return (
    `<ellipse cx="${n(x)}" cy="${n(y + 80 * s)}" rx="${n(13 * s)}" ry="${n(10 * s)}" fill="${fill}" transform="rotate(-20 ${n(x)} ${n(y + 80 * s)})"/>` +
    `<ellipse cx="${n(x + 50 * s)}" cy="${n(y + 70 * s)}" rx="${n(13 * s)}" ry="${n(10 * s)}" fill="${fill}" transform="rotate(-20 ${n(x + 50 * s)} ${n(y + 70 * s)})"/>` +
    path(
      `M${n(x + 10 * s)} ${n(y + 78 * s)}V${n(y + 12 * s)}L${n(x + 60 * s)} ${n(y)}V${n(y + 68 * s)}H${n(x + 55 * s)}V${n(y + 12 * s)}L${n(x + 15 * s)} ${n(y + 22 * s)}V${n(y + 78 * s)}Z`,
      fill,
    )
  );
}

/** A checkered band, like a racing finish flag. */
export function checkerBand(x: number, y: number, width: number, height: number, cell: number, dark: string, light: string) {
  let d = "";
  for (let r = 0; r * cell < height; r++) {
    for (let c = r % 2; c * cell < width; c += 2) d += `M${n(x + c * cell)} ${n(y + r * cell)}h${n(cell)}v${n(cell)}h${n(-cell)}z`;
  }
  return rect(x, y, width, height, light) + path(d, dark);
}

/** Outline-only text for the big stacked titles some designs use. */
export function outlinedTitle(x: number, y: number, value: string, size: number, stroke: string, fill = "none", anchor: "start" | "middle" = "start") {
  if (!value) return "";
  return `<text x="${n(x)}" y="${n(y)}" font-family="${FONT_FAMILY}" font-size="${n(size)}" font-weight="bold" fill="${fill}" stroke="${stroke}" stroke-width="${n(size * 0.05)}"${anchor === "middle" ? ' text-anchor="middle"' : ""}>${esc(value)}</text>`;
}
