import { and, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { dateRangeConditions, dateRangeQuery, type DateRange } from "../../lib/dateRange.js";
import { db } from "../../db/client.js";
import { businessMembers, businesses, pollMembers, polls, programMembers, programs, tenantMembers, tenants, users } from "../../db/schema/index.js";
import type { PaginationInput } from "../../lib/pagination.js";
import { toOffsetLimit } from "../../lib/pagination.js";
import type { CreateUserInput, UpdateUserInput } from "./schemas.js";

export async function insertUser(tenantId: string, input: CreateUserInput & { passwordHash: string }) {
  const [row] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      tenantId,
    })
    .returning();
  return row!;
}

/** The team: people inside the account, and people on the team who have a space of their own. */
export async function listUsers(tenantId: string, search: string | undefined, pagination: PaginationInput, range: DateRange = {}) {
  const link = and(eq(tenantMembers.userId, users.id), eq(tenantMembers.tenantId, tenantId));
  const conditions = [or(eq(users.tenantId, tenantId), isNotNull(tenantMembers.id))!];
  if (search) {
    const term = `%${search}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term))!);
  }
  conditions.push(...dateRangeConditions(users.createdAt, range));
  const where = and(...conditions);
  const { limit, offset } = toOffsetLimit(pagination);

  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: sql<string>`coalesce(${tenantMembers.role}, ${users.role}::text)`,
        status: users.status,
        ownSpace: sql<boolean>`${tenantMembers.id} is not null`,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .leftJoin(tenantMembers, link)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(users).leftJoin(tenantMembers, link).where(where),
  ]);

  return { items, total: Number(totalRow[0]?.value ?? 0) };
}

/** A person on this team, whether inside the account or on the team with a space of their own. */
export async function findTeamMember(id: string, tenantId: string) {
  const [row] = await db
    .select({
      user: users,
      linkRole: tenantMembers.role,
      linkId: tenantMembers.id,
    })
    .from(users)
    .leftJoin(tenantMembers, and(eq(tenantMembers.userId, users.id), eq(tenantMembers.tenantId, tenantId)))
    .where(and(eq(users.id, id), or(eq(users.tenantId, tenantId), isNotNull(tenantMembers.id))))
    .limit(1);
  if (!row) return null;
  return { user: row.user, role: row.linkRole ?? row.user.role, ownSpace: !!row.linkId };
}

/** Puts someone on a team with the role they were invited into; an existing role is left alone. */
export async function ensureTeamLink(tenantId: string, userId: string, role: "program_admin" | "viewer") {
  await db.insert(tenantMembers).values({ tenantId, userId, role }).onConflictDoNothing();
}

export async function setTeamLinkRole(tenantId: string, userId: string, role: "program_admin" | "viewer") {
  await db.update(tenantMembers).set({ role }).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)));
}

const toResourceRole = (role: "program_admin" | "viewer") => (role === "program_admin" ? ("admin" as const) : ("viewer" as const));

/** A role change on the team applies to everything of this account the person has access to. */
export async function applyRoleToMemberships(tenantId: string, userId: string, role: "program_admin" | "viewer") {
  const resourceRole = toResourceRole(role);
  await Promise.all([
    db
      .update(programMembers)
      .set({ roleOnProgram: resourceRole })
      .where(and(eq(programMembers.userId, userId), inArray(programMembers.programId, db.select({ id: programs.id }).from(programs).where(eq(programs.tenantId, tenantId))))),
    db
      .update(pollMembers)
      .set({ roleOnPoll: resourceRole })
      .where(and(eq(pollMembers.userId, userId), inArray(pollMembers.pollId, db.select({ id: polls.id }).from(polls).where(eq(polls.tenantId, tenantId))))),
    db
      .update(businessMembers)
      .set({ roleOnBusiness: resourceRole })
      .where(and(eq(businessMembers.userId, userId), inArray(businessMembers.businessId, db.select({ id: businesses.id }).from(businesses).where(eq(businesses.tenantId, tenantId))))),
  ]);
}

/** Takes someone off the team and removes their access to everything in this account. */
export async function removeFromTeam(tenantId: string, userId: string) {
  await Promise.all([
    db
      .delete(programMembers)
      .where(and(eq(programMembers.userId, userId), inArray(programMembers.programId, db.select({ id: programs.id }).from(programs).where(eq(programs.tenantId, tenantId))))),
    db
      .delete(pollMembers)
      .where(and(eq(pollMembers.userId, userId), inArray(pollMembers.pollId, db.select({ id: polls.id }).from(polls).where(eq(polls.tenantId, tenantId))))),
    db
      .delete(businessMembers)
      .where(and(eq(businessMembers.userId, userId), inArray(businessMembers.businessId, db.select({ id: businesses.id }).from(businesses).where(eq(businesses.tenantId, tenantId))))),
  ]);
  await db.delete(tenantMembers).where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)));
}

export async function findUserByIdInTenant(id: string, tenantId: string) {
  const [row] = await db.select().from(users).where(and(eq(users.id, id), eq(users.tenantId, tenantId))).limit(1);
  return row ?? null;
}

export async function findTenantName(tenantId: string): Promise<string | null> {
  const [row] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return row?.name ?? null;
}

export async function findUserByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return row ?? null;
}

export async function updateUser(id: string, tenantId: string, input: UpdateUserInput) {
  const [row] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
    .returning();
  return row!;
}

export async function listMembershipsForUser(userId: string, tenantId: string) {
  return db
    .select({
      programId: programMembers.programId,
      roleOnProgram: programMembers.roleOnProgram,
      programName: programs.name,
      programSlug: programs.slug,
    })
    .from(programMembers)
    .innerJoin(programs, eq(programs.id, programMembers.programId))
    .where(and(eq(programMembers.userId, userId), eq(programs.tenantId, tenantId)));
}

export async function programBelongsToTenant(programId: string, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.tenantId, tenantId)))
    .limit(1);
  return !!row;
}

export async function upsertMembership(userId: string, programId: string, roleOnProgram: "admin" | "viewer") {
  await db
    .insert(programMembers)
    .values({ userId, programId, roleOnProgram })
    .onConflictDoUpdate({
      target: [programMembers.userId, programMembers.programId],
      set: { roleOnProgram },
    });
}

export async function removeMembership(userId: string, programId: string) {
  await db
    .delete(programMembers)
    .where(and(eq(programMembers.userId, userId), eq(programMembers.programId, programId)));
}
