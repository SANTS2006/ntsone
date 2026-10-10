import type { FastifyInstance } from "fastify";
import { requireProgramAccess } from "../../middleware/authorize.js";
import { getProgramDemographicsHandler, getProgramFieldAnalyticsHandler, getProgramTrendHandler } from "./controller.js";

export async function analyticsRoutes(app: FastifyInstance) {
  app.get(
    "/:programId/analytics/fields",
    { preHandler: requireProgramAccess("viewer") },
    getProgramFieldAnalyticsHandler,
  );
  app.get(
    "/:programId/analytics/trend",
    { preHandler: requireProgramAccess("viewer") },
    getProgramTrendHandler,
  );
  app.get(
    "/:programId/analytics/demographics",
    { preHandler: requireProgramAccess("viewer") },
    getProgramDemographicsHandler,
  );
}
