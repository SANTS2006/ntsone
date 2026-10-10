ALTER TABLE "payments" ALTER COLUMN "program_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "registration_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD COLUMN "weight" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "payment_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "poll_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "voter_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "poll_position_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "votes_bought" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "redeemed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voter_id_voter_accounts_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."voter_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_poll_position_id_poll_positions_id_fk" FOREIGN KEY ("poll_position_id") REFERENCES "public"."poll_positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "poll_votes_payment_unique" ON "poll_votes" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_poll_idx" ON "payments" USING btree ("poll_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_voter_idx" ON "payments" USING btree ("voter_id","poll_id");
--> statement-breakpoint
-- A payment is for a registration or order, or for votes in a poll, never a mix; votes are always worth at least one.
ALTER TABLE "payments" ADD CONSTRAINT "payments_target_check" CHECK (
  ("registration_id" IS NOT NULL AND "program_id" IS NOT NULL AND "poll_id" IS NULL)
  OR ("poll_id" IS NOT NULL AND "voter_id" IS NOT NULL AND "votes_bought" > 0 AND "registration_id" IS NULL)
);--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_weight_check" CHECK ("weight" >= 1);--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;
