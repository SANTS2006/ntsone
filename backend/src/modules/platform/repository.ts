import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { dateRangeConditions, type DateRange } from "../../lib/dateRange.js";
import { db } from "../../db/client.js";
import { programs, refreshTokens, tenants, users } from "../../db/schema/index.js";
import type { PaginationInput } from "../../lib/pagination.js";
import { toOffsetLimit } from "../../lib/pagination.js";

export async function listTenants(pagination: PaginationInput, range: DateRange = {}) {
  const { limit, offset } = toOffsetLimit(pagination);
  const conds: SQL[] = [];
  if (range.dateFrom) conds.push(sql`t.created_at >= ${range.dateFrom}`);
  if (range.dateTo) conds.push(sql`t.created_at <= ${range.dateTo}`);
  const whereSql = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

  const result = await db.execute<{
    id: string;
    name: string;
    slug: string;
    created_at: string;
    owner_name: string | null;
    owner_email: string | null;
    user_count: number;
    program_count: number;
    poll_count: number;
    business_count: number;
  }>(sql`
    SELECT
      t.id, t.name, t.slug, t.created_at,
      owner.name AS owner_name, owner.email AS owner_email,
      (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id) AS user_count,
      (SELECT count(*)::int FROM programs p WHERE p.tenant_id = t.id AND p.deleted_at IS NULL AND p.kind <> 'order_form') AS program_count,
      (SELECT count(*)::int FROM polls pl WHERE pl.tenant_id = t.id AND pl.deleted_at IS NULL) AS poll_count,
      (SELECT count(*)::int FROM businesses b WHERE b.tenant_id = t.id AND b.deleted_at IS NULL) AS business_count
    FROM tenants t
    LEFT JOIN users owner ON owner.id = t.owner_user_id
    ${whereSql}
    ORDER BY t.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const [totalRow] = (await db.execute<{ value: number }>(sql`SELECT count(*)::int AS value FROM tenants t ${whereSql}`)).rows;

  return {
    items: result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.created_at,
      ownerName: r.owner_name,
      ownerEmail: r.owner_email,
      userCount: Number(r.user_count),
      programCount: Number(r.program_count),
      pollCount: Number(r.poll_count),
      businessCount: Number(r.business_count),
    })),
    total: Number(totalRow?.value ?? 0),
  };
}

export async function findTenantById(tenantId: string) {
  const [row] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      ownerUserId: tenants.ownerUserId,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row ?? null;
}

export async function listUsersForTenant(tenantId: string, range: DateRange = {}) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), ...dateRangeConditions(users.createdAt, range)))
    .orderBy(desc(users.createdAt));
}

export async function updateUserStatus(userId: string, status: "active" | "suspended") {
  const [row] = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status });
  return row ?? null;
}

export async function revokeUserSessions(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function listProgramsForTenant(tenantId: string, range: DateRange = {}) {
  return db
    .select({
      id: programs.id,
      name: programs.name,
      slug: programs.slug,
      status: programs.status,
      registrationEnabled: programs.registrationEnabled,
      createdAt: programs.createdAt,
    })
    .from(programs)
    .where(and(eq(programs.tenantId, tenantId), isNull(programs.deletedAt), ...dateRangeConditions(programs.createdAt, range)))
    .orderBy(desc(programs.createdAt));
}
