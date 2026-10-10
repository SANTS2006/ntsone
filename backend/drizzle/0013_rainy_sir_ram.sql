ALTER TABLE "registration_status_history" ALTER COLUMN "from_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "registration_status_history" ALTER COLUMN "to_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "registrations" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "document_verifications" ALTER COLUMN "registration_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "status_config" jsonb DEFAULT '{}'::jsonb NOT NULL;