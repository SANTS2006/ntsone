CREATE TABLE "wish_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_id" uuid NOT NULL,
	"item_id" uuid,
	"actor_id" uuid,
	"type" text NOT NULL,
	"item_name" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wish_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_minor" bigint,
	"priority" text DEFAULT 'medium' NOT NULL,
	"category" text,
	"notes" text,
	"link" text,
	"status" text DEFAULT 'wished' NOT NULL,
	"paid_minor" bigint,
	"gotten_at" date,
	"store" text,
	"gotten_note" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"tenant_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"budget_minor" bigint,
	"target_date" date,
	"color" text DEFAULT 'blue' NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wish_events" ADD CONSTRAINT "wish_events_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_events" ADD CONSTRAINT "wish_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wish_events_list_idx" ON "wish_events" USING btree ("wishlist_id","created_at");--> statement-breakpoint
CREATE INDEX "wish_items_list_idx" ON "wish_items" USING btree ("wishlist_id","status","removed_at");--> statement-breakpoint
CREATE INDEX "wish_items_gotten_idx" ON "wish_items" USING btree ("wishlist_id","gotten_at");--> statement-breakpoint
CREATE INDEX "wish_items_owner_idx" ON "wish_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "wishlists_owner_idx" ON "wishlists" USING btree ("owner_id","deleted_at","created_at");--> statement-breakpoint
-- Rules the database itself enforces, whatever the code does.
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_budget_check" CHECK ("budget_minor" IS NULL OR "budget_minor" >= 0);--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_name_check" CHECK (char_length(trim("name")) > 0);--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_quantity_check" CHECK ("quantity" >= 1 AND "quantity" <= 100000);--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_price_check" CHECK (("unit_price_minor" IS NULL OR "unit_price_minor" >= 0) AND ("paid_minor" IS NULL OR "paid_minor" >= 0));--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_priority_check" CHECK ("priority" IN ('low', 'medium', 'high'));--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_status_check" CHECK ("status" IN ('wished', 'gotten'));--> statement-breakpoint
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_name_check" CHECK (char_length(trim("name")) > 0);--> statement-breakpoint
-- An item is "gotten" exactly when it has a date and a price paid.
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_gotten_check" CHECK (("status" = 'gotten' AND "gotten_at" IS NOT NULL AND "paid_minor" IS NOT NULL) OR ("status" = 'wished' AND "gotten_at" IS NULL AND "paid_minor" IS NULL));
