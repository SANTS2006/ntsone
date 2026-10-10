import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Everything that happens in the system, once, and never changed or removed (the database refuses both).
 * A row is either a request someone made ("request") or a named event the code recorded ("event").
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    // The account the activity belongs to (whose program, poll, business or team it touched). No foreign key: the
    // record outlives the account.
    tenantId: uuid("tenant_id"),
    // user (signed-in staff), visitor (someone using a public page), voter, or system (background work, Monime).
    actorType: text("actor_type").notNull().default("user"),
    // Who it was at the time, kept on the row so the record still reads well after an account changes or goes.
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    // The action in plain words, e.g. "Published the registration form".
    label: text("label"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    entityLabel: text("entity_label"),
    // success, failed (the system refused or errored), or denied (not signed in / not allowed).
    outcome: text("outcome").notNull().default("success"),
    source: text("source").notNull().default("event"),
    method: text("method"),
    path: text("path"),
    statusCode: integer("status_code"),
    requestId: text("request_id"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorUserId),
    // The audit log page lists newest first.
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    // One account's activity, newest first.
    index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("audit_logs_request_idx").on(table.requestId),
  ],
);
