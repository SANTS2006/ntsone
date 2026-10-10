import type { FastifyInstance } from "fastify";
import { requireProgramAccess } from "../../middleware/authorize.js";
import {
  downloadAdminTicketHandler,
  downloadPublicTicketHandler,
  getTicketConfigHandler,
  updateTicketConfigHandler,
} from "./controller.js";

export async function ticketRoutes(app: FastifyInstance) {
  app.get("/:programId/ticket/config", { preHandler: requireProgramAccess("viewer") }, getTicketConfigHandler);
  app.patch("/:programId/ticket/config", { preHandler: requireProgramAccess("admin") }, updateTicketConfigHandler);
  app.get(
    "/:programId/registrations/:registrationId/ticket",
    { preHandler: requireProgramAccess("viewer") },
    downloadAdminTicketHandler,
  );
}

export async function publicTicketRoutes(app: FastifyInstance) {
  app.get(
    "/programs/:slug/registrations/:registrationNumber/ticket",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    downloadPublicTicketHandler,
  );
}
