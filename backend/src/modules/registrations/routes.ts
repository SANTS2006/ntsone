import type { FastifyInstance } from "fastify";
import { requireProgramAccess } from "../../middleware/authorize.js";
import {
  downloadRegistrationFileHandler,
  downloadRegistrationSummaryHandler,
  exportRegistrationsHandler,
  getProgramStatsHandler,
  editRegistrationAnswersHandler,
  getRegistrationHandler,
  importRegistrationsHandler,
  importTemplateHandler,
  previewRegistrationImportHandler,
  listRegistrationsHandler,
  updateRegistrationStatusHandler,
} from "./controller.js";

export async function registrationRoutes(app: FastifyInstance) {
  app.get(
    "/:programId/registrations",
    { preHandler: requireProgramAccess("viewer") },
    listRegistrationsHandler,
  );
  app.get(
    "/:programId/registrations/stats",
    { preHandler: requireProgramAccess("viewer") },
    getProgramStatsHandler,
  );
  app.get(
    "/:programId/registrations/export",
    { preHandler: requireProgramAccess("viewer") },
    exportRegistrationsHandler,
  );
  app.get(
    "/:programId/registrations/:registrationId",
    { preHandler: requireProgramAccess("viewer") },
    getRegistrationHandler,
  );
  app.get(
    "/:programId/registrations/:registrationId/summary.pdf",
    { preHandler: requireProgramAccess("viewer") },
    downloadRegistrationSummaryHandler,
  );
  app.get(
    "/:programId/registrations/:registrationId/files/:fileId/download",
    { preHandler: requireProgramAccess("viewer") },
    downloadRegistrationFileHandler,
  );
  // Bulk import from an Excel sheet or Word table. The document travels as base64 text, so these routes allow a bigger body.
  const importRoute = { bodyLimit: 8 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
  app.get("/:programId/registrations/import/template", { preHandler: requireProgramAccess("admin") }, importTemplateHandler);
  app.post(
    "/:programId/registrations/import/preview",
    { preHandler: requireProgramAccess("admin"), ...importRoute },
    previewRegistrationImportHandler,
  );
  app.post(
    "/:programId/registrations/import",
    { preHandler: requireProgramAccess("admin"), ...importRoute },
    importRegistrationsHandler,
  );
  app.patch(
    "/:programId/registrations/:registrationId",
    { preHandler: requireProgramAccess("admin") },
    editRegistrationAnswersHandler,
  );
  app.patch(
    "/:programId/registrations/:registrationId/status",
    { preHandler: requireProgramAccess("admin") },
    updateRegistrationStatusHandler,
  );
}
