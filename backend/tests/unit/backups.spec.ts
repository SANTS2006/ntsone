import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const { packToFile, unpackFile, sha256File, isKeyUsable } = await import("../../src/modules/backups/crypto.js");
const { selectBackupsToDelete, clampPolicy } = await import("../../src/modules/backups/retention.js");
const { signV4, LocalBackupStorage } = await import("../../src/modules/backups/storage.js");
const { scanBackup, DUMP_FORMAT } = await import("../../src/modules/backups/engine.js");
const { nextScheduledAt, confirmationFor, restoreRequestSchema, policySchema } = await import("../../src/modules/backups/service.js");

const KEY = "k".repeat(16) + "ey-for-tests-only-0123456789abcdef";
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bk-test-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

describe("backup encryption", () => {
  it("round-trips data and never stores it readable", async () => {
    const file = path.join(dir, "a.ntsbk");
    const text = "secret registration data\n".repeat(2000);
    await packToFile(Readable.from([text]), file, KEY);
    const raw = await readFile(file);
    expect(raw.subarray(0, 6).toString()).toBe("NTSBK1");
    expect(raw.includes(Buffer.from("secret registration"))).toBe(false);
    expect(await readAll(await unpackFile(file, KEY))).toBe(text);
  });

  it("refuses a wrong key", async () => {
    const file = path.join(dir, "b.ntsbk");
    await packToFile(Readable.from(["hello world ".repeat(100)]), file, KEY);
    await expect(readAll(await unpackFile(file, "x".repeat(40)))).rejects.toThrow();
  });

  it("detects a file that was changed", async () => {
    const file = path.join(dir, "c.ntsbk");
    await packToFile(Readable.from(["important ".repeat(500)]), file, KEY);
    const raw = await readFile(file);
    raw[raw.length - 40] = raw[raw.length - 40]! ^ 0xff;
    await writeFile(file, raw);
    await expect(readAll(await unpackFile(file, KEY))).rejects.toThrow();
  });

  it("detects a file that was cut short", async () => {
    const file = path.join(dir, "d.ntsbk");
    await packToFile(Readable.from(["important ".repeat(500)]), file, KEY);
    const raw = await readFile(file);
    await writeFile(file, raw.subarray(0, raw.length - 30));
    await expect(readAll(await unpackFile(file, KEY))).rejects.toThrow();
  });

  it("needs the key to open an encrypted file, and a long enough key", async () => {
    const file = path.join(dir, "e.ntsbk");
    await packToFile(Readable.from(["data"]), file, KEY);
    await expect(unpackFile(file, undefined)).rejects.toThrow(/BACKUP_ENCRYPTION_KEY/);
    expect(isKeyUsable("short")).toBe(false);
    expect(isKeyUsable(KEY)).toBe(true);
  });

  it("gives the same checksum for the same file and a different one after a change", async () => {
    const file = path.join(dir, "f.ntsbk");
    await packToFile(Readable.from(["abc"]), file, KEY);
    const one = await sha256File(file);
    expect(await sha256File(file)).toBe(one);
    const raw = await readFile(file);
    raw[10] = raw[10]! ^ 1;
    await writeFile(file, raw);
    expect(await sha256File(file)).not.toBe(one);
  });
});

describe("dump format", () => {
  const header = JSON.stringify({ format: DUMP_FORMAT, createdAt: "2026-01-01T00:00:00Z", fingerprint: "abc", tables: ["a", "b"] });
  const build = async (name: string, lines: string[]) => {
    const file = path.join(dir, name);
    await packToFile(Readable.from([lines.join("\n") + "\n"]), file, KEY);
    return file;
  };

  it("reads a complete backup and keeps big numbers exactly as written", async () => {
    const file = await build("ok.ntsbk", [`H ${header}`, `R a {"id":1,"amount":9007199254740993}`, `R a {"id":2}`, `R b {"id":3}`, `E {"counts":{"a":2,"b":1}}`]);
    const seen: string[] = [];
    const scan = await scanBackup(file, KEY, async (table, json) => void seen.push(`${table}:${json}`));
    expect(scan.found).toEqual({ a: 2, b: 1 });
    expect(seen[0]).toBe('a:{"id":1,"amount":9007199254740993}');
  });

  it("rejects a backup with no footer (cut short)", async () => {
    const file = await build("nofooter.ntsbk", [`H ${header}`, `R a {"id":1}`]);
    await expect(scanBackup(file, KEY)).rejects.toThrow(/incomplete/);
  });

  it("rejects a backup whose rows disagree with its footer", async () => {
    const file = await build("mismatch.ntsbk", [`H ${header}`, `R a {"id":1}`, `E {"counts":{"a":2,"b":0}}`]);
    await expect(scanBackup(file, KEY)).rejects.toThrow(/damaged/);
  });

  it("rejects rows before the header and unknown records", async () => {
    await expect(scanBackup(await build("nohead.ntsbk", [`R a {"id":1}`]), KEY)).rejects.toThrow(/damaged/);
    await expect(scanBackup(await build("junk.ntsbk", [`H ${header}`, "X nope"]), KEY)).rejects.toThrow(/damaged/);
  });

  it("rejects an unknown format", async () => {
    const file = await build("fmt.ntsbk", [`H ${JSON.stringify({ format: "other", tables: [] })}`, `E {"counts":{}}`]);
    await expect(scanBackup(file, KEY)).rejects.toThrow(/Unsupported/);
  });
});

describe("retention", () => {
  const now = new Date("2026-03-31T12:00:00Z");
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const make = (id: string, ageDays: number, over: Partial<Parameters<typeof selectBackupsToDelete>[0][number]> = {}) => ({
    id,
    type: "automatic" as const,
    status: "completed" as const,
    verificationStatus: "valid" as const,
    startedAt: day(ageDays),
    ...over,
  });

  it("keeps the newest valid ones and anything inside the retention period", () => {
    const list = Array.from({ length: 12 }, (_, i) => make(`b${i}`, i * 5));
    const remove = selectBackupsToDelete(list, { retentionDays: 30, keepLatest: 7 }, new Set(), now);
    expect(remove).toEqual(["b7", "b8", "b9", "b10", "b11"].filter((id) => Number(id.slice(1)) * 5 > 30));
    expect(remove).not.toContain("b0");
  });

  it("never deletes the only valid backup, however old", () => {
    const list = [make("old", 400), make("bad", 500, { verificationStatus: "invalid" })];
    const remove = selectBackupsToDelete(list, { retentionDays: 1, keepLatest: 3 }, new Set(), now);
    expect(remove).toEqual(["bad"]);
  });

  it("never deletes a protected backup (used by a restore) or one that is running", () => {
    const list = [make("a", 0), make("b", 100), make("c", 200), make("d", 300), make("e", 400), make("run", 400, { status: "running", verificationStatus: "pending" })];
    const remove = selectBackupsToDelete(list, { retentionDays: 1, keepLatest: 3 }, new Set(["e"]), now);
    expect(remove).toEqual(["d"]);
  });

  it("removes old failed backups but not recent ones", () => {
    const list = [make("v", 0), make("f1", 50, { status: "failed", verificationStatus: "invalid" }), make("f2", 2, { status: "failed", verificationStatus: "invalid" })];
    expect(selectBackupsToDelete(list, { retentionDays: 30, keepLatest: 3 }, new Set(), now)).toEqual(["f1"]);
  });

  it("clamps a policy to safe limits", () => {
    expect(clampPolicy({ retentionDays: 0, keepLatest: 1 }, { retentionDays: 30, keepLatest: 7 })).toEqual({ retentionDays: 1, keepLatest: 3 });
    expect(clampPolicy({ retentionDays: 99999, keepLatest: 99999 }, { retentionDays: 30, keepLatest: 7 })).toEqual({ retentionDays: 3650, keepLatest: 365 });
    expect(policySchema.safeParse({ retentionDays: 30, keepLatest: 2 }).success).toBe(false);
  });
});

describe("storage", () => {
  it("signs requests the way AWS does (published get-vanilla test vector)", () => {
    const headers = signV4({
      method: "GET",
      url: new URL("https://example.amazonaws.com/"),
      region: "us-east-1",
      service: "service",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      now: new Date("2015-08-30T12:36:00Z"),
    });
    expect(headers.Authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("local storage puts, reads, checks and deletes, and refuses paths outside its folder", async () => {
    const root = path.join(dir, "store");
    const storage = new LocalBackupStorage(root);
    const src = path.join(dir, "src.bin");
    await writeFile(src, "payload");
    await storage.put("2026/01/x.ntsbk", src);
    expect(await storage.head("2026/01/x.ntsbk")).toEqual({ size: 7 });
    const out = path.join(dir, "out.bin");
    await storage.getToFile("2026/01/x.ntsbk", out);
    expect(await readFile(out, "utf8")).toBe("payload");
    await storage.delete("2026/01/x.ntsbk");
    expect(await storage.head("2026/01/x.ntsbk")).toBeNull();
    await expect(storage.put("../escape.bin", src)).rejects.toThrow(/Invalid/);
    await expect(storage.getToFile("../../etc/passwd", out)).rejects.toThrow();
  });
});

describe("schedule and restore confirmation", () => {
  it("finds the next scheduled time", () => {
    expect(nextScheduledAt(new Date("2026-03-31T01:00:00Z"), 2).toISOString()).toBe("2026-03-31T02:00:00.000Z");
    expect(nextScheduledAt(new Date("2026-03-31T02:00:00Z"), 2).toISOString()).toBe("2026-04-01T02:00:00.000Z");
    expect(nextScheduledAt(new Date("2026-12-31T23:00:00Z"), 2).toISOString()).toBe("2027-01-01T02:00:00.000Z");
  });

  it("asks for words tied to the chosen backup", () => {
    expect(confirmationFor("0a1b2c3d-1111-2222-3333-444455556666")).toBe("RESTORE 0A1B2C3D");
  });

  it("needs the password, the typed words and an explicit acknowledgement", () => {
    const base = { backupId: "0a1b2c3d-1111-4222-8333-444455556666", password: "pw", confirmation: "RESTORE 0A1B2C3D", acknowledgeDataLoss: true };
    expect(restoreRequestSchema.safeParse(base).success).toBe(true);
    expect(restoreRequestSchema.safeParse({ ...base, acknowledgeDataLoss: false }).success).toBe(false);
    expect(restoreRequestSchema.safeParse({ ...base, password: "" }).success).toBe(false);
    expect(restoreRequestSchema.safeParse({ ...base, backupId: "nope" }).success).toBe(false);
  });
});
