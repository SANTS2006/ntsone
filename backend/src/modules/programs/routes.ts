import type { FastifyInstance } from "fastify";
import { requireProgramAccess, requireRole } from "../../middleware/authorize.js";
import { programUploadSignatureHandler } from "../uploads/controller.js";
import {
  archiveProgramHandler,
  closeRegistrationHandler,
  createProgramHandler,
  deleteProgramHandler,
  duplicateProgramHandler,
  getProgramHandler,
  listProgramsHandler,
  publishProgramHandler,
  reopenRegistrationHandler,
  setThumbnailHandler,
  unpublishProgramHandler,
  updateProgramHandler,
} from "./controller.js";

export async function programRoutes(app: FastifyInstance) {
  app.get("/", listProgramsHandler);
  app.post("/", { preHandler: requireRole("super_admin", "admin", "program_admin") }, createProgramHandler);

  app.get("/:programId", { preHandler: requireProgramAccess("viewer") }, getProgramHandler);
  app.patch("/:programId", { preHandler: requireProgramAccess("admin") }, updateProgramHandler);
  // requireProgramAccess (not requireRole) -- deletion must still be scoped to
  // the program's own tenant, the same way every other mutation on this route
  // is; a bare role check alone would let any tenant admin delete any tenant's
  // program by guessing an id.
  app.delete("/:programId", { preHandler: requireProgramAccess("admin") }, deleteProgramHandler);

  app.post("/:programId/duplicate", { preHandler: requireProgramAccess("admin") }, duplicateProgramHandler);
  app.post("/:programId/publish", { preHandler: requireProgramAccess("admin") }, publishProgramHandler);
  app.post("/:programId/unpublish", { preHandler: requireProgramAccess("admin") }, unpublishProgramHandler);
  app.post(
    "/:programId/registration/close",
    { preHandler: requireProgramAccess("admin") },
    closeRegistrationHandler,
  );
  app.post(
    "/:programId/registration/reopen",
    { preHandler: requireProgramAccess("admin") },
    reopenRegistrationHandler,
  );
  app.post("/:programId/archive", { preHandler: requireProgramAccess("admin") }, archiveProgramHandler);

  app.post(
    "/:programId/uploads/signature",
    { preHandler: requireProgramAccess("admin") },
    programUploadSignatureHandler,
  );
  app.post("/:programId/thumbnail", { preHandler: requireProgramAccess("admin") }, setThumbnailHandler);
}
