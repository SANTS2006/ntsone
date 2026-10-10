import { assertDocumentsUnlocked } from "../payments/gate.js";
import { participantFileName } from "../../lib/downloadName.js";
import { AppError } from "../../lib/errors.js";
import { code128, formatLeones, renderTicketSides, ticketHasBack } from "../../shared/designs/index.js";
import { BACKGROUND_TRANSFORM, cardDate, fetchImageDataUri, FLYER_TRANSFORM, LOGO_TRANSFORM, qrMatrix, svgPagesToPdf } from "../idcards/pdf.js";
import {
  findAdminRegistration,
  findPublicRegistration,
  organizationName,
  resolveExtraFields,
  verifyUrlFor,
  type GeneratedDocument,
  type DocumentSide,
  type RenderedImage,
} from "../idcards/service.js";
import * as programsRepo from "../programs/repository.js";
import type * as registrationsRepo from "../registrations/repository.js";
import { resolveTicketConfig, type TicketConfig, type TicketConfigInput } from "./schemas.js";

// 7.5in x 2.5in landscape ticket in PDF points.
const TICKET_WIDTH_PT = 540;
const TICKET_HEIGHT_PT = 180;

export async function getConfig(
  programId: string,
): Promise<{ ticketEnabled: boolean; config: TicketConfig; organizationName: string }> {
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  return {
    ticketEnabled: program.ticketEnabled,
    config: resolveTicketConfig(program.ticketConfig),
    organizationName: await organizationName(program),
  };
}

export async function updateConfig(programId: string, config: TicketConfigInput): Promise<TicketConfig> {
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  const updated = await programsRepo.updateProgramRow(programId, { ticketConfig: config });
  return resolveTicketConfig(updated.ticketConfig);
}

function formatProgramDate(program: programsRepo.ProgramRow): string | undefined {
  const start = cardDate(program.startDate);
  if (!start) return undefined;
  const end = cardDate(program.endDate);
  return !end || start === end ? start : `${start} - ${end}`;
}

export function ticketFileName(registration: registrationsRepo.RegistrationRow, extension: "pdf" | "png") {
  return participantFileName(registration.applicantName, `ticket:${registration.id}`, extension, "Ticket");
}

async function renderProgramTicket(program: programsRepo.ProgramRow, registration: registrationsRepo.RegistrationRow) {
  if (!program.ticketEnabled) throw AppError.conflict("Tickets are not enabled for this program");

  const config = resolveTicketConfig(program.ticketConfig);
  const [orgName, fields, logoImage, background, eventImage] = await Promise.all([
    organizationName(program),
    resolveExtraFields(registration, config.visibleFields),
    fetchImageDataUri(config.logoUrl, LOGO_TRANSFORM),
    config.template === "custom" ? fetchImageDataUri(config.backgroundImageUrl, BACKGROUND_TRANSFORM) : null,
    fetchImageDataUri(config.eventImageUrl, FLYER_TRANSFORM),
  ]);

  const price = config.showPrice
    ? config.isPaid && config.priceAmount !== undefined
      ? formatLeones(config.priceAmount)
      : config.isPaid
        ? undefined
        : "FREE"
    : undefined;
  const details = config.showEventDetails;

  return renderTicketSides(
    config.template,
    {
      logo: { image: logoImage, orgName, tagline: program.name },
      kicker: config.kicker ?? orgName,
      title: config.eventTitle ?? program.name,
      subtitle: config.tagline ?? program.shortDescription ?? "",
      date: details ? (config.eventDate ?? formatProgramDate(program)) : undefined,
      time: details ? config.eventTime : undefined,
      venue: details ? config.venue : undefined,
      price,
      participantName: config.showParticipantName ? (registration.applicantName ?? "Registered Participant") : "",
      registrationNumber: config.showRegistrationNumber ? registration.registrationNumber : "",
      fields,
      phone: config.showContact ? config.contactPhone : undefined,
      website: config.showContact ? config.website : undefined,
      terms: config.terms,
      qr: config.showQrCode ? qrMatrix(verifyUrlFor(program, registration, "ticket")) : null,
      barcode: config.showBarcode ? code128(registration.registrationNumber) : null,
      background,
      image: eventImage,
      textColor: config.textColor,
      overlayOpacity: config.overlayOpacity,
    },
    { primary: config.primaryColor, secondary: config.secondaryColor },
  );
}

/** One side of the ticket as SVG. Two-sided tickets are saved as PDFs, one-sided ones as images. */
async function ticketImage(
  program: programsRepo.ProgramRow,
  registration: registrationsRepo.RegistrationRow,
  side: DocumentSide,
): Promise<RenderedImage> {
  const { front, back } = await renderProgramTicket(program, registration);
  const twoSided = ticketHasBack(resolveTicketConfig(program.ticketConfig).template);
  return {
    svg: side === "back" && back ? back : front,
    fileName: ticketFileName(registration, twoSided ? "pdf" : "png"),
    sides: back ? 2 : 1,
  };
}

async function buildTicketPdf(
  program: programsRepo.ProgramRow,
  registration: registrationsRepo.RegistrationRow,
): Promise<GeneratedDocument> {
  const { front, back } = await renderProgramTicket(program, registration);
  const pdf = await svgPagesToPdf(back ? [front, back] : [front], TICKET_WIDTH_PT, TICKET_HEIGHT_PT);
  return { pdf, fileName: ticketFileName(registration, "pdf") };
}

async function publicRegistrationWithTicket(slug: string, registrationNumber: string) {
  const found = await findPublicRegistration(slug, registrationNumber);
  if (!resolveTicketConfig(found.program.ticketConfig).showOnConfirmation) throw AppError.notFound("Ticket not available");
  assertDocumentsUnlocked(found.registration);
  return found;
}

export async function generateForRegistrationInProgram(programId: string, registrationId: string) {
  const { program, registration } = await findAdminRegistration(programId, registrationId);
  return buildTicketPdf(program, registration);
}

export async function generateForPublicRegistration(slug: string, registrationNumber: string) {
  const { program, registration } = await publicRegistrationWithTicket(slug, registrationNumber);
  return buildTicketPdf(program, registration);
}

export async function svgForRegistrationInProgram(
  programId: string,
  registrationId: string,
  side: DocumentSide,
): Promise<RenderedImage> {
  const { program, registration } = await findAdminRegistration(programId, registrationId);
  return ticketImage(program, registration, side);
}

export async function svgForPublicRegistration(
  slug: string,
  registrationNumber: string,
  side: DocumentSide,
): Promise<RenderedImage> {
  const { program, registration } = await publicRegistrationWithTicket(slug, registrationNumber);
  return ticketImage(program, registration, side);
}
