CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_refund_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"reason" text NOT NULL,
	"provider_id" text NOT NULL,
	"phone_number" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_payout_id" text,
	"failure_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"requested_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payout_accounts" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_entries" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD COLUMN "refund_id" uuid;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_tenant_idx" ON "refunds" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_refund_kind_idx" ON "wallet_entries" USING btree ("refund_id","kind") WHERE "wallet_entries"."refund_id" is not null;
--> statement-breakpoint
-- Fees already taken from completed payments belong to the platform: put them on its own ledger.
INSERT INTO "wallet_entries" ("tenant_id", "kind", "amount_minor", "currency", "available_at", "payment_id", "note")
SELECT NULL, 'platform_fee', "fee_minor", "currency", COALESCE("paid_at", now()), "id", 'Platform fee'
FROM "payments" WHERE "status" = 'completed' AND "fee_minor" > 0
ON CONFLICT DO NOTHING;
