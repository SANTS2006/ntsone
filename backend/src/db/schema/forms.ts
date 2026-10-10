import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { formStatusEnum, fieldTypeEnum, formLayoutModeEnum } from "./enums";
import { programs } from "./programs";

export const forms = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    instructions: text("instructions"),
    confirmationMessage: text("confirmation_message"),
    requireConsent: boolean("require_consent").notNull().default(false),
    consentText: text("consent_text"),
    // The consent is only asked when these rules match the answers (shown just before submitting).
    consentConditions: jsonb("consent_conditions"),
    showRegistrationNumber: boolean("show_registration_number").notNull().default(true),
    // The registration number is only shown on the success page when these rules match the answers.
    registrationNumberConditions: jsonb("registration_number_conditions"),
    // The "I have gone through the entire form" checkbox before submitting: on or off, its wording, and when it shows.
    reviewConfirmEnabled: boolean("review_confirm_enabled").notNull().default(true),
    reviewConfirmText: text("review_confirm_text"),
    reviewConfirmConditions: jsonb("review_confirm_conditions"),
    layoutMode: formLayoutModeEnum("layout_mode").notNull().default("stepped"),
    // The goods an order form sells: [{ id, name, description, priceMinor, imageUrl, maxQuantity }].
    orderItems: jsonb("order_items").notNull().default([]),
    status: formStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("forms_program_version_unique").on(table.programId, table.version),
    uniqueIndex("forms_one_published_per_program_idx")
      .on(table.programId)
      .where(sql`${table.status} = 'published'`),
  ],
);

export const formSections = pgTable(
  "form_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    // Show this section only when these rules match (same shape as a field's conditional logic).
    conditionalLogic: jsonb("conditional_logic"),
  },
  (table) => [index("form_sections_form_id_idx").on(table.formId)],
);

export const formFields = pgTable(
  "form_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => formSections.id, { onDelete: "set null" }),
    fieldKey: text("field_key").notNull(),
    type: fieldTypeEnum("type").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    placeholder: text("placeholder"),
    helpText: text("help_text"),
    required: boolean("required").notNull().default(false),
    orderIndex: integer("order_index").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    conditionalLogic: jsonb("conditional_logic"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("form_fields_form_key_unique").on(table.formId, table.fieldKey),
    index("form_fields_form_id_idx").on(table.formId),
  ],
);
