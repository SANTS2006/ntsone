CREATE TABLE "wishlist_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_id" uuid NOT NULL,
	"created_by" uuid,
	"label" text NOT NULL,
	"email" text,
	"level" text DEFAULT 'read' NOT NULL,
	"rotation" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wish_events" ADD COLUMN "actor_label" text;--> statement-breakpoint
ALTER TABLE "wish_events" ADD COLUMN "share_id" uuid;--> statement-breakpoint
ALTER TABLE "wishlist_shares" ADD CONSTRAINT "wishlist_shares_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_shares" ADD CONSTRAINT "wishlist_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wishlist_shares_list_idx" ON "wishlist_shares" USING btree ("wishlist_id","revoked_at");--> statement-breakpoint
ALTER TABLE "wishlist_shares" ADD CONSTRAINT "wishlist_shares_level_check" CHECK ("level" IN ('read', 'write'));--> statement-breakpoint
ALTER TABLE "wishlist_shares" ADD CONSTRAINT "wishlist_shares_label_check" CHECK (char_length(trim("label")) > 0);--> statement-breakpoint
ALTER TABLE "wishlist_shares" ADD CONSTRAINT "wishlist_shares_rotation_check" CHECK ("rotation" >= 0);
