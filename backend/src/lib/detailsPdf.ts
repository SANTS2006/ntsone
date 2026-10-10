import PDFDocument from "pdfkit";
import { registerPoppins } from "../modules/idcards/pdf.js";
import { createLimiter } from "./limiter.js";

export interface DetailsRow {
  label: string;
  value: string;
}

export interface DetailsSection {
  title?: string;
  rows: DetailsRow[];
}

export interface DetailsPdfInput {
  /** Big heading, e.g. the program or business name. */
  title: string;
  /** Line under the heading, e.g. "Registration details". */
  subtitle?: string;
  /** PNG/JPEG data URI shown beside the heading. */
  logo?: string | null;
  /** Highlighted facts under the header, e.g. registration number and date. */
  facts?: DetailsRow[];
  sections: DetailsSection[];
  /** Small print at the bottom of every page. */
  footer?: string;
  accentColor?: string;
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";

/**
 * A clean A4 document of labelled details split into sections, flowing onto as many pages
 * as it needs, with page numbers. Used for registration summaries, orders, and similar.
 */
function drawDetailsPdf(input: DetailsPdfInput): Promise<Buffer> {
  const accent = input.accentColor ?? "#2563eb";
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { Title: `${input.title} ${input.subtitle ?? ""}`.trim() } });
  registerPoppins(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const contentWidth = PAGE.width - MARGIN * 2;
  const bottom = PAGE.height - MARGIN - 24;

  // Header band
  doc.rect(0, 0, PAGE.width, 6).fill(accent);
  let x = MARGIN;
  const top = MARGIN - 8;
  if (input.logo) {
    try {
      doc.image(input.logo, MARGIN, top, { fit: [56, 56], align: "center", valign: "center" });
      x = MARGIN + 70;
    } catch {
      // An unreadable logo is left out rather than failing the document.
    }
  }
  doc.font("Poppins-Bold").fontSize(18).fillColor(INK).text(input.title, x, top + 4, { width: PAGE.width - MARGIN - x });
  if (input.subtitle) doc.font("Poppins").fontSize(10.5).fillColor(MUTED).text(input.subtitle, x, doc.y + 2, { width: PAGE.width - MARGIN - x });
  let y = Math.max(doc.y, top + 56) + 18;

  // Facts, two per row in tinted boxes
  const facts = input.facts ?? [];
  if (facts.length) {
    const boxWidth = (contentWidth - 12) / 2;
    for (let i = 0; i < facts.length; i += 2) {
      const pair = facts.slice(i, i + 2);
      const heights = pair.map((f) => doc.font("Poppins-Bold").fontSize(11).heightOfString(f.value || "-", { width: boxWidth - 24 }) + 34);
      const h = Math.max(...heights);
      if (y + h > bottom) {
        doc.addPage();
        y = MARGIN;
      }
      pair.forEach((f, j) => {
        const bx = MARGIN + j * (boxWidth + 12);
        doc.roundedRect(bx, y, boxWidth, h, 8).fill("#f1f5f9");
        doc.font("Poppins").fontSize(8).fillColor(MUTED).text(f.label.toUpperCase(), bx + 12, y + 9, { width: boxWidth - 24, characterSpacing: 0.6 });
        doc.font("Poppins-Bold").fontSize(11).fillColor(INK).text(f.value || "-", bx + 12, y + 22, { width: boxWidth - 24 });
      });
      y += h + 10;
    }
    y += 8;
  }

  // Sections of label/value rows
  const labelWidth = contentWidth * 0.36;
  const valueWidth = contentWidth - labelWidth - 12;
  for (const section of input.sections) {
    if (!section.rows.length) continue;
    if (section.title) {
      if (y + 44 > bottom) {
        doc.addPage();
        y = MARGIN;
      }
      doc.font("Poppins-Bold").fontSize(11.5).fillColor(accent).text(section.title, MARGIN, y, { width: contentWidth });
      y = doc.y + 4;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + contentWidth, y).lineWidth(1).strokeColor(accent).stroke();
      y += 6;
    }
    for (const row of section.rows) {
      const value = row.value || "-";
      const h =
        Math.max(
          doc.font("Poppins").fontSize(9.5).heightOfString(row.label, { width: labelWidth }),
          doc.font("Poppins").fontSize(10).heightOfString(value, { width: valueWidth }),
        ) + 12;
      if (y + h > bottom) {
        doc.addPage();
        y = MARGIN;
      }
      doc.font("Poppins").fontSize(9.5).fillColor(MUTED).text(row.label, MARGIN, y + 6, { width: labelWidth });
      doc.font("Poppins").fontSize(10).fillColor(INK).text(value, MARGIN + labelWidth + 12, y + 6, { width: valueWidth });
      y += h;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + contentWidth, y).lineWidth(0.5).strokeColor(RULE).stroke();
    }
    y += 18;
  }

  // Footer and page numbers on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise start a new page.
    doc.page.margins.bottom = 0;
    const fy = PAGE.height - MARGIN + 6;
    doc.font("Poppins").fontSize(8).fillColor(MUTED);
    if (input.footer) doc.text(input.footer, MARGIN, fy, { width: contentWidth - 80, lineBreak: false, height: 12, ellipsis: true });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, fy, { width: contentWidth, align: "right", lineBreak: false });
  }

  doc.end();
  return finished;
}

const detailsLimiter = createLimiter(3, 60);

export const renderDetailsPdf = (input: DetailsPdfInput): Promise<Buffer> => detailsLimiter(() => drawDetailsPdf(input));
