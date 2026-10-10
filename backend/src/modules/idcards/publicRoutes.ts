import type { FastifyInstance } from "fastify";
import { optionalAuthenticate } from "../../middleware/authenticate.js";
import { downloadPublicIdCardHandler, verifyHandler } from "./controller.js";

const idCardRateLimit = { rateLimit: { max: 30, timeWindow: "1 minute" } };

export async function publicIdCardRoutes(app: FastifyInstance) {
  app.get(
    "/programs/:slug/registrations/:registrationNumber/id-card",
    { config: idCardRateLimit },
    downloadPublicIdCardHandler,
  );
  // Anyone can verify; a signed-in team member is also credited in the scan log.
  app.get("/verify/:slug/:registrationNumber", { config: idCardRateLimit, preHandler: optionalAuthenticate }, verifyHandler);
}
