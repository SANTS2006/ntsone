import { apiFetch } from "@/lib/api";
import type { PaginatedResult } from "@/types/api";

export type Outcome = "success" | "failed" | "denied";
export type ActorType = "user" | "visitor" | "voter" | "system";

export interface AuditRow {
  id: string;
  createdAt: string;
  tenantId: string | null;
  tenantName: string | null;
  actorType: ActorType;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  label: string | null;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  outcome: Outcome;
  source: "request" | "event";
  method: string | null;
  path: string | null;
  statusCode: number | null;
  ipAddress: string | null;
  registrationNumber: string | null;
}

export interface AuditEntry extends Omit<AuditRow, "registrationNumber"> {
  requestId: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditAccount {
  /** null: activity that belongs to no account (visitors, sign-in attempts, the system). */
  tenantId: string | null;
  name: string;
  slug: string | null;
  total: number;
  lastActivityAt: string | null;
  problems: number;
}

export interface AuditFilters {
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  outcome?: string;
  actorType?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
}

function toQuery(params: object) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) if (value !== undefined && value !== "") query.set(key, String(value));
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const listAuditAccounts = (params: { dateFrom?: string; dateTo?: string; search?: string }) => apiFetch<AuditAccount[]>(`/audit-logs/accounts${toQuery(params)}`);
export const listAuditLogs = (filters: AuditFilters) => apiFetch<PaginatedResult<AuditRow>>(`/audit-logs${toQuery(filters)}`);
export const getAuditEntry = (id: string) => apiFetch<AuditEntry>(`/audit-logs/${id}`);
