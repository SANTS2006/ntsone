import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";
import { programKindEnum, programStatusEnum, programRoleEnum } from "./enums";
import { businesses } from "./businesses";
import { users } from "./users";
import { tenants } from "./tenants";

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    shortDescription: text("short_description"),
    thumbnailUrl: text("thumbnail_url"),
    status: programStatusEnum("status").notNull().default("draft"),
    // "order_form" programs are a business's order page and are listed under that business only.
    kind: programKindEnum("kind").notNull().default("program"),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    registrationStartDate: timestamp("registration_start_date", { withTimezone: true }),
    registrationEndDate: timestamp("registration_end_date", { withTimezone: true }),
    registrationEnabled: boolean("registration_enabled").notNull().default(false),
    idCardEnabled: boolean("id_card_enabled").notNull().default(false),
    idCardConfig: jsonb("id_card_config").notNull().default({}),
    ticketEnabled: boolean("ticket_enabled").notNull().default(false),
    ticketConfig: jsonb("ticket_config").notNull().default({}),
    // When on, each email address can submit only one registration to this program.
    oneRegistrationPerEmail: boolean("one_registration_per_email").notNull().default(false),
    // Emails the program's team about each new registration and each first ID card/ticket check-in.
    notifyOnRegistration: boolean("notify_on_registration").notNull().default(true),
    // When on, the success page lets registrants preview, print, and download their own answers.
    allowSubmissionCopy: boolean("allow_submission_copy").notNull().default(true),
    notifyOnVerification: boolean("notify_on_verification").notNull().default(true),
    // { prefix, includeYear, digits, startAt } -- empty means the default REG-{YEAR}-{000001} format.
    registrationNumberConfig: jsonb("registration_number_config").notNull().default({}),
    // Payments for this program: { enabled, registrationFeeMinor, idCardPriceMinor, ticketPriceMinor }.
    paymentConfig: jsonb("payment_config").notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("programs_status_idx").on(table.status),
    index("programs_deleted_at_idx").on(table.deletedAt),
    index("programs_tenant_id_idx").on(table.tenantId),
    index("programs_business_id_idx").on(table.businessId),
  ],
);

export const programMembers = pgTable(
  "program_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    roleOnProgram: programRoleEnum("role_on_program").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("program_members_user_program_unique").on(table.userId, table.programId),
    index("program_members_program_id_idx").on(table.programId),
  ],
);

export const programCounters = pgTable(
  "program_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    nextValue: integer("next_value").notNull().default(1),
  },
  (table) => [unique("program_counters_program_year_unique").on(table.programId, table.year)],
);
