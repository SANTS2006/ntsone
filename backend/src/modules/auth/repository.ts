import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { emailVerificationCodes, passwordResetTokens, refreshTokens, tenants, users } from "../../db/schema/index.js";

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

export async function updateUserPassword(userId: string, passwordHash: string) {
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
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
