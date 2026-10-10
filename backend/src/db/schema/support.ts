import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { supportMessageKindEnum, supportMessageStatusEnum } from "./enums";
import { programs } from "./programs";
import { tenants } from "./tenants";
import { users } from "./users";

/** Feedback from signed-in users, website contact messages, and reports, for the super admin's inbox. */
export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: supportMessageKindEnum("kind").notNull(),
    status: supportMessageStatusEnum("status").notNull().default("new"),
    // Feedback: improvement, bug, or feature. Reports: abuse, fraud, privacy, and so on.
    category: text("category"),
    subject: text("subject"),
    message: text("message").notNull(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    link: text("link"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "set null" }),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("support_messages_kind_created_idx").on(table.kind, table.createdAt)],
);
