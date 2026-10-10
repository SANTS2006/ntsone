CREATE TYPE "public"."poll_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "poll_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"poll_id" uuid NOT NULL,
	"role_on_poll" "program_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_members_user_poll_unique" UNIQUE("user_id","poll_id")
);
--> statement-breakpoint
CREATE TABLE "poll_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_voters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_voters_poll_voter_unique" UNIQUE("poll_id","voter_id")
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"ballot_key" text NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"status" "poll_status" DEFAULT 'draft' NOT NULL,
	"closes_at" timestamp with time zone,
	"one_per_email" boolean DEFAULT true NOT NULL,
	"restrict_email_domain" boolean DEFAULT false NOT NULL,
	"allowed_email_domains" text,
	"show_results" boolean DEFAULT true NOT NULL,
	"notify_on_vote" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "polls_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "voter_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"google_id" text,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "voter_accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "voter_accounts_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "voter_email_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voter_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poll_candidates" ADD CONSTRAINT "poll_candidates_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_candidates" ADD CONSTRAINT "poll_candidates_position_id_poll_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."poll_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_members" ADD CONSTRAINT "poll_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_members" ADD CONSTRAINT "poll_members_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_positions" ADD CONSTRAINT "poll_positions_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_voters" ADD CONSTRAINT "poll_voters_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_voters" ADD CONSTRAINT "poll_voters_voter_id_voter_accounts_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."voter_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_position_id_poll_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."poll_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_candidate_id_poll_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."poll_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_voter_id_voter_accounts_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."voter_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voter_email_codes" ADD CONSTRAINT "voter_email_codes_voter_id_voter_accounts_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."voter_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_candidates_position_id_idx" ON "poll_candidates" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "poll_members_poll_id_idx" ON "poll_members" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "poll_positions_poll_id_idx" ON "poll_positions" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "poll_voters_poll_id_idx" ON "poll_voters" USING btree ("poll_id");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_votes_ballot_key_unique" ON "poll_votes" USING btree ("ballot_key");--> statement-breakpoint
CREATE INDEX "poll_votes_poll_id_idx" ON "poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "poll_votes_position_candidate_idx" ON "poll_votes" USING btree ("position_id","candidate_id");--> statement-breakpoint
CREATE INDEX "poll_votes_voter_id_idx" ON "poll_votes" USING btree ("voter_id");--> statement-breakpoint
CREATE INDEX "polls_tenant_id_idx" ON "polls" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "polls_status_idx" ON "polls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "voter_email_codes_voter_id_idx" ON "voter_email_codes" USING btree ("voter_id");