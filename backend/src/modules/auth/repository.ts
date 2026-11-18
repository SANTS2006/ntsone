import { and, desc, eq, gt, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { businesses, businessMembers, payments, walletEntries, emailVerificationCodes, passwordResetTokens, payouts, pollMembers, polls, programMembers, programs, refreshTokens, tenantMembers, tenants, users } from "../../db/schema/index.js";

export type VerificationPurpose = (typeof emailVerificationCodes.purpose.enumValues)[number];

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function findTenantById(id: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return tenant ?? null;
}

/** Ends the "name your organization" step (the email address has to be confirmed by then): the organization is named and the terms are agreed to. */
export async function finishOrganizationSetup(userId: string) {
  const [row] = await db
    .update(users)
    .set({ organizationSetupPending: false, termsAcceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row!;
}

export async function updateTenantName(id: string, name: string) {
  const [row] = await db.update(tenants).set({ name, updatedAt: new Date() }).where(eq(tenants.id, id)).returning();
  return row ?? null;
}

export async function touchLastLogin(userId: string) {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export async function storeRefreshToken(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}) {
  await db.insert(refreshTokens).values(params);
}

export async function findActiveRefreshToken(tokenHash: string) {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function revokeRefreshToken(tokenHash: string) {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function revokeAllRefreshTokensForUser(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function storePasswordResetToken(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  await db.insert(passwordResetTokens).values(params);
}

export async function findActivePasswordResetToken(tokenHash: string) {
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function markPasswordResetTokenUsed(id: string) {
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
}

/** Sets a password the person chose themselves. This also ends any temporary-password state they were in. */
export async function updateUserPassword(userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash, mustChangePassword: false, tempPasswordExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

/** Gives an invited person a new temporary password (when they are first invited, or sent a new invitation). */
export async function setTemporaryPassword(userId: string, passwordHash: string, expiresAt: Date) {
  await db.update(users).set({ passwordHash, mustChangePassword: true, tempPasswordExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(users.id, userId));
}

/** The person accepted their invitation: their own password is set, and they have proved they own the email address. */
export async function completeInvitation(userId: string, passwordHash: string) {
  const [row] = await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, tempPasswordExpiresAt: null, emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row!;
}

export async function updateUserProfile(userId: string, values: { name?: string; avatarUrl?: string }) {
  const [row] = await db
    .update(users)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row!;
}

export async function findLatestVerificationCode(userId: string, purpose: VerificationPurpose) {
  const [row] = await db
    .select()
    .from(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.userId, userId), eq(emailVerificationCodes.purpose, purpose)))
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);
  return row ?? null;
}

/** Issuing a new code always invalidates any earlier unused code for the same purpose. */
export async function replaceVerificationCode(params: {
  userId: string;
  email: string;
  purpose: VerificationPurpose;
  codeHash: string;
  expiresAt: Date;
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(emailVerificationCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(emailVerificationCodes.userId, params.userId),
          eq(emailVerificationCodes.purpose, params.purpose),
          isNull(emailVerificationCodes.consumedAt),
        ),
      );
    await tx.insert(emailVerificationCodes).values(params);
  });
}

export async function findActiveVerificationCode(userId: string, purpose: VerificationPurpose) {
  const [row] = await db
    .select()
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.userId, userId),
        eq(emailVerificationCodes.purpose, purpose),
        isNull(emailVerificationCodes.consumedAt),
        gt(emailVerificationCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);
  return row ?? null;
}

export async function incrementVerificationAttempts(id: string, attempts: number) {
  await db.update(emailVerificationCodes).set({ attempts }).where(eq(emailVerificationCodes.id, id));
}

export async function consumeVerificationCode(id: string) {
  await db.update(emailVerificationCodes).set({ consumedAt: new Date() }).where(eq(emailVerificationCodes.id, id));
}

export async function markEmailVerified(userId: string) {
  const [row] = await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row!;
}

export async function updateUserEmail(userId: string, email: string) {
  const [row] = await db
    .update(users)
    .set({ email: email.toLowerCase(), emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row!;
}

export async function tenantSlugExists(slug: string): Promise<boolean> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return !!row;
}

export async function createTenantAndAdmin(params: {
  organizationName: string;
  slug: string;
  name: string;
  email: string;
  passwordHash: string;
  /** False for people invited by someone else, who haven't agreed to the terms yet. */
  termsAccepted?: boolean;
  /** Set for an invited person whose password is temporary: when it stops working. */
  temporaryPasswordExpiresAt?: Date;
  /** Signed up with Google: the address is already proven, and the organization still has to be named. */
  google?: boolean;
}) {
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: params.organizationName, slug: params.slug })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        name: params.name,
        email: params.email.toLowerCase(),
        passwordHash: params.passwordHash,
        role: "admin",
        tenantId: tenant!.id,
        termsAcceptedAt: params.termsAccepted === false ? null : new Date(),
        mustChangePassword: params.temporaryPasswordExpiresAt !== undefined,
        ...(params.google ? { termsAcceptedAt: null, organizationSetupPending: true } : {}),
        tempPasswordExpiresAt: params.temporaryPasswordExpiresAt ?? null,
      })
      .returning();

    await tx.update(tenants).set({ ownerUserId: user!.id }).where(eq(tenants.id, tenant!.id));

    return { user: user!, tenant: tenant! };
  });
}

/** Gives an existing person their own account space: they become its admin and keep any access they were given elsewhere. */
export async function moveUserToNewTenant(userId: string, params: { name: string; slug: string }) {
  return db.transaction(async (tx) => {
    const [tenant] = await tx.insert(tenants).values({ name: params.name, slug: params.slug, ownerUserId: userId }).returning();
    const [user] = await tx
      .update(users)
      .set({ tenantId: tenant!.id, role: "admin", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return { user: user!, tenant: tenant! };
  });
}

/** How many other people belong to this organization (their own space is shared with them). */
export async function countOtherMembers(tenantId: string, exceptUserId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.tenantId, tenantId), ne(users.id, exceptUserId)));
  return row?.n ?? 0;
}

/** Withdrawals still on their way (not finished, cancelled or rejected) for an organization. */
export async function countOpenPayouts(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payouts)
    .where(and(eq(payouts.tenantId, tenantId), notInArray(payouts.status, ["completed", "cancelled", "rejected", "failed"])));
  return row?.n ?? 0;
}

/** Removes the account for good. When it is the last person in their organization, the organization and everything in it goes too. */
export async function deleteUserAccount(userId: string, tenantIdToDelete: string | null) {
  await db.transaction(async (tx) => {
    // Everything that belongs to the organization (programs, polls, businesses, payments, ...) is removed by the database along with it.
    if (tenantIdToDelete) await tx.delete(tenants).where(eq(tenants.id, tenantIdToDelete));
    await tx.delete(users).where(eq(users.id, userId));
  });
}

/**
 * The organizations (other than their own space) a person belongs to: a team they were added to, access to something
 * inside one, or the organization they were originally invited into.
 */
export async function listOtherOrganizations(user: { id: string; tenantId: string | null; role: string }) {
  const ids = new Set<string>();
  const [teams, programRows, pollRows, businessRows] = await Promise.all([
    db.select({ id: tenantMembers.tenantId }).from(tenantMembers).where(eq(tenantMembers.userId, user.id)),
    db.select({ id: programs.tenantId }).from(programMembers).innerJoin(programs, eq(programs.id, programMembers.programId)).where(eq(programMembers.userId, user.id)),
    db.select({ id: polls.tenantId }).from(pollMembers).innerJoin(polls, eq(polls.id, pollMembers.pollId)).where(eq(pollMembers.userId, user.id)),
    db.select({ id: businesses.tenantId }).from(businessMembers).innerJoin(businesses, eq(businesses.id, businessMembers.businessId)).where(eq(businessMembers.userId, user.id)),
  ]);
  for (const row of [...teams, ...programRows, ...pollRows, ...businessRows]) ids.add(row.id);
  // Someone invited into an account without a space of their own lives inside that account.
  if (user.tenantId && user.role !== "admin" && user.role !== "super_admin") ids.add(user.tenantId);
  // A person's own space is not "another organization".
  if (user.tenantId && user.role === "admin") ids.delete(user.tenantId);
  if (ids.size === 0) return [];
  const rows = await db.select({ id: tenants.id, name: tenants.name, ownerUserId: tenants.ownerUserId }).from(tenants).where(inArray(tenants.id, [...ids]));
  return rows.filter((t) => t.ownerUserId !== user.id).map((t) => ({ id: t.id, name: t.name }));
}

/** Payments, withdrawals and ledger entries are financial records that must be kept, so an organization that has any cannot be deleted. */
export async function hasFinancialRecords(tenantId: string): Promise<boolean> {
  const [p, w, o] = await Promise.all([
    db.select({ id: payments.id }).from(payments).where(eq(payments.tenantId, tenantId)).limit(1),
    db.select({ id: walletEntries.id }).from(walletEntries).where(eq(walletEntries.tenantId, tenantId)).limit(1),
    db.select({ id: payouts.id }).from(payouts).where(eq(payouts.tenantId, tenantId)).limit(1),
  ]);
  return p.length + w.length + o.length > 0;
}
