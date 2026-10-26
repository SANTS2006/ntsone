import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// The Contributions module: money collected from many people for a purpose. A contribution is either one-time (a table of
// rows, each with the person's details and an amount) or recurring (contributors who pay month after month, tracked by
// month and year). Money the keeper takes out is recorded too. Money is whole minor units (cents), never decimals.
// Rows are never really deleted (they are hidden), and every change is written to contribution_events.
const money = (name: string) => bigint(name, { mode: "number" });

export const contributions = pgTable(
  "contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    // one_time or recurring
    kind: text("kind").notNull(),
    // Recurring only: the first month contributions are expected, and (optionally) what each person should pay each month.
    startYear: integer("start_year"),
    startMonth: integer("start_month"),
    expectedMonthlyMinor: money("expected_monthly_minor"),
    // active or closed
    status: text("status").notNull().default("active"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contributions_owner_idx").on(table.ownerId, table.deletedAt, table.createdAt)],
);

/** A column the owner chose for the table (name, gender, phone...). The amount column is always there and is not a field. */
export const contributionFields = pgTable(
  "contribution_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contribution_fields_contribution_idx").on(table.contributionId, table.orderIndex)],
);

/**
 * One row of the table. For a one-time contribution it is a person who gave an amount; for a recurring one it is a
 * contributor (their monthly payments are in contribution_payments). `values` maps a field id to what was typed.
 */
export const contributionRecords = pgTable(
  "contribution_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    values: jsonb("values").$type<Record<string, string>>().notNull().default({}),
    // One-time only.
    amountMinor: money("amount_minor"),
    // Recurring only: the first month this person is expected to pay (so months before they joined are not "unpaid").
    startYear: integer("start_year"),
    startMonth: integer("start_month"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // When the row was entered, and when it was last changed.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contribution_records_contribution_idx").on(table.contributionId, table.deletedAt, table.createdAt)],
);

/** What one contributor paid for one month of a recurring contribution. */
export const contributionPayments = pgTable(
  "contribution_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => contributionRecords.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    amountMinor: money("amount_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("contribution_payments_month_idx").on(table.recordId, table.year, table.month),
    index("contribution_payments_contribution_idx").on(table.contributionId, table.year, table.month),
  ],
);

/** Money the keeper took out of a contribution, with a note saying why. */
export const contributionWithdrawals = pgTable(
  "contribution_withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    amountMinor: money("amount_minor").notNull(),
    note: text("note").notNull(),
    // When the money was taken (the keeper can set it); createdAt/updatedAt say when it was written down.
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contribution_withdrawals_contribution_idx").on(table.contributionId, table.deletedAt, table.takenAt)],
);

/** Every change, with what it was before and after, so the history can always be shown. */
export const contributionEvents = pgTable(
  "contribution_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributionId: uuid("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contribution_events_contribution_idx").on(table.contributionId, table.createdAt)],
);
