import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { verificationDocumentEnum } from "./enums";
import { programs } from "./programs";
import { registrations } from "./registrations";
import { users } from "./users";

/** One scan of a registration's ID card or ticket QR code, and what the check found. */
export const documentVerifications = pgTable(
  "document_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    documentType: verificationDocumentEnum("document_type").notNull(),
    valid: boolean("valid").notNull(),
    // The registration's status at the moment it was scanned.
    registrationStatus: text("registration_status").notNull(),
    // Set when a signed-in team member of the program did the scan.
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("document_verifications_program_created_idx").on(table.programId, table.createdAt),
    index("document_verifications_registration_idx").on(table.registrationId),
    // Each ID card and each ticket is logged once: its first successful scan.
    uniqueIndex("document_verifications_registration_document_unique").on(table.registrationId, table.documentType),
  ],
);
