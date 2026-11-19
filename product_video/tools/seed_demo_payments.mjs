// Adds FICTITIOUS payment history (payments, ledger entries, one completed withdrawal) to the DEMO database so the payment screens
// can be shown. Real payments cannot be made in the demo (no live Monime connection). Refuses to run against the live database.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const demo = readFileSync(path.join(repo, "product_video/.demo.env"), "utf8").match(/^DATABASE_URL=(.*)$/m)[1];
const live = readFileSync(path.join(repo, ".env"), "utf8").match(/^DATABASE_URL=(.*)$/m)[1];
const host = (u) => u.match(/@([^/?]+)/)[1];
if (host(demo) === host(live)) throw new Error("Refusing: this is the live database");
const sql = neon(demo);

const [tenant] = await sql`select id from tenants where slug = 'acme-training-co'`;
const [prog] = await sql`select p.id, p.name from programs p where p.tenant_id = ${tenant.id} and p.name = 'Web Development Bootcamp'`;
const [reg] = await sql`select id from registrations where program_id = ${prog.id} limit 1`;
const existing = await sql`select count(*)::int n from payments where tenant_id = ${tenant.id}`;
if (existing[0].n > 0) {
  console.log("demo payments already present");
  process.exit(0);
}
const day = (n, h = 10) => new Date(Date.now() - n * 86400000 + h * 3600000 - 3600000 * 10).toISOString();
const rows = [
  ["completed", 5000, 8, "Orange Money"],
  ["completed", 5000, 6, "Africell Money"],
  ["completed", 7500, 4, "Orange Money"],
  ["cancelled", 5000, 3, null],
  ["completed", 2000, 2, "Orange Money"],
  ["pending", 5000, 0, null],
];
let totalNet = 0;
for (const [status, gross, ago, provider] of rows) {
  const fee = status === "completed" ? Math.round((gross * 5) / 100) : 0;
  const net = status === "completed" ? gross - fee : 0;
  totalNet += net;
  const at = day(ago);
  const [pay] = await sql`insert into payments (tenant_id, program_id, registration_id, purpose, status, amount_minor, fee_minor, net_minor, line_items, payer_name, payer_email, payer_phone, channel, paid_at, created_at, updated_at, failure_reason)
    values (${tenant.id}, ${prog.id}, ${reg.id}, 'registration', ${status}, ${gross}, ${fee}, ${net}, ${JSON.stringify([{ id: "registration_fee", name: "Registration fee", quantity: 1, unitMinor: gross, totalMinor: gross }])}::jsonb,
      'Demo Registrant', 'demo.payer@example.com', '076 000 000', ${provider ? JSON.stringify({ type: "momo", provider }) : null}::jsonb, ${status === "completed" ? at : null}, ${at}, ${at}, ${status === "cancelled" ? "Cancelled by the payer" : null})
    returning id`;
  if (status === "completed") {
    await sql`insert into wallet_entries (tenant_id, kind, amount_minor, available_at, payment_id, created_at) values (${tenant.id}, 'payment', ${gross}, ${at}, ${pay.id}, ${at})`;
    await sql`insert into wallet_entries (tenant_id, kind, amount_minor, available_at, payment_id, note, created_at) values (${tenant.id}, 'fee', ${-fee}, ${at}, ${pay.id}, 'Platform fee', ${at})`;
    await sql`insert into wallet_entries (tenant_id, kind, amount_minor, available_at, payment_id, note, created_at) values (null, 'platform_fee', ${fee}, ${at}, ${pay.id}, 'Platform fee', ${at})`;
  }
}
const old = new Date(Date.now() - 7 * 86400000).toISOString();
const [account] = await sql`insert into payout_accounts (tenant_id, type, provider_id, account_number, account_name, usable_after, created_at)
  values (${tenant.id}, 'momo', 'm17', '23276123456', 'Acme Training Co', ${old}, ${old}) returning id`;
const when = new Date(Date.now() - 1 * 86400000).toISOString();
const [payout] = await sql`insert into payouts (tenant_id, account_id, amount_minor, status, created_at, updated_at, completed_at)
  values (${tenant.id}, ${account.id}, 10000, 'completed', ${when}, ${when}, ${when}) returning id`;
await sql`insert into wallet_entries (tenant_id, kind, amount_minor, available_at, payout_id, note, created_at) values (${tenant.id}, 'payout', -10000, ${when}, ${payout.id}, 'Withdrawal', ${when})`;
console.log("seeded demo payments. net earned", totalNet, "balance", totalNet - 10000);
