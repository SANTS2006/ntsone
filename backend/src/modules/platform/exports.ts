import type { FastifyInstance } from "fastify";
import { dateRangeQuery } from "../../lib/dateRange.js";
import { z } from "zod";
import { date, EXPORT_ROW_LIMIT, exportFormatSchema, sendTableExport, type ExportSheet } from "../../lib/tableExport.js";
import * as supportRepo from "../support/repository.js";
import * as platformRepo from "./repository.js";

type Tenant = Awaited<ReturnType<typeof platformRepo.listTenants>>["items"][number];
type TenantProgram = Awaited<ReturnType<typeof platformRepo.listProgramsForTenant>>[number];
type TenantUser = Awaited<ReturnType<typeof platformRepo.listUsersForTenant>>[number];
type Message =Awaited<ReturnType<typeof supportRepo.listSupportMessages>>["items"][number];

/** CSV/Excel downloads of the platform tables: accounts, an account's programs, and the inbox. */
export async function platformExportRoutes(app: FastifyInstance) {
  app.get("/tenants/export", async (request, reply) => {
    const { format, dateFrom, dateTo } = exportFormatSchema.extend(dateRangeQuery).parse(request.query);
    const { items } = await platformRepo.listTenants({ page: 1, pageSize: EXPORT_ROW_LIMIT }, { dateFrom, dateTo });
    const sheet: ExportSheet<Tenant> = {
      name: "Accounts",
      rows: items,
      columns: [
        { label: "Account", value: (t) => t.name },
        { label: "Owner", value: (t) => t.ownerName },
        { label: "Owner email", value: (t) => t.ownerEmail },
        { label: "Users", value: (t) => t.userCount },
        { label: "Programs", value: (t) => t.programCount },
        { label: "Voting polls", value: (t) => t.pollCount },
        { label: "Businesses", value: (t) => t.businessCount },
        { label: "Created", value: (t) => date(t.createdAt) },
      ],
    };
    return sendTableExport(reply, format, "Accounts", [sheet]);
  });

  app.get<{ Params: { tenantId: string } }>("/tenants/:tenantId/programs/export", async (request, reply) => {
    const { format, dateFrom, dateTo } = exportFormatSchema.extend(dateRangeQuery).parse(request.query);
    const [tenant, programs] = await Promise.all([
      platformRepo.findTenantById(request.params.tenantId),
      platformRepo.listProgramsForTenant(request.params.tenantId, { dateFrom, dateTo }),
    ]);
    const sheet: ExportSheet<TenantProgram> = {
      name: "Programs",
      rows: programs,
      columns: [
        { label: "Program", value: (p) => p.name },
        { label: "Link name", value: (p) => p.slug },
        { label: "Status", value: (p) => p.status },
        { label: "Registration open", value: (p) => p.registrationEnabled },
        { label: "Created", value: (p) => date(p.createdAt) },
      ],
    };
    return sendTableExport(reply, format, `${tenant?.name ?? "Account"} programs`, [sheet]);
  });

  app.get<{ Params: { tenantId: string } }>("/tenants/:tenantId/users/export", async (request, reply) => {
    const { format, dateFrom, dateTo } = exportFormatSchema.extend(dateRangeQuery).parse(request.query);
    const [tenant, users] = await Promise.all([
      platformRepo.findTenantById(request.params.tenantId),
      platformRepo.listUsersForTenant(request.params.tenantId, { dateFrom, dateTo }),
    ]);
    const sheet: ExportSheet<TenantUser> = {
      name: "Users",
      rows: users,
      columns: [
        { label: "Name", value: (u) => u.name },
        { label: "Email", value: (u) => u.email },
        { label: "Role", value: (u) => u.role },
        { label: "Status", value: (u) => u.status },
        { label: "Joined", value: (u) => date(u.createdAt) },
        { label: "Last sign-in", value: (u) => date(u.lastLoginAt) },
      ],
    };
    return sendTableExport(reply, format, `${tenant?.name ?? "Account"} users`, [sheet]);
  });

  app.get("/messages/export", async (request, reply) => {
    const query = exportFormatSchema
      .extend({
        kind: z.enum(["feedback", "contact", "report"]).optional(),
        status: z.enum(["new", "read", "resolved"]).optional(),
        search: z.string().trim().max(200).optional(),
        ...dateRangeQuery,
      })
      .parse(request.query);
    const { items } = await supportRepo.listSupportMessages(
      { kind: query.kind, status: query.status, search: query.search || undefined, dateFrom: query.dateFrom, dateTo: query.dateTo },
      { page: 1, pageSize: EXPORT_ROW_LIMIT },
    );
    const sheet: ExportSheet<Message> = {
      name: "Inbox",
      rows: items,
      columns: [
        { label: "Received", value: (m) => date(m.createdAt) },
        { label: "Type", value: (m) => m.kind },
        { label: "Status", value: (m) => m.status },
        { label: "Category", value: (m) => m.category },
        { label: "Subject", value: (m) => m.subject },
        { label: "Message", value: (m) => m.message },
        { label: "Name", value: (m) => m.name ?? m.userName },
        { label: "Email", value: (m) => m.email ?? m.userEmail },
        { label: "Phone", value: (m) => m.phone },
        { label: "Account", value: (m) => m.organizationName },
        { label: "Program", value: (m) => m.programName },
        { label: "Link", value: (m) => m.link },
      ],
    };
    return sendTableExport(reply, query.format, `Inbox${query.kind ? ` ${query.kind}` : ""}`, [sheet]);
  });
}
