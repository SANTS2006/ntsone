import type { FastifyInstance } from "fastify";
import { requireProgramAccess } from "../../middleware/authorize.js";
import {
  getAdminFormHandler,
  getFormShareInfoHandler,
  previewFormHandler,
  publishFormHandler,
  saveDraftHandler,
} from "./controller.js";

export async function formRoutes(app: FastifyInstance) {
  app.get("/:programId/form", { preHandler: requireProgramAccess("viewer") }, getAdminFormHandler);
  app.post("/:programId/form", { preHandler: requireProgramAccess("admin") }, saveDraftHandler);
  app.post("/:programId/form/publish", { preHandler: requireProgramAccess("admin") }, publishFormHandler);
  app.get("/:programId/form/preview", { preHandler: requireProgramAccess("viewer") }, previewFormHandler);
  app.get("/:programId/form/share", { preHandler: requireProgramAccess("viewer") }, getFormShareInfoHandler);
}
