import { AppError } from "../../lib/errors.js";
import type { PaginationInput } from "../../lib/pagination.js";
import { buildPaginatedResult } from "../../lib/pagination.js";
import * as platformRepo from "./repository.js";

export async function listTenants(pagination: PaginationInput, range: { dateFrom?: Date; dateTo?: Date } = {}) {
  const { items, total } = await platformRepo.listTenants(pagination, range);
  return buildPaginatedResult(items, total, pagination);
}

export async function getTenant(tenantId: string) {
  const tenant = await platformRepo.findTenantById(tenantId);
  if (!tenant) throw AppError.notFound("Account not found");
  return tenant;
}

export async function getTenantUsers(tenantId: string, range: { dateFrom?: Date; dateTo?: Date } = {}) {
  await getTenant(tenantId);
  return platformRepo.listUsersForTenant(tenantId, range);
}

export async function setUserStatus(userId: string, status: "active" | "suspended") {
  const user = await platformRepo.updateUserStatus(userId, status);
  if (!user) throw AppError.notFound("User not found");
  // Suspension is enforced on every request (authenticate re-reads the user), but
  // also end their sessions so the refresh cookie can't mint new access tokens.
  if (status === "suspended") await platformRepo.revokeUserSessions(userId);
  return user;
}

export async function getTenantPrograms(tenantId: string, range: { dateFrom?: Date; dateTo?: Date } = {}) {
  await getTenant(tenantId);
  return platformRepo.listProgramsForTenant(tenantId, range);
}
