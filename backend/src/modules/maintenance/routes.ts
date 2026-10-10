import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { countRecipients, maintenanceInputSchema, publicMaintenance, readMaintenance, resendMaintenanceNotice, saveMaintenance, MAINTENANCE_AREAS } from "./service.js";

/** What every visitor's page asks every minute or so: is there a notice, and where does it show. Public, small, no secrets. */
export async function publicMaintenanceRoutes(app: FastifyInstance) {
  app.get("/maintenance", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await publicMaintenance());
  });
}

/** For the platform's super admin: switch maintenance on or off, choose the message and where it shows, and email people. */
export async function platformMaintenanceRoutes(app: FastifyInstance) {
  app.get("/maintenance", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    const state = await readMaintenance();
    const [staff, withVoters] = await Promise.all([countRecipients({ staff: true, voters: false }), countRecipients({ staff: true, voters: true })]);
    return sendSuccess(reply, { ...state, areasAvailable: MAINTENANCE_AREAS, recipients: { staff, staffAndVoters: withVoters } });
  });

  app.put("/maintenance", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    const input = maintenanceInputSchema.parse(request.body);
    const result = await saveMaintenance({ id: request.user.id }, input, request.ip);
    return sendSuccess(reply, result, input.enabled ? "Maintenance mode is on" : "Maintenance mode is off");
  });

  app.post("/maintenance/notify", { config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } }, async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    return sendSuccess(reply, await resendMaintenanceNotice({ id: request.user.id }, request.ip), "The notice is being emailed");
  });
}
