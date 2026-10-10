import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { businessDocumentKindEnum, programRoleEnum } from "./enums";
import { tenants } from "./tenants";
import { users } from "./users";

/** A business with its own order form, invoices, and receipts. */
export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    logoUrl: text("logo_url"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    website: text("website"),
    taxNumber: text("tax_number"),
    // Prices are in Leones unless a business says otherwise.
    currency: text("currency").notNull().default("SLE"),
    brandColor: text("brand_color").notNull().default("#2563eb"),
    // How invoices and receipts look and what they ask for (see modules/businesses/documentSettings).
    invoiceSettings: jsonb("invoice_settings").notNull().default({}),
    receiptSettings: jsonb("receipt_settings").notNull().default({}),
    quotationSettings: jsonb("quotation_settings").notNull().default({}),
    // Each business's own order, invoice and receipt statuses: { order?: [{key,label,color}], invoice?, receipt? }.
    statusConfig: jsonb("status_config").notNull().default({}),
    // Emails the customer each time their order's status changes.
    notifyCustomerOnStatus: boolean("notify_customer_on_status").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("businesses_tenant_id_idx").on(table.tenantId)],
);

export const businessMembers = pgTable(
  "business_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    roleOnBusiness: programRoleEnum("role_on_business").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("business_members_user_business_unique").on(table.userId, table.businessId),
    index("business_members_business_id_idx").on(table.businessId),
  ],
);

/** An invoice or a receipt. Line items and custom fields are kept with the document. */
export const businessDocuments = pgTable(
  "business_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    kind: businessDocumentKindEnum("kind").notNull(),
    // 1, 2, 3... per business and kind; shown as e.g. INV-0001.
    sequence: integer("sequence").notNull(),
    number: text("number").notNull(),
    // Invoice: draft, sent, paid, partially_paid, cancelled. Receipt: issued, sent, void.
    status: text("status").notNull(),
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email"),
    clientPhone: text("client_phone"),
    clientAddress: text("client_address"),
    issueDate: timestamp("issue_date", { withTimezone: true }).notNull(),
    // Invoices: when payment is due. Receipts: when payment was received.
    dueDate: timestamp("due_date", { withTimezone: true }),
    paymentMethod: text("payment_method"),
    currency: text("currency").notNull().default("SLE"),
    // [{ description, quantity, unitPrice }]
    items: jsonb("items").notNull().default([]),
    discount: numeric("discount", { precision: 14, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 6, scale: 3 }).notNull().default("0"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    terms: text("terms"),
    // Answers to the business's own extra fields, keyed by field key.
    customFields: jsonb("custom_fields").notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    // Set when the document is changed after it was first saved; it then prints as "Updated".
    editedAt: timestamp("edited_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastSentTo: text("last_sent_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("business_documents_business_kind_sequence_unique").on(table.businessId, table.kind, table.sequence),
    index("business_documents_business_kind_idx").on(table.businessId, table.kind, table.createdAt),
  ],
);

/** A business card (front and back) for a person at a business, in one of the card layouts. */
export const businessCards = pgTable(
  "business_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    jobTitle: text("job_title"),
    // Shown on the card; defaults to the business's name.
    company: text("company").notNull(),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    address: text("address"),
    tagline: text("tagline"),
    photoUrl: text("photo_url"),
    template: text("template").notNull().default("split"),
    primaryColor: text("primary_color").notNull().default("#1d4ed8"),
    secondaryColor: text("secondary_color").notNull().default("#f59e0b"),
    // Puts a QR code of the website on the card (layouts that have room for one).
    showQr: boolean("show_qr").notNull().default(true),
    lastSentTo: text("last_sent_to"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("business_cards_business_idx").on(table.businessId, table.createdAt)],
);
