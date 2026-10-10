import { recordAudit } from "../audit/recorder.js";
import { assertDocumentsUnlocked } from "../payments/gate.js";
import { env } from "../../config/env.js";
import { participantFileName } from "../../lib/downloadName.js";
import { AppError } from "../../lib/errors.js";
import { code128, renderIdCard, type IdCardContent } from "../../shared/designs/index.js";
import * as formsRepo from "../forms/repository.js";
import * as programsRepo from "../programs/repository.js";
import { getProgramRole } from "../programs/access.js";
import * as registrationsRepo from "../registrations/repository.js";
import type { AuthenticatedUser } from "../users/types.js";
import { resolveTicketConfig } from "../tickets/schemas.js";
import * as verificationsRepo from "../verifications/repository.js";
import type { VerificationDocument } from "../verifications/repository.js";
import {
  BACKGROUND_TRANSFORM,
  cardDate,
  fetchImageDataUri,
  FLYER_TRANSFORM,
  LOGO_TRANSFORM,
  PHOTO_TRANSFORM,
  qrMatrix,
  svgPagesToPdf,
} from "./pdf.js";
import { readOverrides, resolveIdCardConfig, type DocumentOverrides, type IdCardConfig, type ResolvedIdCardConfig } from "./schemas.js";
import { notifyDocumentVerified } from "../notifications/service.js";

// Portrait CR-80 card, 2.125in x 3.375in, in PDF points.
const CARD_WIDTH_PT = 153;
const CARD_HEIGHT_PT = 243;

export interface GeneratedDocument {
  pdf: Buffer;
  fileName: string;
}

export type DocumentSide = "front" | "back";

/** Label/value pairs for the chosen form fields, taken from the form version the registrant submitted. */
export async function resolveExtraFields(
  registration: registrationsRepo.RegistrationRow,
  visibleFields: string[],
): Promise<{ label: string; value: string }[]> {
  const formVersion = await formsRepo.findFormById(registration.formId);
  const fields = formVersion ? (await formsRepo.getContent(formVersion.id)).fields : [];
  const fieldsByKey = new Map(fields.map((f) => [f.fieldKey, f]));
  const responses = (registration.responses as Record<string, unknown>) ?? {};

  return visibleFields
    .map((key) => {
      const field = fieldsByKey.get(key);
      const value = responses[key];
      if (!field || value === null || value === undefined || value === "") return null;
      return { label: field.label, value: Array.isArray(value) ? value.join(", ") : String(value) };
    })
    .filter((f): f is { label: string; value: string } => f !== null);
}

/** The verification link in a document's QR code; `doc` tells the scan log which document was scanned. */
export function verifyUrlFor(
  program: programsRepo.ProgramRow,
  registration: registrationsRepo.RegistrationRow,
  doc: "id-card" | "ticket",
): string {
  return `${env.APP_URL}/verify/${encodeURIComponent(program.slug)}/${encodeURIComponent(registration.registrationNumber)}?doc=${doc}`;
}

export async function organizationName(program: programsRepo.ProgramRow): Promise<string> {
  return (await programsRepo.findTenantName(program.tenantId)) ?? program.name;
}

export async function findPublicRegistration(slug: string, registrationNumber: string) {
  const program = await programsRepo.findProgramBySlug(slug);
  if (!program) throw AppError.notFound("Program not found");
  const registration = await registrationsRepo.findRegistrationByNumber(program.id, registrationNumber);
  if (!registration) throw AppError.notFound("Registration not found");
  return { program, registration };
}

export async function findAdminRegistration(programId: string, registrationId: string) {
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  const registration = await registrationsRepo.findRegistrationInProgram(programId, registrationId);
  if (!registration) throw AppError.notFound("Registration not found");
  return { program, registration };
}

export async function getConfig(
  programId: string,
): Promise<{ idCardEnabled: boolean; config: ResolvedIdCardConfig; organizationName: string }> {
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  return {
    idCardEnabled: program.idCardEnabled,
    config: resolveIdCardConfig(program.idCardConfig),
    organizationName: await organizationName(program),
  };
}

export async function updateConfig(programId: string, config: IdCardConfig) {
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  const updated = await programsRepo.updateProgramRow(programId, { idCardConfig: config });
  return resolveIdCardConfig(updated.idCardConfig);
}

export function idCardFileName(registration: registrationsRepo.RegistrationRow, extension: "pdf" | "png") {
  return participantFileName(registration.applicantName, `id-card:${registration.id}`, extension, "ID Card");
}

async function renderCard(program: programsRepo.ProgramRow, registration: registrationsRepo.RegistrationRow) {
  if (!program.idCardEnabled) throw AppError.conflict("ID cards are not enabled for this program");

  const config = resolveIdCardConfig(program.idCardConfig);
  const overrides = readOverrides(registration.documentOverrides);
  const responses = (registration.responses as Record<string, unknown>) ?? {};
  const roleAnswer = config.roleFieldKey ? responses[config.roleFieldKey] : undefined;
  const answeredRole = typeof roleAnswer === "string" && roleAnswer.trim() ? roleAnswer.trim() : undefined;

  // A photo set for this registrant wins; otherwise the card's photo setting decides.
  let photoUrl = overrides.photoUrl ?? undefined;
  if (!photoUrl && config.photoSource === "flyer") photoUrl = config.flyerUrl;
  if (!photoUrl && config.photoSource === "field" && config.photoFieldKey) {
    const files = await registrationsRepo.getRegistrationFiles(registration.id);
    photoUrl = files.find((f) => f.fieldKey === config.photoFieldKey)?.secureUrl;
  }
  const hidePhoto = !photoUrl && config.photoSource === "none";

  const [orgName, fields, photo, logoImage, background] = await Promise.all([
    organizationName(program),
    resolveExtraFields(registration, config.visibleFields),
    fetchImageDataUri(photoUrl, config.photoSource === "flyer" && !overrides.photoUrl ? FLYER_TRANSFORM : PHOTO_TRANSFORM),
    fetchImageDataUri(config.logoUrl, LOGO_TRANSFORM),
    config.template === "custom" ? fetchImageDataUri(config.backgroundImageUrl, BACKGROUND_TRANSFORM) : null,
  ]);

  const content: IdCardContent = {
    logo: { image: logoImage, orgName, tagline: program.name },
    name: registration.applicantName ?? "Registered Participant",
    role: config.showRole ? (overrides.role || answeredRole || config.roleText) : "",
    registrationNumber: config.showRegistrationNumber ? registration.registrationNumber : "",
    fields,
    issued: config.showDates ? cardDate(registration.createdAt) : undefined,
    validUntil: config.showDates ? cardDate(program.endDate) : undefined,
    // Without a photo the card shows a neutral silhouette, as in the preview.
    photo,
    hidePhoto,
    qr: config.showQrCode ? qrMatrix(verifyUrlFor(program, registration, "id-card")) : null,
    barcode: config.showBarcode ? code128(registration.registrationNumber) : null,
    terms: config.showTerms ? config.termsList : [],
    contact: config.showContact
      ? {
          phone: config.contactPhone,
          email: config.contactEmail,
          website: config.contactWebsite,
          address: config.contactAddress,
        }
      : {},
    signatureLabel: config.showSignature ? config.signatureLabel : "",
    background,
  };

  return renderIdCard(config.template, content, { primary: config.primaryColor, secondary: config.secondaryColor });
}

async function buildCardPdf(
  program: programsRepo.ProgramRow,
  registration: registrationsRepo.RegistrationRow,
): Promise<GeneratedDocument> {
  const { front, back } = await renderCard(program, registration);
  const pdf = await svgPagesToPdf([front, back], CARD_WIDTH_PT, CARD_HEIGHT_PT);
  return { pdf, fileName: idCardFileName(registration, "pdf") };
}

async function publicRegistrationWithCard(slug: string, registrationNumber: string) {
  const found = await findPublicRegistration(slug, registrationNumber);
  // Hidden from the success page means no public download either, not just a hidden button.
  if (!resolveIdCardConfig(found.program.idCardConfig).showOnConfirmation) throw AppError.notFound("ID card not available");
  assertDocumentsUnlocked(found.registration);
  return found;
}

/** Saves an admin's changes to one registrant's ID card (role, photo); null clears a change. */
export async function updateDocumentOverrides(programId: string, registrationId: string, input: DocumentOverrides) {
  const { registration } = await findAdminRegistration(programId, registrationId);
  const next = { ...readOverrides(registration.documentOverrides), ...input };
  const cleaned = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== null && value !== undefined && value !== ""));
  await registrationsRepo.updateDocumentOverrides(registration.id, cleaned);
  return cleaned;
}

export async function generateForRegistrationInProgram(programId: string, registrationId: string) {
  const { program, registration } = await findAdminRegistration(programId, registrationId);
  return buildCardPdf(program, registration);
}

export async function generateForPublicRegistration(slug: string, registrationNumber: string) {
  const { program, registration } = await publicRegistrationWithCard(slug, registrationNumber);
  return buildCardPdf(program, registration);
}

export interface RenderedImage {
  svg: string;
  /** What the download should be saved as, e.g. "Name-Ticket-CODE.png". */
  fileName: string;
  /** How many sides the document has; two-sided tickets download as PDFs. */
  sides?: number;
}

export async function svgForRegistrationInProgram(
  programId: string,
  registrationId: string,
  side: DocumentSide,
): Promise<RenderedImage> {
  const { program, registration } = await findAdminRegistration(programId, registrationId);
  return { svg: (await renderCard(program, registration))[side], fileName: idCardFileName(registration, "png") };
}

export async function svgForPublicRegistration(
  slug: string,
  registrationNumber: string,
  side: DocumentSide,
): Promise<RenderedImage> {
  const { program, registration } = await publicRegistrationWithCard(slug, registrationNumber);
  return { svg: (await renderCard(program, registration))[side], fileName: idCardFileName(registration, "png") };
}

export interface VerificationResult {
  registrationNumber: string;
  programName: string;
  applicantName: string | null;
  status: string;
  valid: boolean;
  documentType: VerificationDocument;
  verifiedAt: string;
  scannedByTeamMember: boolean;
  details: { label: string; value: string }[];
  submittedAt: string;
  /** True when this document was scanned before; only the first scan is logged. */
  alreadyVerified: boolean;
  firstVerifiedAt: string;
}

export interface VerificationContext {
  documentType: VerificationDocument;
  user?: AuthenticatedUser;
  ipAddress?: string;
  userAgent?: string;
}

/** Checks a scanned QR code and logs the scan for the program's Verifications tab. */
export async function verifyRegistration(
  slug: string,
  registrationNumber: string,
  context: VerificationContext,
): Promise<VerificationResult> {
  const program = await programsRepo.findProgramBySlug(slug);
  if (!program) throw AppError.notFound("Registration not found");
  const registration = await registrationsRepo.findRegistrationByNumber(program.id, registrationNumber);
  if (!registration) throw AppError.notFound("Registration not found");

  // An ID card or ticket that hasn't been paid for is not valid.
  const valid = registration.status !== "rejected" && registration.status !== "cancelled" && registration.paymentStatus !== "pending" && registration.paymentStatus !== "review" && registration.paymentStatus !== "refunded";
  void recordAudit({
    action: "verification.scan",
    actorType: context.user ? "user" : "visitor",
    actorUserId: context.user?.id ?? null,
    tenantId: program.tenantId,
    entityType: "registration",
    entityId: registration.id,
    outcome: valid ? "success" : "failed",
    metadata: { registrationNumber: registration.registrationNumber, document: context.documentType, valid, program: program.name },
    ipAddress: context.ipAddress,
  });
  // Only credit the scan to a signed-in person who is on this program's team.
  const verifiedBy = context.user && (await getProgramRole(context.user, program.id)) ? context.user.id : null;

  let firstVerifiedAt = new Date();
  let alreadyVerified = false;
  let recorded = false;
  try {
    ({ firstVerifiedAt, alreadyVerified } = await verificationsRepo.recordVerification({
      programId: program.id,
      registrationId: registration.id,
      documentType: context.documentType,
      valid,
      registrationStatus: registration.status,
      verifiedBy,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent?.slice(0, 400),
    }));
    recorded = !alreadyVerified;
  } catch (err) {
    // The check itself succeeded; a logging problem must not turn it into "not found".
    console.error("Could not record verification:", err);
  }

  // The team hears about each ID card or ticket once: on its first check-in.
  if (recorded && (context.documentType === "id_card" || context.documentType === "ticket")) {
    void notifyDocumentVerified(program, registration, {
      documentType: context.documentType,
      valid,
      verifiedAt: firstVerifiedAt,
      verifiedBy: verifiedBy && context.user ? `${context.user.name} (${context.user.email})` : null,
    });
  }

  // The same details the scanned document prints, so the checker can compare them.
  const visibleFields =
    context.documentType === "ticket" || (context.documentType === "link" && !program.idCardEnabled)
      ? resolveTicketConfig(program.ticketConfig).visibleFields
      : resolveIdCardConfig(program.idCardConfig).visibleFields;
  const details = await resolveExtraFields(registration, visibleFields).catch(() => []);

  return {
    registrationNumber: registration.registrationNumber,
    programName: program.name,
    applicantName: registration.applicantName,
    status: registration.status,
    valid,
    documentType: context.documentType,
    verifiedAt: new Date().toISOString(),
    scannedByTeamMember: Boolean(verifiedBy),
    details,
    submittedAt: registration.submittedAt.toISOString(),
    alreadyVerified,
    firstVerifiedAt: firstVerifiedAt.toISOString(),
  };
}
