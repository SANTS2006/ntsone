CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint,
	"checksum_sha256" text,
	"encrypted" boolean DEFAULT true NOT NULL,
	"schema_fingerprint" text,
	"table_counts" jsonb,
	"row_total" bigint,
	"created_by" uuid,
	"created_by_name" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"last_restored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "restores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backup_id" uuid NOT NULL,
	"safety_backup_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"requested_by_name" text,
	"request_id" text,
	"error" text,
	"table_counts" jsonb,
	"rolled_back" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restores" ADD CONSTRAINT "restores_backup_id_backups_id_fk" FOREIGN KEY ("backup_id") REFERENCES "public"."backups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restores" ADD CONSTRAINT "restores_safety_backup_id_backups_id_fk" FOREIGN KEY ("safety_backup_id") REFERENCES "public"."backups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restores" ADD CONSTRAINT "restores_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backups_started_idx" ON "backups" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "backups_type_status_idx" ON "backups" USING btree ("type","status","started_at");--> statement-breakpoint
CREATE INDEX "restores_created_idx" ON "restores" USING btree ("created_at");--> statement-breakpoint
-- Only one backup can be running at any moment, and only one restore can be active: enforced by the database, so two
-- server instances can never both start one.
CREATE UNIQUE INDEX IF NOT EXISTS "backups_one_running" ON "backups" ((true)) WHERE "status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "restores_one_active" ON "restores" ((true)) WHERE "status" NOT IN ('completed', 'failed');--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_type_check" CHECK ("type" IN ('automatic', 'manual', 'pre_restore'));--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_status_check" CHECK ("status" IN ('running', 'completed', 'failed', 'deleted'));--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_verification_check" CHECK ("verification_status" IN ('pending', 'valid', 'invalid'));--> statement-breakpoint
ALTER TABLE "restores" ADD CONSTRAINT "restores_status_check" CHECK ("status" IN ('pending', 'preparing', 'backing_up_current_database', 'restoring', 'verifying', 'completed', 'failed'));
