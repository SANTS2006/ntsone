import { z } from "zod";
import { dateRangeQuery } from "../../lib/dateRange.js";
import { date, EXPORT_ROW_LIMIT, exportFormatSchema, sendTableExport, type ExportSheet } from "../../lib/tableExport.js";
import { roleLabel } from "../email/templates.js";
import * as usersRepo from "./repository.js";
import type { FastifyInstance } from "fastify";
import { requireRole } from "../../middleware/authorize.js";
import {
  addMembershipHandler,
  createUserHandler,
  getUserHandler,
  listMembershipsHandler,
  listUsersHandler,
  removeMembershipHandler,
  removeTeamMemberHandler,
  updateUserHandler,
} from "./controller.js";
import { pollAccessRoutes } from "./pollAccess.js";
import { businessAccessRoutes } from "./businessAccess.js";

// Tenant admins' own team-management surface -- the platform super_admin
// does not use this router at all (see modules/platform for its read-only
// cross-tenant equivalent).
export async function userRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("admin"));

  app.get("/", listUsersHandler);
  app.get("/export", async (request, reply) => {
    const query = exportFormatSchema.extend({ search: z.string().trim().min(1).optional(), ...dateRangeQuery }).parse(request.query);
    const { items } = await usersRepo.listUsers(request.user!.tenantId!, query.search, { page: 1, pageSize: EXPORT_ROW_LIMIT }, { dateFrom: query.dateFrom, dateTo: query.dateTo });
    const sheet: ExportSheet<(typeof items)[number]> = {
      name: "Users",
      rows: items,
      columns: [
        { label: "Name", value: (u) => u.name },
        { label: "Email", value: (u) => u.email },
        { label: "Role", value: (u) => roleLabel(u.role) },
        { label: "Status", value: (u) => u.status },
        { label: "Joined", value: (u) => date(u.createdAt) },
        { label: "Last sign-in", value: (u) => date(u.lastLoginAt) },
      ],
    };
    return sendTableExport(reply, query.format, "Users", [sheet]);
  });
  app.post("/", createUserHandler);
  app.get("/:userId", getUserHandler);
  app.patch("/:userId", updateUserHandler);
  app.delete("/:userId", removeTeamMemberHandler);
  app.get("/:userId/programs", listMembershipsHandler);
  app.post("/:userId/programs", addMembershipHandler);
  app.delete("/:userId/programs/:programId", removeMembershipHandler);
  await app.register(pollAccessRoutes);
  await app.register(businessAccessRoutes);
}
