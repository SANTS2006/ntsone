import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "program_admin", "viewer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const programRoleEnum = pgEnum("program_role", ["admin", "viewer"]);
export const emailVerificationPurposeEnum = pgEnum("email_verification_purpose", ["signup", "email_change"]);

export const programStatusEnum = pgEnum("program_status", [
  "draft",
  "published",
  "closed",
  "archived",
]);

export const formStatusEnum = pgEnum("form_status", ["draft", "published", "archived"]);
export const formLayoutModeEnum = pgEnum("form_layout_mode", ["stepped", "single"]);

export const fieldTypeEnum = pgEnum("field_type", [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "date",
  "time",
  "datetime",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "yes_no",
  "image_upload",
  "pdf_upload",
  "document_upload",
  "address",
  "country",
  "gender",
  "date_of_birth",
  "url",
  "currency",
  "rating",
  "consent",
]);

export const registrationStatusEnum = pgEnum("registration_status", [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "waitlisted",
  "cancelled",
  // Order statuses, used by business order forms.
  "confirmed",
  "processing",
  "ready",
  "delivered",
  "completed",
]);

// Which document's QR code was scanned; "link" covers codes issued before this was recorded.
export const verificationDocumentEnum = pgEnum("verification_document", ["id_card", "ticket", "link"]);

export const supportMessageKindEnum = pgEnum("support_message_kind", ["feedback", "contact", "report"]);
export const supportMessageStatusEnum = pgEnum("support_message_status", ["new", "read", "resolved"]);

export const pollStatusEnum = pgEnum("poll_status", ["draft", "open", "closed"]);

// A program is a registration program; an order form is a business's order page built on the same form tools.
export const programKindEnum = pgEnum("program_kind", ["program", "order_form"]);
export const businessDocumentKindEnum = pgEnum("business_document_kind", ["invoice", "receipt", "quotation"]);
