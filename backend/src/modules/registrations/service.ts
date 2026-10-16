import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { payments } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import type { PaginationInput } from "../../lib/pagination.js";
import { buildPaginatedResult } from "../../lib/pagination.js";
import { queueEmail } from "../email/outbox.js";
import { registrationConfirmationEmail } from "../email/templates.js";
import { resolveStatuses } from "../../shared/designs/index.js";
import { getBusiness } from "../businesses/service.js";
import * as formsService from "../forms/service.js";
import { notifyCustomer, notifyNewRegistration } from "../notifications/service.js";
import * as programsRepo from "../programs/repository.js";
import * as registrationsRepo from "./repository.js";
import { programStatusChoices, type ListRegistrationsQuery, type SubmitRegistrationInput, type UpdateStatusInput } from "./schemas.js";
import { counterBucket, formatRegistrationNumber, resolveNumberingConfig } from "./numbering.js";
import { chargePlanFor } from "../payments/charge.js";
import { offersPayInPerson, resolvePaymentConfig } from "../payments/pricing.js";
import { refundableAt } from "../payments/refunds.js";
import { assertPaymentAllowed } from "../payments/fraud.js";
import { assertPaymentsAvailable, startPayment, type PaymentStart } from "../payments/service.js";
import { dropHiddenFileUploads, evaluateRule, extractApplicantContact, missingRequiredAnswers, validateAndNormalizeResponses } from "./validation.js";

function isRegistrationWindowOpen(program: programsRepo.ProgramRow): boolean {
  const now = new Date();
  if (program.registrationStartDate && now < program.registrationStartDate) return false;
  if (program.registrationEndDate && now > program.registrationEndDate) return false;
  return true;
}

export async function submitRegistration(
  slug: string,
  input: SubmitRegistrationInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
) {
  const program = await programsRepo.findProgramBySlug(slug);
  if (!program) throw AppError.notFound("Program not found");
  if (program.status !== "published" || !program.registrationEnabled) {
    throw AppError.conflict("Registration is not currently open for this program");
  }
  if (!isRegistrationWindowOpen(program)) {
    throw AppError.conflict("Registration is not currently open for this program");
  }

  const published = await formsService.getPublishedFormWithContent(program.id);
  if (!published) throw AppError.conflict("This program does not have a registration form available yet");
  // Consent is asked just before submitting, and only when the admin's rules for it match the answers.
  const consentRules = (published.form.consentConditions ?? []) as Parameters<typeof evaluateRule>[0][];
  if (published.form.requireConsent && consentRules.every((rule) => evaluateRule(rule, input.responses)) && input.consentAccepted !== true) {
    throw AppError.validation("You must agree to the consent statement to register");
  }

  const submittedFiles = input.files.map((f) => ({
    fieldKey: f.fieldKey,
    url: f.url,
    publicId: f.publicId,
    filename: f.filename,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
  }));

  const files = dropHiddenFileUploads(published.fields, input.responses, submittedFiles, published.sections);
  const cleanedResponses = validateAndNormalizeResponses(published.fields, input.responses, files, published.sections);
  const contact = extractApplicantContact(published.fields, cleanedResponses);

  if (program.oneRegistrationPerEmail && contact.email && (await registrationsRepo.emailAlreadyRegistered(program.id, contact.email))) {
    throw alreadyRegistered();
  }

  // What has to be paid, worked out here from the program's own prices. Checked before anything is saved.
  const documentsInPerson = input.documentsInPerson === true;
  if (documentsInPerson && !offersPayInPerson(program, resolvePaymentConfig(program.paymentConfig))) {
    throw AppError.validation("Paying for the ID card or ticket in person is not available for this program. Please refresh the page and try again.");
  }
  const plan = chargePlanFor(program, published.form, input.items, { documentsInPerson });
  if (plan?.charge) {
    assertPaymentsAvailable();
    await assertPaymentAllowed({ ip: context.ip, email: contact.email, phone: contact.phone });
  }
  // The order's items and total are kept with the order, as they were when it was placed.
  if (plan && plan.purpose === "order") cleanedResponses.__order = { lines: plan.lines, totalMinor: plan.totalMinor, currency: "SLE" };

  const registration = await createRegistrationWithNumber(
    program,
    published.form.id,
    contact,
    cleanedResponses,
    files,
    undefined,
    plan?.charge ? { status: "pending", amountDueMinor: plan.totalMinor } : undefined,
    documentsInPerson,
  );
  const registrationNumber = registration.registrationNumber;

  let payment: PaymentStart | null = null;
  if (plan?.charge) {
    payment = await startPayment({
      program,
      registration,
      purpose: plan.purpose,
      lines: plan.lines,
      totalMinor: plan.totalMinor,
      payer: contact,
      context,
    });
  }

  if (program.kind === "order_form") {
    // Customers get an order confirmation branded with the business instead.
    void notifyCustomer(program, registration, { isNew: true, fields: published.fields, files });
  } else if (contact.email) {
    // Queued rather than sent here: the registration is already saved, and a slow or failing mail
    // provider must neither slow the response nor lose the confirmation.
    void queueEmail({
      to: contact.email,
      toName: contact.name ?? contact.email,
      subject: `Registration confirmed - ${program.name}`,
      html: registrationConfirmationEmail({
        programName: program.name,
        registrationNumber,
        applicantName: contact.name ?? "there",
      }),
    });
  }

  // Sent in the background so the registrant isn't kept waiting on the team's emails.
  void notifyNewRegistration(program, registration, published.fields, files);

  return {
    registration,
    confirmationMessage: published.form.confirmationMessage,
    // Shown on the success page only when the admin's rules for it (if any) match the answers.
    showRegistrationNumber:
      published.form.showRegistrationNumber &&
      ((published.form.registrationNumberConditions ?? []) as Parameters<typeof evaluateRule>[0][]).every((rule) => evaluateRule(rule, input.responses)),
    // Not offered for download when the registrant chose to buy them in person.
    idCardAvailable: program.idCardEnabled && showsOnConfirmation(program.idCardConfig) && !documentsInPerson,
    ticketAvailable: program.ticketEnabled && showsOnConfirmation(program.ticketConfig) && !documentsInPerson,
    documentsInPerson,
    payment,
  };
}

const MAX_NUMBER_ATTEMPTS = 25;

/** Saves a registration under the next free registration number for the program. */
export async function createRegistrationWithNumber(
  program: programsRepo.ProgramRow,
  formId: string,
  contact: { name: string | null; email: string | null; phone: string | null },
  responses: Record<string, unknown>,
  files: { fieldKey: string; url: string; publicId: string; filename: string; mimeType: string; sizeBytes: number }[],
  historyNote?: string,
  payment?: { status: string; amountDueMinor: number },
  documentsInPerson = false,
): Promise<registrationsRepo.RegistrationRow> {
  const numbering = resolveNumberingConfig(program.registrationNumberConfig);
  const year = new Date().getFullYear();

  // An admin can change the format or starting number after numbers were issued,
  // so a generated number may already be taken -- skip ahead instead of failing.
  let registration: registrationsRepo.RegistrationRow | undefined;
  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS && !registration; attempt++) {
    const sequence = await registrationsRepo.nextRegistrationSequence(program.id, counterBucket(numbering, year));
    try {
      registration = await registrationsRepo.createRegistration({
        programId: program.id,
        formId,
        registrationNumber: formatRegistrationNumber(numbering, year, sequence),
        applicantName: contact.name,
        applicantEmail: contact.email,
        applicantPhone: contact.phone,
        responses,
        files,
        enforceUniqueEmail: program.oneRegistrationPerEmail,
        historyNote,
        payment,
        documentsInPerson,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // The same email slipped in between the check and now: the database refused it.
      if (violatedConstraint(err) === "registrations_unique_email_guard_idx") throw alreadyRegistered();
    }
  }
  if (!registration) throw AppError.conflict("Could not allocate a registration number, please try again");
  return registration;
}

const alreadyRegistered = () =>
  AppError.conflict(
    "Registration failed: this email address has already been used to register for this program. You cannot submit more than one registration.",
  );

function violatedConstraint(err: unknown): string | undefined {
  const e = err as { constraint?: string; cause?: { constraint?: string } };
  return e?.constraint ?? e?.cause?.constraint;
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/** ID cards and tickets are offered on the success page unless the admin turned that off. */
export function showsOnConfirmation(config: unknown): boolean {
  return (config as { showOnConfirmation?: boolean } | null)?.showOnConfirmation !== false;
}

export async function listRegistrations(programId: string, query: ListRegistrationsQuery) {
  const pagination: PaginationInput = { page: query.page, pageSize: query.pageSize };
  const { items, total } = await registrationsRepo.listRegistrations(
    programId,
    {
      status: query.status,
      paymentStatus: query.paymentStatus,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    },
    pagination,
  );
  return buildPaginatedResult(items, total, pagination);
}

export async function getRegistrationFile(programId: string, registrationId: string, fileId: string) {
  const registration = await registrationsRepo.findRegistrationInProgram(programId, registrationId);
  if (!registration) throw AppError.notFound("Registration not found");
  const file = await registrationsRepo.findRegistrationFile(registration.id, fileId);
  if (!file) throw AppError.notFound("File not found");
  return file;
}

export async function getRegistrationDetail(programId: string, registrationId: string) {
  const registration = await registrationsRepo.findRegistrationInProgram(programId, registrationId);
  if (!registration) throw AppError.notFound("Registration not found");

  const [files, history, formVersion] = await Promise.all([
    registrationsRepo.getRegistrationFiles(registration.id),
    registrationsRepo.getRegistrationHistory(registration.id),
    formsService.getFormVersionWithContent(registration.formId),
  ]);

  // The questions as they are now, for editing, and any required answers still missing against them.
  const current = await formsService.getPublishedFormWithContent(registration.programId);
  const missingRequired = current
    ? missingRequiredAnswers(
        current.fields,
        registration.responses as Record<string, unknown>,
        files.map((f) => ({ fieldKey: f.fieldKey, url: f.secureUrl, publicId: f.cloudinaryPublicId, filename: f.originalFilename, mimeType: f.mimeType, sizeBytes: f.sizeBytes })),
        current.sections,
      )
    : [];

  const paymentAttempts = await db
    .select({
      id: payments.id,
      status: payments.status,
      amountMinor: payments.amountMinor,
      refundedMinor: payments.refundedMinor,
      payerPhone: payments.payerPhone,
      currency: payments.currency,
      channel: payments.channel,
      failureReason: payments.failureReason,
      createdAt: payments.createdAt,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.registrationId, registration.id))
    .orderBy(desc(payments.createdAt));

  return {
    registration,
    files,
    history,
    payments: paymentAttempts.map((p) => ({ ...p, refundableAt: refundableAt(p.paidAt) })),
    form: formVersion,
    currentForm: current ? { form: current.form, sections: current.sections, fields: current.fields } : null,
    missingRequired,
  };
}

const FILE_ANSWER_TYPES = new Set(["image_upload", "pdf_upload", "document_upload"]);

/**
 * An admin edits a registration's answers to follow the program's current questions. Missing required
 * answers are allowed (they can be filled in later) but wrong ones are not; uploaded files are left alone.
 */
export async function editRegistrationAnswers(
  programId: string,
  registrationId: string,
  actor: { id: string; name: string },
  responses: Record<string, unknown>,
) {
  const registration = await registrationsRepo.findRegistrationInProgram(programId, registrationId);
  if (!registration) throw AppError.notFound("Registration not found");
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  const published = await formsService.getPublishedFormWithContent(programId);
  if (!published) throw AppError.conflict("Publish this program's registration form first.");

  const existing = registration.responses as Record<string, unknown>;
  const merged = { ...existing, ...responses };
  const storedFiles = await registrationsRepo.getRegistrationFiles(registration.id);
  const files = storedFiles.map((f) => ({
    fieldKey: f.fieldKey,
    url: f.secureUrl,
    publicId: f.cloudinaryPublicId,
    filename: f.originalFilename,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
  }));
  const cleaned = validateAndNormalizeResponses(published.fields, merged, files, published.sections, { ignoreRequired: true });

  const finalResponses: Record<string, unknown> = { ...existing, ...cleaned };
  // Uploaded files are not changed here: keep what was there.
  for (const field of published.fields) {
    if (FILE_ANSWER_TYPES.has(field.type)) finalResponses[field.fieldKey] = existing[field.fieldKey] ?? cleaned[field.fieldKey];
  }

  const contact = extractApplicantContact(published.fields, finalResponses);
  const email = contact.email?.trim().toLowerCase();
  if (program.oneRegistrationPerEmail && email && email !== registration.applicantEmail?.trim().toLowerCase()) {
    if (await registrationsRepo.emailAlreadyRegistered(program.id, email)) throw alreadyRegistered();
  }

  try {
    return await registrationsRepo.updateRegistrationFromImport(registration, {
      applicantName: contact.name,
      applicantEmail: contact.email,
      applicantPhone: contact.phone,
      responses: finalResponses,
      enforceUniqueEmail: program.oneRegistrationPerEmail,
      note: `Answers edited by ${actor.name}`,
      formId: published.form.id,
      changedBy: actor.id,
    });
  } catch (err) {
    if (isUniqueViolation(err) && violatedConstraint(err) === "registrations_unique_email_guard_idx") throw alreadyRegistered();
    throw err;
  }
}

export async function updateRegistrationStatus(
  programId: string,
  registrationId: string,
  changedBy: string,
  input: UpdateStatusInput,
) {
  const registration = await registrationsRepo.findRegistrationInProgram(programId, registrationId);
  if (!registration) throw AppError.notFound("Registration not found");
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  const business = program.kind === "order_form" && program.businessId ? await getBusiness(program.businessId) : null;
  const orderStatuses = resolveStatuses(business?.statusConfig, "order");
  const allowed: readonly string[] = program.kind === "order_form" ? orderStatuses.map((s) => s.key) : programStatusChoices;
  if (!allowed.includes(input.status)) throw AppError.validation(`"${input.status}" isn't a valid ${program.kind === "order_form" ? "order" : "registration"} status`);

  const updated = await registrationsRepo.updateRegistrationStatus(
    registration.id,
    registration.status,
    input.status,
    changedBy,
    input.note,
  );

  if (program.kind === "order_form" && input.status !== registration.status) {
    const [{ fields }, files] = await Promise.all([
      formsService.getFormVersionWithContent(registration.formId),
      registrationsRepo.getRegistrationFiles(registration.id),
    ]);
    void notifyCustomer(program, { ...registration, status: input.status }, {
      isNew: false,
      note: input.note,
      fields,
      files: files.map((f) => ({ fieldKey: f.fieldKey, filename: f.originalFilename })),
    });
  }
  return updated;
}

export async function getProgramStats(programId: string) {
  return registrationsRepo.getProgramStats(programId);
}
