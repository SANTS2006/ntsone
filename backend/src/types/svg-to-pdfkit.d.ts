declare module "svg-to-pdfkit" {
  interface SvgToPdfOptions {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    assumePt?: boolean;
    fontCallback?: (family: string, bold: boolean, italic: boolean) => string;
  }
  export default function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x?: number,
    y?: number,
    options?: SvgToPdfOptions,
  ): void;
}
