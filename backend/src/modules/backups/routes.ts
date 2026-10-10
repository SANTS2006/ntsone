import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { paginationSchema } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import {
  createBackupInBackground,
  deleteBackup,
  getBackup,
  getOverview,
  getPolicy,
  getRestore,
  listBackups,
  listQuerySchema,
  listRestores,
  policySchema,
  prepareDownload,
  previewRestore,
  requestRestore,
  restoreRequestSchema,
  savePolicy,
  verifyBackup,
} from "./service.js";

const idParams = z.object({ backupId: z.string().uuid() });
const restoreParams = z.object({ restoreId: z.string().uuid() });
const passwordBody = z.object({ password: z.string().min(1).max(200) });

/**
 * Backup & Recovery for the platform's super admin (mounted under /api/platform, which already requires that role).
 * Nothing here ever returns a storage location, a credential or an encryption key.
 */
export async function platformBackupRoutes(app: FastifyInstance) {
  const user = (request: { user?: { id: string } }) => {
    if (!request.user) throw AppError.unauthorized();
    return request.user;
  };

  app.get("/backups/overview", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await getOverview());
  });

  app.get("/backups/policy", async (_request, reply) => sendSuccess(reply, await getPolicy()));
  app.put("/backups/policy", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const input = policySchema.parse(request.body);
    return sendSuccess(reply, await savePolicy(user(request), input), "Retention policy saved");
  });

  app.get("/backups", async (request, reply) => sendSuccess(reply, await listBackups(listQuerySchema.parse(request.query))));

  // A manual backup runs in the background; the screen follows it through the list or overview.
  app.post("/backups", { config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const backup = await createBackupInBackground("manual", user(request));
    reply.status(202);
    return sendSuccess(reply, backup, "Backup started");
  });

  // ---- restores (declared before /backups/:backupId so "restores" is never read as an id)
  app.get("/backups/restores", async (request, reply) => sendSuccess(reply, await listRestores(paginationSchema.parse(request.query))));
  app.get("/backups/restores/:restoreId", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await getRestore(restoreParams.parse(request.params).restoreId));
  });
  app.post("/backups/restores", { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = restoreRequestSchema.parse(request.body);
    const restore = await requestRestore(user(request), input, String(request.id));
    reply.status(202);
    return sendSuccess(reply, restore, "Restore queued");
  });

  app.get("/backups/:backupId", async (request, reply) => sendSuccess(reply, await getBackup(idParams.parse(request.params).backupId)));

  // Step 2 of a restore: what would happen, and the words to type. Changes nothing.
  app.get("/backups/:backupId/restore-preview", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) =>
    sendSuccess(reply, await previewRestore(idParams.parse(request.params).backupId)),
  );

  app.post("/backups/:backupId/verify", { config: { rateLimit: { max: 6, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const { backupId } = idParams.parse(request.params);
    const row = await verifyBackup(backupId, user(request));
    return sendSuccess(reply, await getBackup(row.id), row.verificationStatus === "valid" ? "Backup verified" : "Verification failed");
  });

  app.delete("/backups/:backupId", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const { backupId } = idParams.parse(request.params);
    const { password } = passwordBody.parse(request.body);
    return sendSuccess(reply, await deleteBackup(backupId, user(request), password), "Backup deleted");
  });

  // POST, not GET, so the password is not in the address. The file is encrypted; it is useless without BACKUP_ENCRYPTION_KEY.
  app.post("/backups/:backupId/download", { config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const { backupId } = idParams.parse(request.params);
    const { password } = passwordBody.parse(request.body);
    const prepared = await prepareDownload(backupId, user(request), password);
    const stream = createReadStream(prepared.file);
    const cleanup = () => void rm(prepared.dir, { recursive: true, force: true }).catch(() => undefined);
    stream.on("close", cleanup);
    reply.header("Cache-Control", "no-store").header("Content-Type", "application/octet-stream").header("Content-Length", String(prepared.size)).header("Content-Disposition", `attachment; filename="${prepared.name}"`);
    return reply.send(stream);
  });
}
