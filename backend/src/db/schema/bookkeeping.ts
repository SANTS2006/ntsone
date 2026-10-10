import { bigint, date, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { tenants } from "./tenants";
import { users } from "./users";

// Bookkeeping for a business: a cash book (sales, purchases, expenses, loans, the owner's own money), credit that is
// owed in either direction, loans, and voice notes people record to be turned into entries later.
// All money is whole minor units (cents) in the business's own currency, never decimals. Nothing is ever deleted:
// a wrong entry is voided with a reason and stays in the books.
const money = (name: string) => bigint(name, { mode: "number" });

/** One line in the cash book. */
export const bookEntries = pgTable(
  "book_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    // Kept with the entry so it can be filtered and audited without a join.
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // sale, other_income, purchase, expense, loan_in, loan_out, loan_repayment_in, loan_repayment_out, owner_in, owner_out
    kind: text("kind").notNull(),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    amountMinor: money("amount_minor").notNull(),
    // How much of it has actually been paid so far (the rest is credit: owed to the business, or by it).
    paidMinor: money("paid_minor").notNull().default(0),
    category: text("category"),
    description: text("description"),
    // The customer, supplier or other person this is with.
    partyName: text("party_name"),
    partyPhone: text("party_phone"),
    // cash, mobile_money, bank or other.
    paymentMethod: text("payment_method").notNull().default("cash"),
    reference: text("reference"),
    // The loan a loan entry or repayment belongs to.
    loanId: uuid("loan_id"),
    // The voice note this entry was made from.
    voiceNoteId: uuid("voice_note_id"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("book_entries_business_date_idx").on(table.businessId, table.entryDate),
    index("book_entries_business_kind_idx").on(table.businessId, table.kind),
    index("book_entries_loan_idx").on(table.loanId),
    index("book_entries_party_idx").on(table.businessId, table.partyName),
  ],
);

/** Money that actually moved: when something was paid, in part or in full, and how. The cash flow is built from these. */
export const bookEntryPayments = pgTable(
  "book_entry_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => bookEntries.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    amountMinor: money("amount_minor").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    method: text("method").notNull().default("cash"),
    note: text("note"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("book_entry_payments_entry_idx").on(table.entryId), index("book_entry_payments_business_date_idx").on(table.businessId, table.paidOn)],
);

/** Money lent to someone, or borrowed from someone, and what is still to be paid back. */
export const bookLoans = pgTable(
  "book_loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // lent: the business gave the money. borrowed: the business received it.
    direction: text("direction").notNull(),
    partyName: text("party_name").notNull(),
    partyPhone: text("party_phone"),
    principalMinor: money("principal_minor").notNull(),
    // A flat extra amount charged on top, as a percentage of the principal (not per month).
    interestPercent: numeric("interest_percent", { precision: 6, scale: 2 }).notNull().default("0"),
    issuedOn: date("issued_on", { mode: "string" }).notNull(),
    dueOn: date("due_on", { mode: "string" }),
    purpose: text("purpose"),
    // open, paid, written_off, cancelled
    status: text("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("book_loans_business_idx").on(table.businessId, table.status), index("book_loans_due_idx").on(table.businessId, table.dueOn)],
);

/** A short voice recording kept as a record, for people who would rather speak than write. It can become an entry later. */
export const bookVoiceNotes = pgTable(
  "book_voice_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    audioUrl: text("audio_url").notNull(),
    mimeType: text("mime_type"),
    durationSeconds: integer("duration_seconds"),
    // What the person typed about it, and (when the phone could work it out) the words that were spoken.
    caption: text("caption"),
    transcript: text("transcript"),
    // new: not yet written into the books. done: turned into an entry (or marked as dealt with).
    status: text("status").notNull().default("new"),
    entryId: uuid("entry_id"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("book_voice_notes_business_idx").on(table.businessId, table.createdAt)],
);
