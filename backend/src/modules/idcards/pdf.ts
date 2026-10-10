import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import SVGtoPDF from "svg-to-pdfkit";
import { isOwnCloudinaryUrl } from "../../lib/cloudinaryUrl.js";
import { createLimiter } from "../../lib/limiter.js";

/**
 * Fetches one of this app's Cloudinary images as a data URI that both the PDF renderer
 * and a standalone SVG can embed. `transform` asks Cloudinary for a JPEG/PNG rendition,
 * since uploads may be WebP/HEIC, which PDFs can't embed.
 */
export async function fetchImageDataUri(url: string | undefined, transform: string): Promise<string | null> {
  if (!url || !isOwnCloudinaryUrl(url)) return null;
  const source = url.includes("/image/upload/") ? url.replace("/image/upload/", `/image/upload/${transform}/`) : url;
  try {
    const res = await fetch(source);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    const mime =
      bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : null;
    return mime ? `data:${mime};base64,${bytes.toString("base64")}` : null;
  } catch {
    return null;
  }
}

export const PHOTO_TRANSFORM = "c_fill,g_face,w_480,h_480,f_jpg,q_85";
// An event flyer keeps its whole design rather than being cropped to a face.
export const FLYER_TRANSFORM = "c_fill,g_center,w_600,h_600,f_jpg,q_85";
export const LOGO_TRANSFORM = "c_limit,w_600,h_300,f_png";
export const BACKGROUND_TRANSFORM = "c_limit,w_1600,h_1600,f_jpg,q_85";

export function qrMatrix(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => Boolean(qr.modules.get(r, c))));
}

// The designs are set in Poppins; the PDF embeds the same files the width tables were measured from.
const require = createRequire(import.meta.url);
const POPPINS = {
  Poppins: "400-normal",
  "Poppins-Bold": "700-normal",
  "Poppins-Italic": "400-italic",
  "Poppins-BoldItalic": "700-italic",
} as const;

export function registerPoppins(doc: PDFKit.PDFDocument) {
  for (const [name, weight] of Object.entries(POPPINS)) {
    doc.registerFont(name, require.resolve(`@fontsource/poppins/files/poppins-latin-${weight}.woff`));
  }
}

function poppinsFor(_family: string, bold: boolean, italic: boolean): string {
  return `Poppins${bold && italic ? "-BoldItalic" : bold ? "-Bold" : italic ? "-Italic" : ""}`;
}

/** Draws each SVG on its own page of the given size in points. */
function drawSvgPagesToPdf(svgs: string[], width: number, height: number): Promise<Buffer> {
  const doc = new PDFDocument({ size: [width, height], margin: 0, autoFirstPage: false });
  registerPoppins(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  for (const svg of svgs) {
    doc.addPage({ size: [width, height], margin: 0 });
    SVGtoPDF(doc, svg, 0, 0, { width, height, preserveAspectRatio: "xMidYMid meet", fontCallback: poppinsFor });
  }
  doc.end();
  return finished;
}

/** Formats a date the way the cards print it, e.g. "12 Mar 2026". */
export function cardDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// PDF drawing is CPU and memory heavy; a burst of downloads waits its turn instead of all running at once.
const pdfLimiter = createLimiter(3, 60);

export const svgPagesToPdf = (svgs: string[], width: number, height: number): Promise<Buffer> =>
  pdfLimiter(() => drawSvgPagesToPdf(svgs, width, height));
