-- An order's payment status now follows its latest payment (the payments table is the source of truth).
UPDATE "registrations" r
SET "payment_status" = p."status"
FROM (
  SELECT DISTINCT ON ("registration_id") "registration_id", "status"
  FROM "payments"
  WHERE "registration_id" IS NOT NULL AND "status" IN ('cancelled', 'failed', 'expired', 'review')
  ORDER BY "registration_id", "created_at" DESC
) p
WHERE p."registration_id" = r."id"
  AND r."payment_status" IN ('pending', 'review')
  AND NOT EXISTS (SELECT 1 FROM "payments" c WHERE c."registration_id" = r."id" AND c."status" IN ('completed', 'pending'));
