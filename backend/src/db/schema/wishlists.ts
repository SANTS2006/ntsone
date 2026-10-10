import { bigint, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// The Wish List module: personal lists of things a person wants to buy or have. When an item is gotten it moves to the
// "gotten" list with the price actually paid and the date. Money is whole minor units (cents), never decimals.
// Nothing is ever really deleted: removed items and lists are kept (hidden), and every change is written to wish_events.
const money = (name: string) => bigint(name, { mode: "number" });

/** One list ("Home", "Wedding", "Shop equipment"...). Private to the person who owns it. */
export const wishlists = pgTable(
  "wishlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The owner's account (empty for the platform super admin). Kept for reporting; access is by owner only.
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // An optional spending limit for the whole list.
    budgetMinor: money("budget_minor"),
    targetDate: date("target_date", { mode: "string" }),
    // One of a few named colours the screens understand.
    color: text("color").notNull().default("blue"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("wishlists_owner_idx").on(table.ownerId, table.deletedAt, table.createdAt)],
);

/** One thing on a list: wished for, then gotten. */
export const wishItems = pgTable(
  "wish_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // How many are wanted (1 when not given).
    quantity: integer("quantity").notNull().default(1),
    // The price expected for ONE, if known.
    unitPriceMinor: money("unit_price_minor"),
    // low, medium, high
    priority: text("priority").notNull().default("medium"),
    category: text("category"),
    notes: text("notes"),
    link: text("link"),
    // wished -> gotten (and back, which is recorded)
    status: text("status").notNull().default("wished"),
    // What was actually paid IN TOTAL for the item (all the quantity), the date it was gotten, and where.
    paidMinor: money("paid_minor"),
    gottenAt: date("gotten_at", { mode: "string" }),
    store: text("store"),
    gottenNote: text("gotten_note"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wish_items_list_idx").on(table.wishlistId, table.status, table.removedAt),
    index("wish_items_gotten_idx").on(table.wishlistId, table.gottenAt),
    index("wish_items_owner_idx").on(table.ownerId),
  ],
);

/** The record of everything that happened to a list and its items: who, what, when, and the details that changed. */
export const wishEvents = pgTable(
  "wish_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    itemId: uuid("item_id"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    // Set instead of actor_id when someone with a shared link did it: the name the owner gave them, and which invitation.
    actorLabel: text("actor_label"),
    shareId: uuid("share_id"),
    // list_created, list_updated, list_archived, list_restored, list_removed, item_added, item_updated, item_gotten, item_ungotten, item_removed, item_restored
    type: text("type").notNull(),
    // The item's name at the time, so the record still reads well if the item is later renamed.
    itemName: text("item_name"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("wish_events_list_idx").on(table.wishlistId, table.createdAt)],
);

/**
 * An invitation to one wish list for a person who has no account: a private link (and QR code) with read-only or
 * read-write access. The link itself is not stored. It is worked out from the invitation id and `rotation` with a server
 * secret, so a database leak does not expose any link, and "reset the link" just raises `rotation`.
 */
export const wishlistShares = pgTable(
  "wishlist_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    // Who it is for, as the owner calls them ("Mama", "Fatmata"). Shown in the activity record.
    label: text("label").notNull(),
    email: text("email"),
    // read: view only. write: add, change, mark gotten and remove items.
    level: text("level").notNull().default("read"),
    rotation: integer("rotation").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    accessCount: integer("access_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("wishlist_shares_list_idx").on(table.wishlistId, table.revokedAt)],
);
