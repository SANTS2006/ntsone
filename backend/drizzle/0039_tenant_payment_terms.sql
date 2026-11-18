ALTER TABLE "tenants" ADD COLUMN "fee_percent" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "fee_fixed_minor" integer;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "hold_minutes" integer;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "withdrawals_active_from" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "auto_withdraw" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "auto_withdraw_account_id" uuid;
