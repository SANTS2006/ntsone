import { pgTable, uuid, text, timestamp, index, integer, numeric, boolean } from "drizzle-orm/pg-core";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    // No FK constraint to users.id here (would create a circular schema-file
    // import with users.ts -> tenants.ts); enforced at the application layer only.
    ownerUserId: uuid("owner_user_id"),
    // Payment terms the platform sets for this organization. Empty: the platform-wide default applies.
    feePercent: numeric("fee_percent", { precision: 5, scale: 2 }),
    feeFixedMinor: integer("fee_fixed_minor"),
    // Minutes money is held after a payment before it can be withdrawn.
    holdMinutes: integer("hold_minutes"),
    // Withdrawals are off until this moment (empty: already on).
    withdrawalsActiveFrom: timestamp("withdrawals_active_from", { withTimezone: true }),
    // The organization's own choice: each payment is sent to this withdrawal account the moment it succeeds, with no hold.
    // Card payments on the hosted checkout: empty follows the platform default (MONIME_ALLOW_CARDS), true/false is the platform's choice for this organization.
    allowCards: boolean("allow_cards"),
    autoWithdraw: boolean("auto_withdraw").notNull().default(false),
    autoWithdrawAccountId: uuid("auto_withdraw_account_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tenants_owner_user_id_idx").on(table.ownerUserId)],
);
