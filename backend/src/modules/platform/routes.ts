import type { FastifyInstance } from "fastify";
import { requireRole } from "../../middleware/authorize.js";
import {
  getTenantHandler,
  listTenantProgramsHandler,
  listTenantUsersHandler,
  listTenantsHandler,
  updateUserStatusHandler,
} from "./controller.js";
import { getSupportMessageHandler, listSupportMessagesHandler, updateSupportMessageHandler } from "./inbox.js";
import { platformExportRoutes } from "./exports.js";
import { platformPaymentRoutes } from "../payments/routes.js";
import { platformFundRoutes } from "../payments/platformFund.js";
import { platformBackupRoutes } from "../backups/routes.js";
import { platformMaintenanceRoutes } from "../maintenance/routes.js";

// Cross-account administration for the platform super_admin. Program, form and
// registration management goes through the normal /programs routes, where the
// super_admin resolves to admin on every program.
export async function platformRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireRole("super_admin"));

  app.get("/tenants", listTenantsHandler);
  app.get("/tenants/:tenantId", getTenantHandler);
  app.get("/tenants/:tenantId/users", listTenantUsersHandler);
  app.get("/tenants/:tenantId/programs", listTenantProgramsHandler);
  app.patch("/users/:userId/status", updateUserStatusHandler);

  // Inbox: feedback, contact form messages, and reports.
  app.get("/messages", listSupportMessagesHandler);
  app.get("/messages/:messageId", getSupportMessageHandler);
  app.patch("/messages/:messageId", updateSupportMessageHandler);

  await app.register(platformExportRoutes);
  await app.register(platformPaymentRoutes);
  await app.register(platformFundRoutes);
  await app.register(platformMaintenanceRoutes);
  await app.register(platformBackupRoutes);
}
