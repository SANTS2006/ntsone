ALTER TABLE "programs" ADD COLUMN "ticket_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "ticket_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "registration_number_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "show_registration_number" boolean DEFAULT true NOT NULL;