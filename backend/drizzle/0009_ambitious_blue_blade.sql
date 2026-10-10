CREATE TYPE "public"."support_message_kind" AS ENUM('feedback', 'contact', 'report');--> statement-breakpoint
CREATE TYPE "public"."support_message_status" AS ENUM('new', 'read', 'resolved');--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "support_message_kind" NOT NULL,
	"status" "support_message_status" DEFAULT 'new' NOT NULL,
	"category" text,
	"subject" text,
	"message" text NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"link" text,
	"user_id" uuid,
	"tenant_id" uuid,
	"program_id" uuid,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "one_registration_per_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "document_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_messages_kind_created_idx" ON "support_messages" USING btree ("kind","created_at");--> statement-breakpoint
-- Keep only the first scan of each ID card and ticket before making that a rule.
DELETE FROM "document_verifications" AS later USING "document_verifications" AS earlier
WHERE later."registration_id" = earlier."registration_id"
  AND later."document_type" = earlier."document_type"
  AND (later."created_at" > earlier."created_at" OR (later."created_at" = earlier."created_at" AND later."id" > earlier."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "document_verifications_registration_document_unique" ON "document_verifications" USING btree ("registration_id","document_type");