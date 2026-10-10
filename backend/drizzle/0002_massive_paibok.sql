CREATE TYPE "public"."form_layout_mode" AS ENUM('stepped', 'single');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "require_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "consent_text" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "layout_mode" "form_layout_mode" DEFAULT 'stepped' NOT NULL;