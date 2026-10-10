import type { FastifyInstance } from "fastify";
import { publicUploadSignatureHandler } from "../uploads/controller.js";
import {
  downloadSubmissionPdfHandler,
  getPublicFormHandler,
  getPublicProgramHandler,
  getSubmissionSummaryHandler,
  submitPublicRegistrationHandler,
} from "./controller.js";

const submissionRateLimit = { rateLimit: { max: 20, timeWindow: "1 minute" } };

// No public listing of programs: each account shares its own program links, and
// one account's programs must not be discoverable by browsing the platform.
export async function publicRoutes(app: FastifyInstance) {
  app.get("/programs/:slug", getPublicProgramHandler);
  app.get("/programs/:slug/form", getPublicFormHandler);
  app.post(
    "/programs/:slug/registrations",
    { config: submissionRateLimit },
    submitPublicRegistrationHandler,
  );
  app.post("/uploads/signature", { config: submissionRateLimit }, publicUploadSignatureHandler);
  // What a registrant submitted, reached through the private link token from their success page.
  app.get("/submissions/:token", { config: submissionRateLimit }, getSubmissionSummaryHandler);
  app.get("/submissions/:token/pdf", { config: submissionRateLimit }, downloadSubmissionPdfHandler);
}
