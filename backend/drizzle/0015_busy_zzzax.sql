CREATE TABLE "poll_verified_voters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_verified_voters_poll_key_unique" UNIQUE("poll_id","email_key")
);
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "verified_voters_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "poll_verified_voters" ADD CONSTRAINT "poll_verified_voters_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_verified_voters_poll_id_idx" ON "poll_verified_voters" USING btree ("poll_id");