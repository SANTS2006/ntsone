import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const { packToFile } = await import("../../src/modules/backups/crypto.js");
const { createDumpStream, restoreFromFile, scanBackup, schemaFingerprint, listTables } = await import("../../src/modules/backups/engine.js");

// A throwaway in-memory Postgres (never the real database) shaped like the parts of the real schema that matter for
// restore: foreign keys between tables, a very large number, and the append-only audit log with its protective trigger.
const KEY = "engine-test-key-0123456789-abcdefghijklmnop";
let pg: PGlite;
let dir: string;
const source = {
  connect: async () => ({ query: ((text: string, params?: unknown[]) => pg.query(text, params as never)) as never, release: () => undefined }),
};
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows;

const SCHEMA = `
  create table tenants (id uuid primary key, name text not null);
  create table users (id uuid primary key, tenant_id uuid references tenants(id) on delete cascade, name text not null);
  create table payments (id uuid primary key, tenant_id uuid not null references tenants(id), amount_minor bigint not null, note text);
  create table audit_logs (id uuid primary key, actor_user_id uuid references users(id) on delete set null, action text not null);
  create table backups (id uuid primary key, created_by uuid references users(id) on delete set null);
  create table restores (id uuid primary key, requested_by uuid references users(id) on delete set null);
  create function audit_logs_guard() returns trigger as $$
  begin
    if tg_op = 'DELETE' then raise exception 'audit logs cannot be deleted'; end if;
    if tg_op = 'UPDATE' and new.actor_user_id is null and (to_jsonb(new) - 'actor_user_id') = (to_jsonb(old) - 'actor_user_id') then return new; end if;
    raise exception 'audit logs cannot be changed';
  end; $$ language plpgsql;
  create trigger audit_logs_no_change before update or delete on audit_logs for each row execute function audit_logs_guard();
`;
const T1 = "11111111-1111-4111-8111-111111111111";
const U1 = "22222222-2222-4222-8222-222222222222";
const U2 = "33333333-3333-4333-8333-333333333333";
const P1 = "44444444-4444-4444-8444-444444444444";
const BIG = "9007199254740993"; // one more than JavaScript can hold exactly

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bk-engine-"));
  pg = new PGlite();
  await pg.exec(SCHEMA);
});
afterAll(async () => {
  await pg.close();
  await rm(dir, { recursive: true, force: true });
});

async function takeBackup(name: string) {
  const file = path.join(dir, name);
  const result = { counts: {}, fingerprint: "", rowTotal: 0 };
  await packToFile(createDumpStream(result, source), file, KEY);
  return { file, result };
}

describe("backup and restore against a real (throwaway) Postgres", () => {
  it("copies every table except the backup bookkeeping, with exact numbers", async () => {
    await q("insert into tenants values ($1, 'Acme')", [T1]);
    await q("insert into users values ($1, $2, 'Ann'), ($3, $2, 'Bob')", [U1, T1, U2]);
    await q("insert into payments values ($1, $2, $3, 'first')", [P1, T1, BIG]);
    await q("insert into audit_logs values (gen_random_uuid(), $1, 'login')", [U1]);
    expect(await listTables(pg as never)).toEqual(["audit_logs", "payments", "tenants", "users"]);

    const { file, result } = await takeBackup("one.ntsbk");
    expect(result.counts).toEqual({ audit_logs: 1, payments: 1, tenants: 1, users: 2 });
    expect(result.rowTotal).toBe(5);
    const scan = await scanBackup(file, KEY);
    expect(scan.found).toEqual(result.counts);
    const lines: string[] = [];
    await scanBackup(file, KEY, async (t, j) => void lines.push(`${t} ${j}`));
    expect(lines.find((l) => l.startsWith("payments"))).toContain(`"amount_minor":${BIG}`);
  });

  it("restores the data as it was, keeps the audit log, and the database stays consistent", async () => {
    const { file } = await takeBackup("two.ntsbk");

    // The "disaster": data changed, a person removed, a payment added, and new audit entries written since the backup.
    await q("delete from payments");
    await q("delete from users where id = $1", [U2]);
    await q("update tenants set name = 'Hacked'");
    await q("insert into payments values (gen_random_uuid(), $1, 5, 'after the backup')", [T1]);
    await q("insert into users values (gen_random_uuid(), $1, 'Mallory')", [T1]);
    await q("insert into audit_logs values (gen_random_uuid(), null, 'something later')");
    await q("insert into backups values (gen_random_uuid(), $1)", [U1]);

    const stages: string[] = [];
    const outcome = await restoreFromFile(file, KEY, async (s) => void stages.push(s), source);
    expect(stages).toEqual(["restoring", "verifying"]);
    expect(outcome.counts.payments).toBe(1);

    expect(await q("select name from tenants")).toEqual([{ name: "Acme" }]);
    expect((await q("select name from users order by name")).map((r) => r.name)).toEqual(["Ann", "Bob"]);
    expect(await q<{ amount_minor: string; note: string }>("select amount_minor::text, note from payments")).toEqual([{ amount_minor: BIG, note: "first" }]);
    // The audit log only grew: the entry written after the backup is still there.
    expect((await q("select action from audit_logs order by action")).map((r) => r.action)).toEqual(["login", "something later"]);
    // The backup bookkeeping was not touched.
    expect(await q("select count(*)::int as n from backups")).toEqual([{ n: 1 }]);
    // Every foreign key still points somewhere real.
    expect(await q("select count(*)::int as n from payments p left join tenants t on t.id = p.tenant_id where t.id is null")).toEqual([{ n: 0 }]);
    expect(await q("select count(*)::int as n from users u left join tenants t on t.id = u.tenant_id where t.id is null")).toEqual([{ n: 0 }]);
  });

  it("clears audit and bookkeeping links to people who no longer exist after the restore", async () => {
    const { file } = await takeBackup("three.ntsbk");
    // Mallory (not in the backup) did something that was logged and made a backup.
    const mallory = (await q<{ id: string }>("insert into users values (gen_random_uuid(), $1, 'Mallory2') returning id", [T1]))[0]!.id;
    await q("insert into audit_logs values (gen_random_uuid(), $1, 'by mallory')", [mallory]);
    await q("insert into backups values (gen_random_uuid(), $1)", [mallory]);
    await restoreFromFile(file, KEY, async () => undefined, source);
    expect(await q("select actor_user_id from audit_logs where action = 'by mallory'")).toEqual([{ actor_user_id: null }]);
    expect(await q("select count(*)::int as n from backups where created_by is not null and created_by not in (select id from users)")).toEqual([{ n: 0 }]);
  });

  it("leaves the database exactly as it was when the restore cannot complete", async () => {
    const { file } = await takeBackup("four.ntsbk");
    // Make a row in the live data that would break the restore's final check, by changing the structure first.
    await q("alter table payments add column extra text");
    const before = await q("select * from payments order by id");
    const tenantsBefore = await q("select * from tenants");
    await expect(restoreFromFile(file, KEY, async () => undefined, source)).rejects.toThrow(/different version of the database structure/);
    expect(await q("select * from payments order by id")).toEqual(before);
    expect(await q("select * from tenants")).toEqual(tenantsBefore);
    await q("alter table payments drop column extra");
  });

  it("rolls the whole restore back if a count does not match", async () => {
    const { file } = await takeBackup("five.ntsbk");
    await q("insert into payments values (gen_random_uuid(), $1, 7, 'keep me')", [T1]);
    const before = await q("select note from payments order by note");
    // A trigger that quietly drops one inserted row makes the restored table smaller than the backup says.
    await q(`create function drop_one() returns trigger as $$ begin if new.note = 'first' then return null; end if; return new; end; $$ language plpgsql`);
    await q("create trigger drop_one_t before insert on payments for each row execute function drop_one()");
    await q("alter table payments enable always trigger drop_one_t");
    await expect(restoreFromFile(file, KEY, async () => undefined, source)).rejects.toThrow(/Restore check failed/);
    await q("drop trigger drop_one_t on payments");
    expect(await q("select note from payments order by note")).toEqual(before);
  });

  it("describes the structure so a changed database is noticed", async () => {
    const a = await schemaFingerprint(pg as never);
    await q("alter table tenants add column region text");
    expect(await schemaFingerprint(pg as never)).not.toBe(a);
    await q("alter table tenants drop column region");
    expect(await schemaFingerprint(pg as never)).toBe(a);
  });
});
