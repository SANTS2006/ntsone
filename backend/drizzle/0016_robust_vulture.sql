ALTER TYPE "public"."business_document_kind" ADD VALUE 'quotation';--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "quotation_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;