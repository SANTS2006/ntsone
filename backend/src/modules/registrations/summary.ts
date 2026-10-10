import { formatMinor } from "../../lib/money.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { businesses } from "../../db/schema/index.js";
import { renderDetailsPdf, type DetailsSection } from "../../lib/detailsPdf.js";
import { participantFileName } from "../../lib/downloadName.js";
import { AppError } from "../../lib/errors.js";
import { resolveStatuses, statusLabelFor } from "../../shared/designs/index.js";
import * as formsRepo from "../forms/repository.js";
import { fetchImageDataUri, LOGO_TRANSFORM } from "../idcards/pdf.js";
import * as programsRepo from "../programs/repository.js";
import { formatCellValue, withOtherText } from "./exportService.js";
import * as registrationsRepo from "./repository.js";
import { followTextKey, otherTextKey } from "./validation.js";

// A separate key from sign-in tokens, so neither kind of token can stand in for the other.
const SUBMISSION_KEY = `${env.JWT_SECRET}:submission-receipt`;
const SUBMISSION_TTL = "30d";

/** A private link token that lets the registrant see what they submitted, without an account. */
export function signSubmissionToken(registrationId: string): string {
  return jwt.sign({ sub: registrationId }, SUBMISSION_KEY, { expiresIn: SUBMISSION_TTL, audience: "submission" });
}

function readSubmissionToken(token: string): string {
  try {
    const payload = jwt.verify(token, SUBMISSION_KEY, { audience: "submission" }) as { sub?: string };
    if (!payload.sub) throw new Error("missing subject");
    return payload.sub;
  } catch {
    throw AppError.notFound("This link has expired or isn't valid");
  }
}

export interface SubmissionSummary {
  programName: string;
  registrationNumber: string;
  applicantName: string | null;
  status: string;
  /** The status as its business (or the default wording) names it. */
  statusLabel: string;
  /** "order_form" for a business's order, otherwise a program registration. */
  kind: "program" | "order_form";
  /** For an order: who it was placed with, so the printed copy can carry their name and colour. */
  business: { name: string; logoUrl: string | null; accentColor: string } | null;
  submittedAt: string;
  sections: { title: string; rows: { label: string; value: string }[] }[];
}

const humanize = (status: string) => status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

async function orderBusiness(program: programsRepo.ProgramRow) {
  if (program.kind !== "order_form" || !program.businessId) return null;
  const [business] = await db.select().from(businesses).where(eq(businesses.id, program.businessId)).limit(1);
  return business ?? null;
}

async function summarize(program: programsRepo.ProgramRow, registration: registrationsRepo.RegistrationRow): Promise<SubmissionSummary> {
  const [{ sections, fields }, files, business] = await Promise.all([
    formsRepo.getContent(registration.formId),
    registrationsRepo.getRegistrationFiles(registration.id),
    orderBusiness(program),
  ]);
  const responses = (registration.responses as Record<string, unknown>) ?? {};

  const answer = (field: formsRepo.FieldRow): string => {
    if (field.type.endsWith("_upload")) {
      return files
        .filter((f) => f.fieldKey === field.fieldKey)
        .map((f) => f.originalFilename)
        .join(", ");
    }
    if (field.type === "consent") return responses[field.fieldKey] === true ? "Agreed" : "";
    return formatCellValue(withOtherText(responses[field.fieldKey], responses[otherTextKey(field.fieldKey)], responses[followTextKey(field.fieldKey)]));
  };

  const rowsFor = (list: formsRepo.FieldRow[]) =>
    list
      .map((field) => ({ label: field.label, value: answer(field) }))
      // Questions that were hidden or skipped are left out.
      .filter((row) => row.value !== "");

  const grouped = sections.map((s) => ({ title: s.title, rows: rowsFor(fields.filter((f) => f.sectionId === s.id)) }));
  const loose = rowsFor(fields.filter((f) => !f.sectionId || !sections.some((s) => s.id === f.sectionId)));
  if (loose.length) grouped.push({ title: sections.length ? "Additional information" : "Your answers", rows: loose });

  // An order that sells items starts with what was ordered: each item with its price, then the total.
  const order = responses.__order as { lines?: { name: string; quantity: number; totalMinor: number }[]; totalMinor?: number } | undefined;
  const orderLines = Array.isArray(order?.lines) ? order!.lines! : [];
  const itemsSection = orderLines.length
    ? [
        {
          title: "Items ordered",
          rows: [
            ...orderLines.map((l) => ({ label: l.quantity > 1 ? `${l.quantity} x ${l.name}` : l.name, value: formatMinor(l.totalMinor) })),
            { label: "Total", value: formatMinor(order?.totalMinor ?? orderLines.reduce((sum, l) => sum + l.totalMinor, 0)) },
          ],
        },
      ]
    : [];

  return {
    programName: program.name,
    registrationNumber: registration.registrationNumber,
    applicantName: registration.applicantName,
    status: registration.status,
    // An order's status is worded by its business; a registration's is just tidied up.
    statusLabel: business ? statusLabelFor(resolveStatuses(business.statusConfig, "order"), registration.status) : humanize(registration.status),
    kind: program.kind === "order_form" ? "order_form" : "program",
    business: business ? { name: business.name, logoUrl: business.logoUrl, accentColor: business.brandColor } : null,
    submittedAt: registration.submittedAt.toISOString(),
    sections: [...itemsSection, ...grouped.filter((g) => g.rows.length > 0)],
  };
}

async function loadByToken(token: string) {
  const registrationId = readSubmissionToken(token);
  const registration = await registrationsRepo.findRegistrationById(registrationId);
  if (!registration) throw AppError.notFound("Registration not found");
  const program = await programsRepo.findProgramById(registration.programId);
  if (!program) throw AppError.notFound("Registration not found");
  return { program, registration };
}

export async function submissionSummaryByToken(token: string) {
  const { program, registration } = await loadByToken(token);
  return summarize(program, registration);
}



async function summaryPdf(program: programsRepo.ProgramRow, registration: registrationsRepo.RegistrationRow) {
  // An order is headed with its business's name and logo.
  const [business] = program.businessId ? await db.select().from(businesses).where(eq(businesses.id, program.businessId)).limit(1) : [];
  const isOrder = program.kind === "order_form";
  const [summary, logo] = await Promise.all([
    summarize(program, registration),
    fetchImageDataUri((business?.logoUrl ?? program.thumbnailUrl) ?? undefined, LOGO_TRANSFORM),
  ]);
  const submitted = new Date(summary.submittedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const sections: DetailsSection[] = summary.sections;
  const buffer = await renderDetailsPdf({
    title: business?.name ?? program.name,
    subtitle: isOrder ? "Order details" : "Registration details",
    logo,
    facts: [
      { label: isOrder ? "Order number" : "Registration number", value: summary.registrationNumber },
      { label: "Submitted", value: `${submitted} UTC` },
      ...(summary.applicantName ? [{ label: "Name", value: summary.applicantName }] : []),
      { label: "Status", value: summary.statusLabel },
    ],
    sections,
    footer: `${business?.name ?? program.name} - ${summary.registrationNumber}`,
    accentColor: business?.brandColor,
  });
  return { buffer, fileName: participantFileName(registration.applicantName, `summary:${registration.id}`, "pdf", isOrder ? "Order" : "Registration") };
}

export async function submissionPdfByToken(token: string) {
  const { program, registration } = await loadByToken(token);
  return summaryPdf(program, registration);
}

export async function submissionPdfForAdmin(programId: string, registrationId: string) {
  const registration = await registrationsRepo.findRegistrationInProgram(programId, registrationId);
  if (!registration) throw AppError.notFound("Registration not found");
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  return summaryPdf(program, registration);
}
