import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import type { PoolClient } from "@neondatabase/serverless";
import { pool } from "../../db/client.js";
import { unpackFile } from "./crypto.js";

// The dump format is one text line per record, so a backup can be written and read without holding it all in memory:
//   H <json>            header: format, createdAt, schema fingerprint, table list
//   R <table> <json>    one row (the JSON is exactly what Postgres produced, so large numbers keep every digit)
//   E <json>            footer: how many rows each table has. A file without it is incomplete.
export const DUMP_FORMAT = "ntsbk-1";

/** Never copied or restored: the backup bookkeeping itself. */
const EXCLUDED_TABLES = new Set(["backups", "restores"]);
/** Never emptied by a restore: the audit log can only grow (a database trigger enforces it), so restore only adds missing rows. */
export const APPEND_ONLY_TABLES = new Set(["audit_logs"]);

/** Anything with a query method (a pool, a connection). */
export type Queryable = Pick<PoolClient, "query">;
/** Where the engine gets connections from: the real pool, or a throwaway database in tests. */
export interface DbSource {
  connect(): Promise<Queryable & { release(): void }>;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export interface DumpHeader {
  format: string;
  createdAt: string;
  fingerprint: string;
  tables: string[];
}
export type TableCounts = Record<string, number>;

export async function listTables(client: Queryable): Promise<string[]> {
  const res = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
  );
  return res.rows.map((r) => r.table_name).filter((t) => !EXCLUDED_TABLES.has(t));
}

/** A hash of every table, column and column type, so a backup is only restored into the same structure it came from. */
export async function schemaFingerprint(client: Queryable): Promise<string> {
  const res = await client.query<{ table_name: string; column_name: string; udt_name: string }>(
    "select table_name, column_name, udt_name from information_schema.columns where table_schema = 'public' order by table_name, column_name",
  );
  const hash = createHash("sha256");
  for (const r of res.rows) if (!EXCLUDED_TABLES.has(r.table_name)) hash.update(`${r.table_name}.${r.column_name}:${r.udt_name}\n`);
  return hash.digest("hex");
}

export interface DumpResult {
  counts: TableCounts;
  fingerprint: string;
  rowTotal: number;
}

/**
 * Reads the whole database from one consistent snapshot (a read-only, repeatable-read transaction), producing the dump
 * lines. The rows written are checked against a count taken in the same snapshot, so a table that was cut short is an
 * error instead of a quietly incomplete backup. `result` is filled in once the stream has ended.
 */
export function createDumpStream(result: DumpResult, source: DbSource = pool as unknown as DbSource): Readable {
  async function* lines(): AsyncGenerator<string> {
    const client = await source.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const tables = await listTables(client);
      const fingerprint = await schemaFingerprint(client);
      result.fingerprint = fingerprint;
      yield `H ${JSON.stringify({ format: DUMP_FORMAT, createdAt: new Date().toISOString(), fingerprint, tables } satisfies DumpHeader)}\n`;
      const counts: TableCounts = {};
      for (const table of tables) {
        let written = 0;
        await client.query(`DECLARE dump_cursor NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS j FROM ${quote(table)} t`);
        for (;;) {
          const batch = await client.query<{ j: string }>("FETCH 500 FROM dump_cursor");
          if (batch.rows.length === 0) break;
          let chunk = "";
          for (const row of batch.rows) chunk += `R ${table} ${row.j}\n`;
          written += batch.rows.length;
          yield chunk;
        }
        await client.query("CLOSE dump_cursor");
        const check = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${quote(table)}`);
        if (Number(check.rows[0]?.n) !== written) throw new Error(`Backup check failed: table ${table} had ${check.rows[0]?.n} rows but ${written} were copied`);
        counts[table] = written;
      }
      await client.query("COMMIT");
      result.counts = counts;
      result.rowTotal = Object.values(counts).reduce((a, b) => a + b, 0);
      yield `E ${JSON.stringify({ counts })}\n`;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
  return Readable.from(lines(), { objectMode: false, encoding: "utf8" });
}

export interface ScanResult {
  header: DumpHeader;
  /** Rows actually found in the file, per table. */
  found: TableCounts;
  /** Row counts the file's footer claims. */
  footer: TableCounts;
}

/** Reads a whole backup file (decrypting it, which also proves it was not altered) and checks it is complete and consistent with itself. */
export async function scanBackup(filePath: string, key: string | undefined, onRow?: (table: string, json: string) => Promise<void>): Promise<ScanResult> {
  const stream = await unpackFile(filePath, key);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let header: DumpHeader | null = null;
  let footer: TableCounts | null = null;
  const found: TableCounts = {};
  try {
    for await (const line of rl) {
      if (!line) continue;
      const tag = line[0];
      if (tag === "R") {
        if (!header) throw new Error("Backup is damaged: rows before the header");
        if (footer) throw new Error("Backup is damaged: rows after the footer");
        const space = line.indexOf(" ", 2);
        const table = line.slice(2, space);
        found[table] = (found[table] ?? 0) + 1;
        if (onRow) await onRow(table, line.slice(space + 1));
      } else if (tag === "H") {
        if (header) throw new Error("Backup is damaged: two headers");
        header = JSON.parse(line.slice(2)) as DumpHeader;
        if (header.format !== DUMP_FORMAT) throw new Error(`Unsupported backup format: ${String(header.format).slice(0, 20)}`);
      } else if (tag === "E") {
        footer = (JSON.parse(line.slice(2)) as { counts: TableCounts }).counts;
      } else {
        throw new Error("Backup is damaged: unknown record");
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  if (!header) throw new Error("Backup is damaged: no header");
  if (!footer) throw new Error("Backup is incomplete: no footer (the copy was cut short)");
  for (const table of header.tables) {
    if ((found[table] ?? 0) !== (footer[table] ?? 0)) throw new Error(`Backup is damaged: table ${table} has ${found[table] ?? 0} rows but should have ${footer[table] ?? 0}`);
  }
  return { header, found, footer };
}

export type RestoreStage = "restoring" | "verifying";

export interface RestoreOutcome {
  counts: TableCounts;
}

/**
 * Replaces the contents of the database with the backup, inside ONE transaction: any problem (a rejected row, a count
 * that does not match) rolls everything back and leaves the database exactly as it was. The audit log is never emptied;
 * rows missing from it are added back. The file is read twice: once to check it completely before anything is touched,
 * then again to copy.
 */
export async function restoreFromFile(filePath: string, key: string | undefined, onStage: (stage: RestoreStage) => Promise<void>, source: DbSource = pool as unknown as DbSource): Promise<RestoreOutcome> {
  // Pass 1: prove the file is whole and readable before touching the database.
  const scan = await scanBackup(filePath, key);

  const client = await source.connect();
  try {
    const currentTables = await listTables(client);
    const fingerprint = await schemaFingerprint(client);
    if (fingerprint !== scan.header.fingerprint) {
      throw new Error("This backup was taken from a different version of the database structure, so it cannot be restored safely.");
    }
    if (currentTables.join(",") !== scan.header.tables.join(",")) throw new Error("The list of tables in the backup does not match the database.");

    await client.query("BEGIN");
    try {
      // Rows reference each other, so the checks between tables are paused for this transaction only; the data comes from one consistent snapshot.
      try {
        await client.query("SET LOCAL session_replication_role = replica");
      } catch {
        throw new Error("The database user is not allowed to pause table checks during a restore, so nothing was changed. Use the database owner role, or restore with the database provider's own tools.");
      }
      await client.query("SET LOCAL statement_timeout = 0");
      await onStage("restoring");
      for (const table of currentTables) {
        if (!APPEND_ONLY_TABLES.has(table)) await client.query(`DELETE FROM ${quote(table)}`);
      }

      let buffer: string[] = [];
      let bufferTable = "";
      let bufferBytes = 0;
      const flush = async () => {
        if (buffer.length === 0) return;
        const conflict = APPEND_ONLY_TABLES.has(bufferTable) ? " ON CONFLICT DO NOTHING" : "";
        await client.query(`INSERT INTO ${quote(bufferTable)} SELECT * FROM jsonb_populate_recordset(null::${quote(bufferTable)}, $1::jsonb)${conflict}`, [`[${buffer.join(",")}]`]);
        buffer = [];
        bufferBytes = 0;
      };
      await scanBackup(filePath, key, async (table, json) => {
        if (table !== bufferTable || buffer.length >= 500 || bufferBytes > 2_000_000) {
          await flush();
          bufferTable = table;
        }
        buffer.push(json);
        bufferBytes += json.length;
      });
      await flush();

      // The log keeps people who no longer exist as blank; do the same for the backup bookkeeping.
      await client.query("UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = audit_logs.actor_user_id)");
      await client.query("UPDATE backups SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = backups.created_by)");
      await client.query("UPDATE restores SET requested_by = NULL WHERE requested_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = restores.requested_by)");

      await onStage("verifying");
      const counts: TableCounts = {};
      for (const table of currentTables) {
        const res = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${quote(table)}`);
        const n = Number(res.rows[0]?.n);
        const expected = scan.footer[table] ?? 0;
        counts[table] = n;
        const ok = APPEND_ONLY_TABLES.has(table) ? n >= expected : n === expected;
        if (!ok) throw new Error(`Restore check failed: table ${table} has ${n} rows but the backup has ${expected}`);
      }
      await client.query("COMMIT");
      return { counts };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  } finally {
    client.release();
  }
}
