import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { dateRangeConditions, dateRangeQuery, type DateRange } from "../../lib/dateRange.js";
import { db } from "../../db/client.js";
import { programs, supportMessages, tenants, users } from "../../db/schema/index.js";
import { toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";

export type SupportMessageKind = (typeof supportMessages.$inferInsert)["kind"];
export type SupportMessageStatus = NonNullable<(typeof supportMessages.$inferInsert)["status"]>;
export type NewSupportMessage = typeof supportMessages.$inferInsert;

/** Stores a message for the super admin's inbox. Never throws: the email copy is what the sender relies on. */
export async function saveSupportMessage(values: NewSupportMessage): Promise<void> {
  try {
    await db.insert(supportMessages).values(values);
  } catch (err) {
    console.error("Could not save support message:", err);
  }
}

const listColumns = {
  id: supportMessages.id,
  kind: supportMessages.kind,
  status: supportMessages.status,
  category: supportMessages.category,
  subject: supportMessages.subject,
  message: supportMessages.message,
  name: supportMessages.name,
  email: supportMessages.email,
  phone: supportMessages.phone,
  link: supportMessages.link,
  ipAddress: supportMessages.ipAddress,
  createdAt: supportMessages.createdAt,
  userName: users.name,
  userEmail: users.email,
  organizationName: tenants.name,
  programId: supportMessages.programId,
  programName: programs.name,
};

export async function listSupportMessages(
  filters: { kind?: SupportMessageKind; status?: SupportMessageStatus; search?: string; dateFrom?: Date; dateTo?: Date },
  pagination: PaginationInput,
) {
  const conditions: SQL[] = [];
  if (filters.kind) conditions.push(eq(supportMessages.kind, filters.kind));
  if (filters.status) conditions.push(eq(supportMessages.status, filters.status));
  conditions.push(...dateRangeConditions(supportMessages.createdAt, filters));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(supportMessages.subject, term),
        ilike(supportMessages.message, term),
        ilike(supportMessages.name, term),
        ilike(supportMessages.email, term),
        ilike(users.name, term),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const { limit, offset } = toOffsetLimit(pagination);

  const [items, totalRow] = await Promise.all([
    db
      .select(listColumns)
      .from(supportMessages)
      .leftJoin(users, eq(users.id, supportMessages.userId))
      .leftJoin(tenants, eq(tenants.id, supportMessages.tenantId))
      .leftJoin(programs, eq(programs.id, supportMessages.programId))
      .where(where)
      .orderBy(desc(supportMessages.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(supportMessages)
      .leftJoin(users, eq(users.id, supportMessages.userId))
      .where(where),
  ]);
  return { items, total: Number(totalRow[0]?.value ?? 0) };
}

export async function countNewByKind() {
  const rows = await db
    .select({ kind: supportMessages.kind, value: count() })
    .from(supportMessages)
    .where(eq(supportMessages.status, "new"))
    .groupBy(supportMessages.kind);
  const counts: Record<SupportMessageKind, number> = { feedback: 0, contact: 0, report: 0 };
  for (const row of rows) counts[row.kind] = Number(row.value);
  return counts;
}

export async function findSupportMessage(id: string) {
  const [row] = await db
    .select(listColumns)
    .from(supportMessages)
    .leftJoin(users, eq(users.id, supportMessages.userId))
    .leftJoin(tenants, eq(tenants.id, supportMessages.tenantId))
    .leftJoin(programs, eq(programs.id, supportMessages.programId))
    .where(eq(supportMessages.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateSupportMessageStatus(id: string, status: SupportMessageStatus) {
  const [row] = await db.update(supportMessages).set({ status }).where(eq(supportMessages.id, id)).returning();
  return row ?? null;
}
