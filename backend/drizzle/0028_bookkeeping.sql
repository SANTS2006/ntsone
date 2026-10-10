CREATE TABLE "book_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entry_date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"category" text,
	"description" text,
	"party_name" text,
	"party_phone" text,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"reference" text,
	"loan_id" uuid,
	"voice_note_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_entry_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"note" text,
	"voided_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"party_name" text NOT NULL,
	"party_phone" text,
	"principal_minor" bigint NOT NULL,
	"interest_percent" numeric(6, 2) DEFAULT '0' NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date,
	"purpose" text,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_voice_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"audio_url" text NOT NULL,
	"mime_type" text,
	"duration_seconds" integer,
	"caption" text,
	"transcript" text,
	"status" text DEFAULT 'new' NOT NULL,
	"entry_id" uuid,
	"voided_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_entries" ADD CONSTRAINT "book_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_entries" ADD CONSTRAINT "book_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_entries" ADD CONSTRAINT "book_entries_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_entries" ADD CONSTRAINT "book_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_entries" ADD CONSTRAINT "book_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_entry_payments" ADD CONSTRAINT "book_entry_payments_entry_id_book_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."book_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_entry_payments" ADD CONSTRAINT "book_entry_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_entry_payments" ADD CONSTRAINT "book_entry_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_voice_notes" ADD CONSTRAINT "book_voice_notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_voice_notes" ADD CONSTRAINT "book_voice_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_voice_notes" ADD CONSTRAINT "book_voice_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "book_entries_business_date_idx" ON "book_entries" USING btree ("business_id","entry_date");--> statement-breakpoint
CREATE INDEX "book_entries_business_kind_idx" ON "book_entries" USING btree ("business_id","kind");--> statement-breakpoint
CREATE INDEX "book_entries_loan_idx" ON "book_entries" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "book_entries_party_idx" ON "book_entries" USING btree ("business_id","party_name");--> statement-breakpoint
CREATE INDEX "book_entry_payments_entry_idx" ON "book_entry_payments" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "book_entry_payments_business_date_idx" ON "book_entry_payments" USING btree ("business_id","paid_on");--> statement-breakpoint
CREATE INDEX "book_loans_business_idx" ON "book_loans" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "book_loans_due_idx" ON "book_loans" USING btree ("business_id","due_on");--> statement-breakpoint
CREATE INDEX "book_voice_notes_business_idx" ON "book_voice_notes" USING btree ("business_id","created_at");
--> statement-breakpoint
-- The books can't hold nonsense, whatever the application does: positive amounts, paid never more than the total, known kinds.
ALTER TABLE "book_entries" ADD CONSTRAINT "book_entries_amount_check" CHECK ("amount_minor" > 0 AND "paid_minor" >= 0 AND "paid_minor" <= "amount_minor");--> statement-breakpoint
ALTER TABLE "book_entries" ADD CONSTRAINT "book_entries_kind_check" CHECK ("kind" IN ('sale','other_income','purchase','expense','loan_in','loan_out','loan_repayment_in','loan_repayment_out','owner_in','owner_out'));--> statement-breakpoint
ALTER TABLE "book_entry_payments" ADD CONSTRAINT "book_entry_payments_amount_check" CHECK ("amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_check" CHECK ("principal_minor" > 0 AND "direction" IN ('lent','borrowed') AND "status" IN ('open','paid','written_off','cancelled') AND "interest_percent" >= 0);--> statement-breakpoint
ALTER TABLE "book_voice_notes" ADD CONSTRAINT "book_voice_notes_status_check" CHECK ("status" IN ('new','done'));
