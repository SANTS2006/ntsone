CREATE TABLE "business_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text,
	"company" text NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"address" text,
	"tagline" text,
	"photo_url" text,
	"template" text DEFAULT 'split' NOT NULL,
	"primary_color" text DEFAULT '#1d4ed8' NOT NULL,
	"secondary_color" text DEFAULT '#f59e0b' NOT NULL,
	"show_qr" boolean DEFAULT true NOT NULL,
	"last_sent_to" text,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "business_cards" ADD CONSTRAINT "business_cards_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_cards" ADD CONSTRAINT "business_cards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_cards_business_idx" ON "business_cards" USING btree ("business_id","created_at");