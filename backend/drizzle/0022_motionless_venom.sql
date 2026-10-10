ALTER TABLE "forms" ADD COLUMN "review_confirm_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "review_confirm_text" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "review_confirm_conditions" jsonb;