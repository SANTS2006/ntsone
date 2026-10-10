export { code128 } from "./barcode.js";
export {
  ID_CARD_DESIGNS,
  ID_CARD_DESIGN_IDS,
  ID_CARD_HEIGHT,
  ID_CARD_WIDTH,
  idCardDesign,
  renderIdCard,
  type DesignColors,
  type IdCardContent,
} from "./idCards.js";
export {
  TICKET_DESIGNS,
  TICKET_DESIGN_IDS,
  TICKET_HEIGHT,
  TICKET_WIDTH,
  renderTicket,
  renderTicketSides,
  ticketDesign,
  ticketHasBack,
  type TicketContent,
} from "./tickets.js";
export { sampleQrMatrix } from "./svg.js";

export const DEFAULT_ID_CARD_TERMS = [
  "This card remains the property of the issuing organization and must be returned on request.",
  "Carry this card at all program activities and present it when asked.",
  "If found, please return it to the organization or scan the QR code to verify it.",
];
export { formatLeones } from "./money.js";

/** Roles admins can pick for a registrant's ID card; they can also type their own. */
export const DEFAULT_ROLE_OPTIONS = [
  "Participant",
  "Delegate",
  "Guest",
  "Visitor",
  "Invitee",
  "Speaker",
  "Volunteer",
  "Staff",
  "Official",
  "Media",
  "Choir",
  "Usher",
  "Pastor",
];
export * from "./businessDocs.js";
export {
  DEFAULT_STATUSES,
  STATUS_COLORS,
  resolveAllStatuses,
  resolveStatuses,
  statusKeyFromLabel,
  statusLabelFor,
  type StatusColor,
  type StatusConfig,
  type StatusDef,
  type StatusKind,
} from "./businessStatuses.js";
export * from "./businessCards.js";
