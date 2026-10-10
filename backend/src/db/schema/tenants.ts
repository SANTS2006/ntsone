import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    // No FK constraint to users.id here (would create a circular schema-file
    // import with users.ts -> tenants.ts); enforced at the application layer only.
    ownerUserId: uuid("owner_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tenants_owner_user_id_idx").on(table.ownerUserId)],
);
