import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

/**
 * Emails waiting to be sent. A notification is saved here in the same breath as the work that
 * caused it and sent by a background worker, so a mail-provider outage delays it instead of losing it.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The email as SendEmailInput (no attachments).
    payload: jsonb("payload").notNull(),
    // pending -> sent, or failed once every attempt has been used.
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [index("email_outbox_due_idx").on(table.status, table.nextAttemptAt)],
);

/**
 * One row per submission attempt a browser tags with an Idempotency-Key, so a retry after a dropped
 * connection (or a double click) returns the first result instead of creating a second record.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    // Null while the first request is still being processed.
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("idempotency_keys_scope_key_unique").on(table.scope, table.key), index("idempotency_keys_created_idx").on(table.createdAt)],
);

/** Platform-wide settings the super admin can change while the system runs (for example maintenance mode). One row per key. */
export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
