CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"object_id" text,
	"signature_valid" boolean,
	"outcome" text DEFAULT 'received' NOT NULL,
	"ip_address" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"net_minor" bigint DEFAULT 0 NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text DEFAULT 'monime' NOT NULL,
	"checkout_session_id" text,
	"provider_order_number" text,
	"redirect_url" text,
	"expires_at" timestamp with time zone,
	"payer_name" text,
	"payer_email" text,
	"payer_phone" text,
	"channel" jsonb,
	"provider_payment_id" text,
	"provider_fees" jsonb,
	"risk" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider_id" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"usable_after" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_payout_id" text,
	"failure_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"risk" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wallet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_id" uuid,
	"payout_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "payment_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "order_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "payment_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "amount_due_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_account_id_payout_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."payout_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_event_idx" ON "payment_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "payment_events_received_idx" ON "payment_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "payments_registration_idx" ON "payments" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "payments_tenant_status_idx" ON "payments" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "payments_program_idx" ON "payments" USING btree ("program_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_pending_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_checkout_session_idx" ON "payments" USING btree ("checkout_session_id") WHERE "payments"."checkout_session_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_ip_idx" ON "payments" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "payments_email_idx" ON "payments" USING btree ("payer_email","created_at");--> statement-breakpoint
CREATE INDEX "payout_accounts_tenant_idx" ON "payout_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payouts_tenant_idx" ON "payouts" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "wallet_entries_tenant_idx" ON "wallet_entries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_payment_kind_idx" ON "wallet_entries" USING btree ("payment_id","kind") WHERE "wallet_entries"."payment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_payout_kind_idx" ON "wallet_entries" USING btree ("payout_id","kind") WHERE "wallet_entries"."payout_id" is not null;--> statement-breakpoint
CREATE INDEX "registrations_program_payment_idx" ON "registrations" USING btree ("program_id","payment_status");