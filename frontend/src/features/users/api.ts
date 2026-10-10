import { apiFetch } from "@/lib/api";
import type { PaginatedResult, ProgramRole, UserRole, UserStatus } from "@/types/api";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** Has an account space of their own and is on your team by invitation. */
  ownSpace?: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Membership {
  programId: string;
  roleOnProgram: ProgramRole;
  programName: string;
  programSlug: string;
}

export function listUsers(params: { page?: number; pageSize?: number; search?: string; dateFrom?: string; dateTo?: string }) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  return apiFetch<PaginatedResult<AdminUser>>(`/users?${query.toString()}`);
}

export function createUser(input: { name: string; email: string; password: string; role: UserRole }) {
  return apiFetch<AdminUser>("/users", { method: "POST", body: input });
}

export function updateUser(userId: string, input: Partial<{ name: string; role: UserRole; status: UserStatus }>) {
  return apiFetch<AdminUser>(`/users/${userId}`, { method: "PATCH", body: input });
}

export function listMemberships(userId: string) {
  return apiFetch<Membership[]>(`/users/${userId}/programs`);
}

export function addMembership(userId: string, programId: string, roleOnProgram: ProgramRole) {
  return apiFetch<Membership[]>(`/users/${userId}/programs`, { method: "POST", body: { programId, roleOnProgram } });
}

export function removeMembership(userId: string, programId: string) {
  return apiFetch<null>(`/users/${userId}/programs/${programId}`, { method: "DELETE" });
}

export function removeTeamMember(userId: string) {
  return apiFetch<null>(`/users/${userId}`, { method: "DELETE" });
}
