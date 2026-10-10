import { and, count, desc, eq, ilike, isNull, max, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { auditLogs, tenants } from "../../db/schema/index.js";
import { dateRangeConditions, type DateRange } from "../../lib/dateRange.js";
import type { PaginationInput } from "../../lib/pagination.js";
import { buildPaginatedResult, toOffsetLimit } from "../../lib/pagination.js";

export interface AuditFilters extends DateRange {
  /** An account id, or "none" for activity that belongs to no account (visitors, sign-in attempts, the system). */
  tenantId?: string;
  search?: string;
  outcome?: "success" | "failed" | "denied";
  actorType?: "user" | "visitor" | "voter" | "system";
  entityType?: string;
  source?: "request" | "event";
  actorUserId?: string;
}

function buildWhere(filters: AuditFilters): SQL | undefined {
  const conditions: SQL[] = [...dateRangeConditions(auditLogs.createdAt, filters)];
  if (filters.tenantId === "none") conditions.push(isNull(auditLogs.tenantId));
  else if (filters.tenantId) conditions.push(eq(auditLogs.tenantId, filters.tenantId));
  if (filters.outcome) conditions.push(eq(auditLogs.outcome, filters.outcome));
  if (filters.actorType) conditions.push(eq(auditLogs.actorType, filters.actorType));
  if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
  if (filters.source) conditions.push(eq(auditLogs.source, filters.source));
  if (filters.actorUserId) conditions.push(eq(auditLogs.actorUserId, filters.actorUserId));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(auditLogs.label, term),
        ilike(auditLogs.action, term),
        ilike(auditLogs.actorName, term),
        ilike(auditLogs.actorEmail, term),
        ilike(auditLogs.entityId, term),
        ilike(auditLogs.ipAddress, term),
        ilike(auditLogs.requestId, term),
        ilike(sql`${auditLogs.metadata}::text`, term),
      )!,
    );
  }
  return conditions.length ? and(...conditions) : undefined;
}

const listColumns = {
  id: auditLogs.id,
  createdAt: auditLogs.createdAt,
  tenantId: auditLogs.tenantId,
  tenantName: tenants.name,
  actorType: auditLogs.actorType,
  actorUserId: auditLogs.actorUserId,
  actorName: auditLogs.actorName,
  actorEmail: auditLogs.actorEmail,
  actorRole: auditLogs.actorRole,
  action: auditLogs.action,
  label: auditLogs.label,
  entityType: auditLogs.entityType,
  entityId: auditLogs.entityId,
  entityLabel: auditLogs.entityLabel,
  outcome: auditLogs.outcome,
  source: auditLogs.source,
  method: auditLogs.method,
  path: auditLogs.path,
  statusCode: auditLogs.statusCode,
  ipAddress: auditLogs.ipAddress,
  // A short note for the table; the full details open on click.
  registrationNumber: sql<string | null>`${auditLogs.metadata}->>'registrationNumber'`,
};

export async function listAuditLogs(filters: AuditFilters, pagination: PaginationInput) {
  const where = buildWhere(filters);
  const { limit, offset } = toOffsetLimit(pagination);
  const [items, totalRow] = await Promise.all([
    db.select(listColumns).from(auditLogs).leftJoin(tenants, eq(tenants.id, auditLogs.tenantId)).where(where).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset),
    db.select({ value: count() }).from(auditLogs).where(where),
  ]);
  return buildPaginatedResult(items, Number(totalRow[0]?.value ?? 0), pagination);
}

/** Everything about one entry, including the details kept with it. */
export async function getAuditEntry(id: string) {
  const [row] = await db
    .select({ entry: auditLogs, tenantName: tenants.name })
    .from(auditLogs)
    .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
    .where(eq(auditLogs.id, id))
    .limit(1);
  return row ? { ...row.entry, tenantName: row.tenantName } : null;
}

/** Each account with how much happened in it, most recently active first, for choosing whose activity to look at. */
export async function accountSummaries(filters: DateRange & { search?: string }) {
  const range = dateRangeConditions(auditLogs.createdAt, filters);
  const search = filters.search ? ilike(tenants.name, `%${filters.search}%`) : undefined;
  const where = range.length || search ? and(...range, search) : undefined;
  const rows = await db
    .select({
      tenantId: auditLogs.tenantId,
      name: tenants.name,
      slug: tenants.slug,
      total: count(),
      lastActivityAt: max(auditLogs.createdAt),
      problems: sql<number>`count(*) filter (where ${auditLogs.outcome} <> 'success')::int`,
    })
    .from(auditLogs)
    .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
    .where(where)
    .groupBy(auditLogs.tenantId, tenants.name, tenants.slug)
    .orderBy(desc(max(auditLogs.createdAt)))
    .limit(500);
  return rows.map((r) => ({
    tenantId: r.tenantId,
    name: r.tenantId ? (r.name ?? "Deleted account") : "No account (visitors, sign-in attempts, system)",
    slug: r.slug,
    total: Number(r.total),
    lastActivityAt: r.lastActivityAt,
    problems: Number(r.problems),
  }));
}
