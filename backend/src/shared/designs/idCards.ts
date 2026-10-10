import { Ctx, svgDocument } from "./svg.js";
import { H, W, type DesignColors, type IdCardContent, type IdCardDesign } from "./idCardKit.js";
import { aurora, business, chevron, crimson, customIdCard, executive, noir, prism, sunrise } from "./idCardsCore.js";
import { MORE_ID_CARD_DESIGNS } from "./idCardsMore.js";

export { ID_CARD_HEIGHT, ID_CARD_WIDTH, type DesignColors, type IdCardContent, type IdCardDesign } from "./idCardKit.js";

export const ID_CARD_DESIGNS: IdCardDesign[] = [
  aurora,
  chevron,
  noir,
  sunrise,
  crimson,
  executive,
  prism,
  business,
  ...MORE_ID_CARD_DESIGNS,
];
const ALL_DESIGNS = [...ID_CARD_DESIGNS, customIdCard];

export const ID_CARD_DESIGN_IDS = ALL_DESIGNS.map((d) => d.id) as [string, ...string[]];

export function idCardDesign(id: string): IdCardDesign {
  return ALL_DESIGNS.find((d) => d.id === id) ?? aurora;
}

export function renderIdCard(designId: string, content: IdCardContent, colors: DesignColors): { front: string; back: string } {
  const design = idCardDesign(designId);
  const frontCtx = new Ctx();
  const front = svgDocument(W, H, frontCtx, design.front(content, colors, frontCtx));
  const backCtx = new Ctx();
  const back = svgDocument(W, H, backCtx, design.back(content, colors, backCtx));
  return { front, back };
}
