CREATE TYPE "public"."business_document_kind" AS ENUM('invoice', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."program_kind" AS ENUM('program', 'order_form');--> statement-breakpoint
ALTER TYPE "public"."registration_status" ADD VALUE 'confirmed';--> statement-breakpoint
ALTER TYPE "public"."registration_status" ADD VALUE 'processing';--> statement-breakpoint
ALTER TYPE "public"."registration_status" ADD VALUE 'ready';--> statement-breakpoint
ALTER TYPE "public"."registration_status" ADD VALUE 'delivered';--> statement-breakpoint
ALTER TYPE "public"."registration_status" ADD VALUE 'completed';--> statement-breakpoint
CREATE TABLE "business_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" "business_document_kind" NOT NULL,
	"sequence" integer NOT NULL,
	"number" text NOT NULL,
	"status" text NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"client_phone" text,
	"client_address" text,
	"issue_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone,
	"payment_method" text,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"terms" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"edited_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_sent_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "business_documents_business_kind_sequence_unique" UNIQUE("business_id","kind","sequence")
);
--> statement-breakpoint
CREATE TABLE "business_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"role_on_business" "program_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_members_user_business_unique" UNIQUE("user_id","business_id")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo_url" text,
	"email" text,
	"phone" text,
	"address" text,
	"website" text,
	"tax_number" text,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"brand_color" text DEFAULT '#2563eb' NOT NULL,
	"invoice_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"receipt_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notify_customer_on_status" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "kind" "program_kind" DEFAULT 'program' NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_documents" ADD CONSTRAINT "business_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_documents_business_kind_idx" ON "business_documents" USING btree ("business_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "business_members_business_id_idx" ON "business_members" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "businesses_tenant_id_idx" ON "businesses" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "programs_business_id_idx" ON "programs" USING btree ("business_id");