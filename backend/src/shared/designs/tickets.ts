import { Ctx, svgDocument } from "./svg.js";
import { H, W, type DesignColors, type TicketContent, type TicketDesign } from "./ticketKit.js";
import { customTicket, horizon, orbit } from "./ticketsCore.js";
import { MORE_TICKET_DESIGNS } from "./ticketsMore.js";

export { TICKET_HEIGHT, TICKET_WIDTH, type TicketContent, type TicketDesign } from "./ticketKit.js";

export const TICKET_DESIGNS: TicketDesign[] = [horizon, orbit, ...MORE_TICKET_DESIGNS];
const ALL_DESIGNS = [...TICKET_DESIGNS, customTicket];

export const TICKET_DESIGN_IDS = ALL_DESIGNS.map((d) => d.id) as [string, ...string[]];

export function ticketDesign(id: string): TicketDesign {
  return ALL_DESIGNS.find((d) => d.id === id) ?? horizon;
}

/** Whether the design has a back side (downloaded as a two-page PDF rather than an image). */
export function ticketHasBack(id: string): boolean {
  return Boolean(ticketDesign(id).back);
}

export function renderTicketSides(
  designId: string,
  content: TicketContent,
  colors: DesignColors,
): { front: string; back: string | null } {
  const design = ticketDesign(designId);
  // The printed codes follow the design: barcode designs don't gain a QR code, and vice versa.
  const fitted: TicketContent = {
    ...content,
    qr: design.codes === "barcode" ? null : content.qr,
    barcode: design.codes === "qr" ? null : content.barcode,
  };
  const frontCtx = new Ctx();
  const front = svgDocument(W, H, frontCtx, design.render(fitted, colors, frontCtx));
  if (!design.back) return { front, back: null };
  const backCtx = new Ctx();
  return { front, back: svgDocument(W, H, backCtx, design.back(fitted, colors, backCtx)) };
}

export function renderTicket(designId: string, content: TicketContent, colors: DesignColors): string {
  return renderTicketSides(designId, content, colors).front;
}
