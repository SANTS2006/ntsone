import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { SUPPORT_EMAIL } from "../../config/contact.js";
import { sendSuccess } from "../../lib/response.js";
import { sendEmail } from "../email/service.js";
import { contactMessageEmail, feedbackEmail, reportEmail } from "../email/templates.js";
import * as programsRepo from "../programs/repository.js";
import { getProgramRole } from "../programs/access.js";
import { saveSupportMessage } from "./repository.js";

export const REPORT_CATEGORIES = {
  abuse: "Abuse, harassment, or spam",
  fraud: "Fraud or impersonation",
  privacy: "Privacy or personal data concern",
  security: "Security vulnerability",
  content: "Inappropriate or illegal content",
  technical: "Technical problem",
  other: "Something else",
} as const;

const reportSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Enter a valid email address").max(200),
  category: z.enum(Object.keys(REPORT_CATEGORIES) as [keyof typeof REPORT_CATEGORIES, ...(keyof typeof REPORT_CATEGORIES)[]]),
  link: z.string().trim().max(500).optional(),
  message: z.string().trim().min(20, "Please describe what happened in at least 20 characters").max(5000),
  // Left empty by people; bots that fill every field are quietly dropped.
  website: z.string().optional(),
});

async function submitReportHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = reportSchema.parse(request.body);

  if (!input.website) {
    await saveSupportMessage({
      kind: "report",
      category: REPORT_CATEGORIES[input.category],
      message: input.message,
      name: input.name || null,
      email: input.email,
      link: input.link || null,
      ipAddress: request.ip,
    });
    const message = reportEmail({
      category: REPORT_CATEGORIES[input.category],
      name: input.name || undefined,
      email: input.email,
      link: input.link || undefined,
      message: input.message,
      submittedAt: new Date(),
      ipAddress: request.ip,
    });
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: message.subject,
      html: message.html,
      replyTo: { email: input.email, name: input.name || undefined },
    });
  }

  return sendSuccess(reply, { received: true }, "Thank you. Your report has been sent.");
}

const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(200),
  phone: z.string().trim().max(40).optional(),
  subject: z.string().trim().min(3, "Enter a subject").max(150),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(5000),
  website: z.string().optional(),
});

async function submitContactHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = contactSchema.parse(request.body);

  if (!input.website) {
    await saveSupportMessage({
      kind: "contact",
      subject: input.subject,
      message: input.message,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      ipAddress: request.ip,
    });
    const message = contactMessageEmail({
      name: input.name,
      email: input.email,
      phone: input.phone || undefined,
      subject: input.subject,
      message: input.message,
      submittedAt: new Date(),
    });
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: message.subject,
      html: message.html,
      replyTo: { email: input.email, name: input.name },
    });
  }

  return sendSuccess(reply, { received: true }, "Thank you. Your message has been sent.");
}

const formRateLimit = { rateLimit: { max: 5, timeWindow: "15 minutes" } };

export const FEEDBACK_CATEGORIES = {
  improvement: "Improvement",
  bug: "Bug or problem",
  feature: "New feature request",
  other: "Something else",
} as const;

const feedbackSchema = z.object({
  category: z.enum(Object.keys(FEEDBACK_CATEGORIES) as [keyof typeof FEEDBACK_CATEGORIES, ...(keyof typeof FEEDBACK_CATEGORIES)[]]),
  subject: z.string().trim().min(3, "Enter a short subject").max(150),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(5000),
  programId: z.string().uuid().optional(),
});

/** Feedback from signed-in admins and viewers about the platform itself. */
async function submitFeedbackHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user!;
  const input = feedbackSchema.parse(request.body);

  // Only attach a program the sender can actually see.
  const program =
    input.programId && (await getProgramRole(user, input.programId))
      ? await programsRepo.findProgramById(input.programId)
      : null;
  const organizationName = user.tenantId ? await programsRepo.findTenantName(user.tenantId) : null;
  const category = FEEDBACK_CATEGORIES[input.category];

  await saveSupportMessage({
    kind: "feedback",
    category,
    subject: input.subject,
    message: input.message,
    name: user.name,
    email: user.email,
    userId: user.id,
    tenantId: user.tenantId,
    programId: program?.id ?? null,
    ipAddress: request.ip,
  });
  const email = feedbackEmail({
    category,
    subject: input.subject,
    message: input.message,
    name: user.name,
    email: user.email,
    organizationName: organizationName ?? undefined,
    programName: program?.name,
    submittedAt: new Date(),
  });
  await sendEmail({ to: SUPPORT_EMAIL, subject: email.subject, html: email.html, replyTo: { email: user.email, name: user.name } });

  return sendSuccess(reply, { received: true }, "Thank you. Your feedback has been sent.");
}

export async function feedbackRoutes(app: FastifyInstance) {
  app.post("/feedback", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, submitFeedbackHandler);
}

export async function supportRoutes(app: FastifyInstance) {
  app.post("/reports", { config: formRateLimit }, submitReportHandler);
  app.post("/contact", { config: formRateLimit }, submitContactHandler);
}
