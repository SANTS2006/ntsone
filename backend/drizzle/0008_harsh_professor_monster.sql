CREATE TYPE "public"."verification_document" AS ENUM('id_card', 'ticket', 'link');--> statement-breakpoint
CREATE TABLE "document_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"document_type" "verification_document" NOT NULL,
	"valid" boolean NOT NULL,
	"registration_status" "registration_status" NOT NULL,
	"verified_by" uuid,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_verifications" ADD CONSTRAINT "document_verifications_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_verifications" ADD CONSTRAINT "document_verifications_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_verifications" ADD CONSTRAINT "document_verifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_verifications_program_created_idx" ON "document_verifications" USING btree ("program_id","created_at");--> statement-breakpoint
CREATE INDEX "document_verifications_registration_idx" ON "document_verifications" USING btree ("registration_id");