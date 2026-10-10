ALTER TABLE "audit_logs" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_type" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_email" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "entity_label" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "outcome" text DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "source" text DEFAULT 'event' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "status_code" integer;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "user_agent" text;--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_request_idx" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
-- Fill in the account and who-it-was for the entries recorded before these columns existed.
UPDATE "audit_logs" a SET "actor_type" = 'user', "actor_name" = u."name", "actor_email" = u."email", "actor_role" = u."role"::text, "tenant_id" = u."tenant_id" FROM "users" u WHERE a."actor_user_id" = u."id";--> statement-breakpoint
UPDATE "audit_logs" SET "actor_type" = 'system' WHERE "actor_user_id" IS NULL;--> statement-breakpoint
UPDATE "audit_logs" a SET "tenant_id" = p."tenant_id" FROM "programs" p WHERE a."tenant_id" IS NULL AND a."entity_type" = 'program' AND a."entity_id" = p."id"::text;--> statement-breakpoint
-- From here on the log can only grow: rows can't be edited or deleted. (The one allowed change is the database clearing
-- actor_user_id when that user is deleted, which keeps the name and email that were saved on the row.)
CREATE OR REPLACE FUNCTION audit_logs_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit logs cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.actor_user_id IS NULL AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit logs cannot be changed';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_no_change ON "audit_logs";--> statement-breakpoint
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION audit_logs_guard();
