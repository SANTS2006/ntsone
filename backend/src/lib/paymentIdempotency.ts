import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { idempotencyKeys } from "../db/schema/index.js";
import { AppError } from "./errors.js";

/**
 * Idempotency for requests that move or commit money. A client sends an `Idempotency-Key` header (16-64 letters, digits,
 * dashes or underscores, a fresh one per intended action). The first request runs; a repeat with the same key and the same
 * body (a double click, a retry after a dropped connection) gets the stored answer instead of running again; the same key
 * with a different body is refused; a request still running answers "in progress" (409). With no header the request just
 * runs, so older clients keep working. Rows share the existing `idempotency_keys` table (cleared by the maintenance job).
 */
const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;
const STALE_AFTER_MS = 2 * 60_000;

const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");

type Stored = { status: number; body: unknown };
type Record = { state: "running"; hash: string } | { state: "done"; hash: string; result: Stored };

function keyFrom(request: FastifyRequest): string | null {
  const raw = request.headers["idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === "") return null;
  if (!KEY_RE.test(value)) throw AppError.validation("The Idempotency-Key must be 16 to 64 letters, digits, dashes or underscores.");
  return value;
}

/** Runs `action` once per (scope, key). `scope` names the operation and who is doing it, so keys never collide across people. */
export async function runIdempotent(request: FastifyRequest, reply: FastifyReply, scope: string, body: unknown, action: () => Promise<Stored>): Promise<FastifyReply> {
  const key = keyFrom(request);
  if (!key) {
    const result = await action();
    return reply.status(result.status).send(result.body);
  }
  const hash = hashOf(body);
  const where = and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key));
  const claimed = await db.insert(idempotencyKeys).values({ scope, key, response: { state: "running", hash } satisfies Record }).onConflictDoNothing().returning({ id: idempotencyKeys.id });

  if (claimed.length === 0) {
    const [existing] = await db.select().from(idempotencyKeys).where(where).limit(1);
    if (existing) {
      const record = existing.response as Record | null;
      if (record && record.hash !== hash) throw new AppError("VALIDATION_ERROR", "This Idempotency-Key was already used for a different request.", 422);
      if (record?.state === "done") {
        reply.header("Idempotent-Replay", "true");
        return reply.status(record.result.status).send(record.result.body);
      }
      if (Date.now() - existing.createdAt.getTime() < STALE_AFTER_MS) throw new AppError("CONFLICT", "This request is already being processed. Please wait a moment.", 409);
      // A claim whose process died: clear it so this request can take over (only one wins the re-insert).
      await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.id, existing.id), eq(idempotencyKeys.createdAt, existing.createdAt)));
      const retaken = await db.insert(idempotencyKeys).values({ scope, key, response: { state: "running", hash } satisfies Record }).onConflictDoNothing().returning({ id: idempotencyKeys.id });
      if (retaken.length === 0) throw new AppError("CONFLICT", "This request is already being processed. Please wait a moment.", 409);
    }
  }

  try {
    const result = await action();
    await db.update(idempotencyKeys).set({ response: { state: "done", hash, result } satisfies Record }).where(where);
    return reply.status(result.status).send(result.body);
  } catch (err) {
    // A failed attempt can be tried again with the same key.
    await db.delete(idempotencyKeys).where(where).catch(() => undefined);
    throw err;
  }
}
