import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../lib/response.js";

const clientErrorSchema = z.object({
  kind: z.string().max(40),
  message: z.string().max(300),
  stack: z.string().max(1200).optional(),
  path: z.string().max(200).optional(),
  extra: z.string().max(200).optional(),
});

/**
 * Where the web app reports problems that happened in a visitor's browser (a page that failed to draw, a page piece that
 * failed to download). Each report goes to the server log only, never to the database, is tightly rate limited and
 * length limited, and is logged as data so it cannot forge log lines.
 */
export async function diagnosticsRoutes(app: FastifyInstance) {
  app.post("/client-errors", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } }, bodyLimit: 4096 }, async (request, reply) => {
    const parsed = clientErrorSchema.safeParse(request.body);
    if (parsed.success) request.log.warn({ clientError: parsed.data }, "Browser error report");
    return sendSuccess(reply, { received: true });
  });
}
