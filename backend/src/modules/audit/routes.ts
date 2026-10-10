import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { dateRangeQuery } from "../../lib/dateRange.js";
import { paginationSchema } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import { date, EXPORT_ROW_LIMIT, exportFormatSchema, sendTableExport, type ExportSheet } from "../../lib/tableExport.js";
import { requireRole } from "../../middleware/authorize.js";
import { accountSummaries, getAuditEntry, listAuditLogs } from "./service.js";

const filterSchema = z.object({
  ...dateRangeQuery,
  tenantId: z.union([z.literal("none"), z.string().uuid()]).optional(),
  search: z.string().trim().max(200).optional(),
  outcome: z.enum(["success", "failed", "denied"]).optional(),
  actorType: z.enum(["user", "visitor", "voter", "system"]).optional(),
  entityType: z.string().trim().max(60).optional(),
  source: z.enum(["request", "event"]).optional(),
  actorUserId: z.string().uuid().optional(),
});

/** The audit log. Only the platform's super admin can read it; nothing here can change or remove an entry. */
export async function auditRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("super_admin"));

  app.get("/", async (request, reply) => {
    const query = paginationSchema.merge(filterSchema).parse(request.query);
    return sendSuccess(reply, await listAuditLogs({ ...query, search: query.search || undefined }, query));
  });

  app.get("/accounts", async (request, reply) => {
    const query = z.object({ ...dateRangeQuery, search: z.string().trim().max(100).optional() }).parse(request.query);
    return sendSuccess(reply, await accountSummaries({ dateFrom: query.dateFrom, dateTo: query.dateTo, search: query.search || undefined }));
  });

  app.get("/export", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const query = filterSchema.merge(exportFormatSchema).parse(request.query);
    const { items } = await listAuditLogs({ ...query, search: query.search || undefined }, { page: 1, pageSize: EXPORT_ROW_LIMIT });
    const sheet: ExportSheet<(typeof items)[number]> = {
      name: "Audit log",
      rows: items,
      columns: [
        { label: "Time", value: (r) => date(r.createdAt) },
        { label: "Account", value: (r) => r.tenantName ?? (r.tenantId ? "Deleted account" : "No account") },
        { label: "Who", value: (r) => r.actorName ?? r.actorType },
        { label: "Email", value: (r) => r.actorEmail },
        { label: "Role", value: (r) => r.actorRole },
        { label: "Type", value: (r) => r.actorType },
        { label: "What happened", value: (r) => r.label ?? r.action },
        { label: "Action code", value: (r) => r.action },
        { label: "Result", value: (r) => r.outcome },
        { label: "On", value: (r) => r.entityType },
        { label: "Id", value: (r) => r.entityId },
        { label: "Registration number", value: (r) => r.registrationNumber },
        { label: "Address", value: (r) => r.ipAddress },
        { label: "Route", value: (r) => (r.method && r.path ? `${r.method} ${r.path}` : null) },
        { label: "Status code", value: (r) => r.statusCode },
      ],
    };
    return sendTableExport(reply, query.format, "Audit log", [sheet]);
  });

  app.get("/:entryId", async (request, reply) => {
    const { entryId } = z.object({ entryId: z.string().uuid() }).parse(request.params);
    const entry = await getAuditEntry(entryId);
    if (!entry) throw AppError.notFound("Entry not found");
    return sendSuccess(reply, entry);
  });
}
