import { eq } from "drizzle-orm";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { businesses } from "../../db/schema/index.js";
import { resolveStatuses, statusLabelFor } from "../../shared/designs/index.js";
import { queueEmail } from "../email/outbox.js";
import { documentVerifiedNotificationEmail, newRegistrationNotificationEmail, orderUpdateEmail } from "../email/templates.js";
import * as programsRepo from "../programs/repository.js";
import { formatCellValue, withOtherText } from "../registrations/exportService.js";
import type * as registrationsRepo from "../registrations/repository.js";
import { followTextKey, otherTextKey } from "../registrations/validation.js";

const MAX_ANSWER_LENGTH = 300;
const MAX_ANSWERS = 40;

type Program = programsRepo.ProgramRow;
type Registration = registrationsRepo.RegistrationRow;
type Field = { fieldKey: string; label: string; type: string };
type UploadedFile = { fieldKey: string; filename?: string | null };

function appUrl(path: string) {
  return `${env.APP_URL.replace(/\/+$/, "")}${path}`;
}

/** Where a registration (or order) opens in the admin area. */
function detailsPath(program: Program, registration: Registration) {
  return program.kind === "order_form" && program.businessId
    ? `/admin/businesses/${program.businessId}/orders/${registration.id}`
    : `/admin/programs/${program.id}/registrations/${registration.id}`;
}

function settingsPath(program: Program) {
  return program.kind === "order_form" && program.businessId ? `/admin/businesses/${program.businessId}` : `/admin/programs/${program.id}`;
}

/** The answers someone gave, as label/value pairs for an email (consent boxes left out). */
export function answersFor(registration: Registration, fields: Field[], files: UploadedFile[]) {
  const responses = (registration.responses as Record<string, unknown>) ?? {};
  const answers: { label: string; value: string }[] = [];
  for (const field of fields) {
    if (field.type === "consent") continue;
    const value = field.type.endsWith("_upload")
      ? files
          .filter((f) => f.fieldKey === field.fieldKey)
          .map((f) => f.filename || "file")
          .join(", ")
      : formatCellValue(withOtherText(responses[field.fieldKey], responses[otherTextKey(field.fieldKey)], responses[followTextKey(field.fieldKey)]));
    if (!value) continue;
    answers.push({ label: field.label, value: value.length > MAX_ANSWER_LENGTH ? `${value.slice(0, MAX_ANSWER_LENGTH)}...` : value });
    if (answers.length >= MAX_ANSWERS) break;
  }
  return answers;
}

/** Sends one email to each person on the program's (or business's) team. Never throws. */
async function emailTeam(program: Program, build: () => { subject: string; html: string }) {
  try {
    const recipients = await programsRepo.listNotificationRecipients(program);
    if (recipients.length === 0) return;
    const { subject, html } = build();
    await Promise.all(recipients.map((r) => queueEmail({ to: r.email, toName: r.name, subject, html })));
  } catch (err) {
    console.error(`Could not send team notification for program ${program.id}:`, err);
  }
}

/** Tells the program's team about a new registration (or a business about a new order), with the answers given. */
export async function notifyNewRegistration(program: Program, registration: Registration, fields: Field[], files: UploadedFile[]) {
  if (!program.notifyOnRegistration) return;
  const answers = answersFor(registration, fields, files);
  await emailTeam(program, () =>
    newRegistrationNotificationEmail({
      programName: program.name,
      registrationNumber: registration.registrationNumber,
      applicantName: registration.applicantName,
      submittedAt: registration.submittedAt,
      answers,
      detailsUrl: appUrl(detailsPath(program, registration)),
      settingsUrl: appUrl(settingsPath(program)),
      isOrder: program.kind === "order_form",
    }),
  );
}

/** Emails a customer about their order: when they place it and each time its status changes. */
export async function notifyCustomer(
  program: Program,
  registration: Registration,
  params: { isNew: boolean; note?: string | null; fields: Field[]; files: UploadedFile[] },
) {
  if (program.kind !== "order_form" || !program.businessId || !registration.applicantEmail) return;
  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, program.businessId)).limit(1);
    if (!business || (!params.isNew && !business.notifyCustomerOnStatus)) return;
    const { subject, html } = orderUpdateEmail({
      business,
      customerName: registration.applicantName ?? "there",
      orderNumber: registration.registrationNumber,
      status: registration.status,
      statusLabel: statusLabelFor(resolveStatuses(business.statusConfig, "order"), registration.status),
      note: params.note,
      isNew: params.isNew,
      placedAt: registration.submittedAt,
      answers: answersFor(registration, params.fields, params.files),
    });
    await queueEmail({
      to: registration.applicantEmail,
      toName: registration.applicantName ?? registration.applicantEmail,
      subject,
      html,
      fromName: business.name,
      replyTo: business.email ? { email: business.email, name: business.name } : undefined,
    });
  } catch (err) {
    console.error(`Could not email the customer about order ${registration.id}:`, err);
  }
}

/** Tells the program's team that a registrant's ID card or ticket was checked in for the first time. */
export async function notifyDocumentVerified(
  program: Program,
  registration: Registration,
  params: { documentType: "id_card" | "ticket"; valid: boolean; verifiedAt: Date; verifiedBy: string | null },
) {
  if (!program.notifyOnVerification) return;
  await emailTeam(program, () =>
    documentVerifiedNotificationEmail({
      programName: program.name,
      documentLabel: params.documentType === "ticket" ? "Ticket" : "ID card",
      registrationNumber: registration.registrationNumber,
      applicantName: registration.applicantName,
      valid: params.valid,
      status: registration.status.replace(/_/g, " "),
      verifiedAt: params.verifiedAt,
      verifiedBy: params.verifiedBy ?? "Someone who wasn't signed in to the program team",
      detailsUrl: appUrl(detailsPath(program, registration)),
      settingsUrl: appUrl(settingsPath(program)),
    }),
  );
}
