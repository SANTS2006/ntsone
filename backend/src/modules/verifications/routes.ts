import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { dateRangeConditions, dateRangeQuery, type DateRange } from "../../lib/dateRange.js";
import { buildPaginatedResult, paginationSchema } from "../../lib/pagination.js";
import { sendSuccess } from "../../lib/response.js";
import { requireProgramAccess } from "../../middleware/authorize.js";
import { date, EXPORT_ROW_LIMIT, exportFormatSchema, sendTableExport, type ExportSheet } from "../../lib/tableExport.js";
import * as programsRepo from "../programs/repository.js";
import * as verificationsRepo from "./repository.js";

const listQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
  documentType: z.enum(["id_card", "ticket", "link"]).optional(),
  result: z.enum(["valid", "invalid"]).optional(),
  registrationId: z.string().uuid().optional(),
  ...dateRangeQuery,
});

async function listVerificationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const query = listQuerySchema.parse(request.query);
  const filters = {
    search: query.search || undefined,
    documentType: query.documentType,
    valid: query.result === undefined ? undefined : query.result === "valid",
    registrationId: query.registrationId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };

  const [{ items, total }, summary] = await Promise.all([
    verificationsRepo.listVerifications(programId, filters, query),
    verificationsRepo.getVerificationSummary(programId),
  ]);
  return sendSuccess(reply, { ...buildPaginatedResult(items, total, query), summary });
}

async function exportVerificationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { programId } = request.params as { programId: string };
  const query = listQuerySchema.merge(exportFormatSchema).parse(request.query);
  const filters = {
    search: query.search || undefined,
    documentType: query.documentType,
    valid: query.result === undefined ? undefined : query.result === "valid",
    registrationId: query.registrationId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
  const [{ items }, program] = await Promise.all([
    verificationsRepo.listVerifications(programId, filters, { page: 1, pageSize: EXPORT_ROW_LIMIT }),
    programsRepo.findProgramById(programId),
  ]);
  const documentLabel = { id_card: "ID card", ticket: "Ticket", link: "QR code" } as const;
  return sendTableExport(reply, query.format, `${program?.name ?? "Program"} verifications`, [
    {
      name: "Verifications",
      rows: items,
      columns: [
        { label: "Scanned at", value: (r) => date(r.createdAt) },
        { label: "Registration number", value: (r) => r.registrationNumber },
        { label: "Name", value: (r) => r.applicantName },
        { label: "Email", value: (r) => r.applicantEmail },
        { label: "Document", value: (r) => documentLabel[r.documentType] },
        { label: "Result", value: (r) => (r.valid ? "Valid" : "Not valid") },
        { label: "Status when scanned", value: (r) => r.registrationStatus },
        { label: "Current status", value: (r) => r.currentStatus },
        { label: "Scanned by", value: (r) => r.verifiedByName ?? "Not signed in" },
      ],
    } satisfies ExportSheet<(typeof items)[number]>,
  ]);
}

export async function verificationRoutes(app: FastifyInstance) {
  app.get("/:programId/verifications", { preHandler: requireProgramAccess("viewer") }, listVerificationsHandler);
  app.get("/:programId/verifications/export", { preHandler: requireProgramAccess("viewer") }, exportVerificationsHandler);
}
