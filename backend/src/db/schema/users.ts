import { pgTable, uuid, text, timestamp, index, integer, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { emailVerificationPurposeEnum, userRoleEnum, userStatusEnum } from "./enums";
import { tenants } from "./tenants";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("viewer"),
    status: userStatusEnum("status").notNull().default("active"),
    // Null only for the platform super_admin; every tenant-scoped user (admin,
    // program_admin, viewer) always belongs to exactly one tenant.
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // When the account owner agreed to the Terms of Service and Privacy Policy at sign-up.
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [index("users_role_idx").on(table.role), index("users_tenant_id_idx").on(table.tenantId)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Every refresh looks the token up by its hash.
  (table) => [index("refresh_tokens_user_id_idx").on(table.userId), uniqueIndex("refresh_tokens_token_hash_idx").on(table.tokenHash)],
);

// One-time codes emailed to prove ownership of an address. `email` is the
// address the code was sent to -- for an email change that's the NEW address,
// which is only written to users.email once the code is confirmed.
export const emailVerificationCodes = pgTable(
  "email_verification_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    purpose: emailVerificationPurposeEnum("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("email_verification_codes_user_id_idx").on(table.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_reset_tokens_user_id_idx").on(table.userId), uniqueIndex("password_reset_tokens_token_hash_idx").on(table.tokenHash)],
);

/**
 * People on an account's team who have a space of their own (so their account isn't inside this
 * one). It's what lists them under Users with the role they were invited into; what they can
 * actually open is still decided by their access to each program, poll, or business.
 */
export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "program_admin" or "viewer", as on the Users page.
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("tenant_members_tenant_user_unique").on(table.tenantId, table.userId), index("tenant_members_user_id_idx").on(table.userId)],
);
