CREATE TABLE "tenant_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_members_tenant_user_unique" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_members_user_id_idx" ON "tenant_members" USING btree ("user_id");
--> statement-breakpoint
-- People who were already invited into someone's program, poll or business from their own space join that team, under the role they were given.
INSERT INTO "tenant_members" ("tenant_id", "user_id", "role")
SELECT t.tenant_id, t.user_id, CASE WHEN bool_or(t.r = 'admin') THEN 'program_admin' ELSE 'viewer' END
FROM (
  SELECT p.tenant_id, pm.user_id, pm.role_on_program::text AS r FROM "program_members" pm JOIN "programs" p ON p.id = pm.program_id
  UNION ALL
  SELECT po.tenant_id, m.user_id, m.role_on_poll::text FROM "poll_members" m JOIN "polls" po ON po.id = m.poll_id
  UNION ALL
  SELECT b.tenant_id, m.user_id, m.role_on_business::text FROM "business_members" m JOIN "businesses" b ON b.id = m.business_id
) t
JOIN "users" u ON u.id = t.user_id
WHERE u.tenant_id IS DISTINCT FROM t.tenant_id AND u.role <> 'super_admin'
GROUP BY t.tenant_id, t.user_id
ON CONFLICT DO NOTHING;
