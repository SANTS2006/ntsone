import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { businesses } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/recorder.js";
import { readIdempotencyKey, withIdempotency } from "../../lib/idempotency.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { sendSuccess } from "../../lib/response.js";
import * as formsService from "../forms/service.js";
import { isMonimeConfigured } from "../payments/monime.js";
import { feeIsAccepted } from "../payments/fees.js";
import { programLineItems, resolvePaymentConfig } from "../payments/pricing.js";
import * as programsRepo from "../programs/repository.js";
import * as registrationsService from "../registrations/service.js";
import { submitRegistrationSchema } from "../registrations/schemas.js";
import { signSubmissionToken, submissionPdfByToken, submissionSummaryByToken } from "../registrations/summary.js";
import { attachmentDisposition } from "../../lib/downloadName.js";

function isRegistrationOpen(program: programsRepo.ProgramRow): boolean {
  if (program.status !== "published" || !program.registrationEnabled) return false;
  const now = new Date();
  if (program.registrationStartDate && now < program.registrationStartDate) return false;
  if (program.registrationEndDate && now > program.registrationEndDate) return false;
  return true;
}

async function businessFor(program: programsRepo.ProgramRow) {
  if (program.kind !== "order_form" || !program.businessId) return null;
  const [business] = await db.select().from(businesses).where(eq(businesses.id, program.businessId)).limit(1);
  if (!business || business.deletedAt) return null;
  return {
    name: business.name,
    logoUrl: business.logoUrl,
    description: business.description,
    email: business.email,
    phone: business.phone,
    address: business.address,
    website: business.website,
  };
}

function publicPaymentInfo(program: programsRepo.ProgramRow) {
  const config = resolvePaymentConfig(program.paymentConfig);
  const enabled = config.enabled && isMonimeConfigured() && feeIsAccepted(config.feeAccepted);
  return {
    enabled,
    currency: "SLE",
    lines: enabled && program.kind !== "order_form" ? programLineItems(program, config).map((l) => ({ id: l.id, name: l.name, amountMinor: l.totalMinor })) : [],
  };
}

async function toPublicProgram(program: programsRepo.ProgramRow) {
  return {
    kind: program.kind,
    // An order form is shown as its business's order page.
    business: await businessFor(program),
    id: program.id,
    name: program.name,
    slug: program.slug,
    description: program.description,
    shortDescription: program.shortDescription,
    thumbnailUrl: program.thumbnailUrl,
    startDate: program.startDate,
    endDate: program.endDate,
    registrationStartDate: program.registrationStartDate,
    registrationEndDate: program.registrationEndDate,
    registrationOpen: isRegistrationOpen(program),
    // What the registrant will be asked to pay (an order form's items come with its form instead).
    payment: publicPaymentInfo(program),
  };
}

// A published program page and its form are read by everyone who opens the link and change rarely,
// so a few seconds of caching (one database load shared by concurrent visitors) takes the load off.
const PUBLIC_READ_TTL_MS = 5_000;
const publicProgramCache = new TtlCache<Awaited<ReturnType<typeof toPublicProgram>> | null>(1000);
const publicFormCache = new TtlCache<Awaited<ReturnType<typeof formsService.getPublishedFormWithContent>> | null>(1000);

export async function getPublicProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as { slug: string };
  const data = await publicProgramCache.get(slug, PUBLIC_READ_TTL_MS, async () => {
    const program = await programsRepo.findProgramBySlug(slug);
    if (!program || program.status !== "published") return null;
    return toPublicProgram(program);
  });
  if (!data) throw AppError.notFound("Program not found");
  return sendSuccess(reply, data);
}

export async function getPublicFormHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as { slug: string };
  const published = await publicFormCache.get(slug, PUBLIC_READ_TTL_MS, async () => {
    const program = await programsRepo.findProgramBySlug(slug);
    if (!program || program.status !== "published") return null;
    return formsService.getPublishedFormWithContent(program.id);
  });
  if (!published) throw AppError.notFound("This program does not have a published registration form");

  return sendSuccess(reply, published);
}

export async function submitPublicRegistrationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as { slug: string };
  const input = submitRegistrationSchema.parse(request.body);
  // A browser tags each submission attempt with a key, so a double click or a retry after a dropped
  // connection returns the first result instead of creating a second registration.
  const key = readIdempotencyKey(request.headers["idempotency-key"]);
  const { value, replay } = await withIdempotency(`registration:${slug}`, key, async () => {
    const result = await registrationsService.submitRegistration(slug, input, { ip: request.ip, userAgent: request.headers["user-agent"] });
    const program = await programsRepo.findProgramById(result.registration.programId);
    await recordAudit({
      action: "public.submit",
      label: program?.kind === "order_form" ? "Placed an order" : "Submitted a registration",
      actorType: "visitor",
      tenantId: program?.tenantId,
      entityType: "registration",
      entityId: result.registration.id,
      metadata: {
        registrationNumber: result.registration.registrationNumber,
        program: program?.name,
        slug,
        kind: program?.kind,
        amountDueMinor: result.registration.amountDueMinor || undefined,
        paymentStarted: result.payment ? true : undefined,
        applicantEmail: result.registration.applicantEmail ?? undefined,
      },
    });
    // Orders always get their copy; a program's admin chooses whether registrants do.
    const offerCopy = !program || program.kind === "order_form" || program.allowSubmissionCopy;
    return {
      registrationNumber: result.registration.registrationNumber,
      status: result.registration.status,
      confirmationMessage: result.confirmationMessage,
      showRegistrationNumber: result.showRegistrationNumber,
      idCardAvailable: result.idCardAvailable,
      ticketAvailable: result.ticketAvailable,
      // Lets the registrant view and download what they submitted from the success page.
      receiptToken: offerCopy ? signSubmissionToken(result.registration.id) : undefined,
      // When the registration or order has to be paid for: where to pay, and the private link to follow up.
      payment: result.payment
        ? { token: result.payment.token, status: result.payment.status, redirectUrl: result.payment.redirectUrl, amountMinor: result.payment.amountMinor, currency: result.payment.currency }
        : undefined,
    };
  });
  if (replay) reply.header("idempotent-replay", "true");
  return sendSuccess(reply, value, "Registration submitted successfully", replay ? 200 : 201);
}

export async function getSubmissionSummaryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { token } = request.params as { token: string };
  reply.header("Cache-Control", "no-store");
  return sendSuccess(reply, await submissionSummaryByToken(token));
}

export async function downloadSubmissionPdfHandler(request: FastifyRequest, reply: FastifyReply) {
  const { token } = request.params as { token: string };
  const { buffer, fileName } = await submissionPdfByToken(token);
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", attachmentDisposition(fileName))
    .header("X-Download-Name", encodeURIComponent(fileName))
    .header("Cache-Control", "no-store")
    .send(buffer);
}
