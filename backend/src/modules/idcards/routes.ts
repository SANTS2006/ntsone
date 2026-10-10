import type { FastifyInstance } from "fastify";
import { requireProgramAccess } from "../../middleware/authorize.js";
import {
  downloadAdminIdCardHandler,
  getConfigHandler,
  updateConfigHandler,
  updateDocumentOverridesHandler,
} from "./controller.js";

export async function idCardRoutes(app: FastifyInstance) {
  app.get("/:programId/id-card/config", { preHandler: requireProgramAccess("viewer") }, getConfigHandler);
  app.patch("/:programId/id-card/config", { preHandler: requireProgramAccess("admin") }, updateConfigHandler);
  app.get(
    "/:programId/registrations/:registrationId/id-card",
    { preHandler: requireProgramAccess("viewer") },
    downloadAdminIdCardHandler,
  );
  app.patch(
    "/:programId/registrations/:registrationId/document-overrides",
    { preHandler: requireProgramAccess("admin") },
    updateDocumentOverridesHandler,
  );
}
