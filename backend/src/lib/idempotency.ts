import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { idempotencyKeys } from "../db/schema/index.js";
import { AppError } from "./errors.js";

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const PENDING_STALE_MS = 2 * 60_000;
const WAIT_MS = 6_000;

/** The Idempotency-Key header, if it is a well-formed key; anything else is ignored. */
export function readIdempotencyKey(value: unknown): string | undefined {
  const key = Array.isArray(value) ? value[0] : value;
  return typeof key === "string" && KEY_PATTERN.test(key) ? key : undefined;
}

/**
 * Makes a "create something" request safe to repeat. The first request with a key does the work and
 * its result is stored; a repeat (a double click, or the browser retrying after a dropped
 * connection) gets that same result instead of creating a second record. A repeat that arrives
 * while the first is still running waits for it. If the work fails nothing is kept, so the person
 * can try again.
 */
export async function withIdempotency<T extends object>(
  scope: string,
  key: string | undefined,
  work: () => Promise<T>,
): Promise<{ value: T; replay: boolean }> {
  if (!key) return { value: await work(), replay: false };

  for (let attempt = 0; attempt < 2; attempt++) {
    const [claimed] = await db.insert(idempotencyKeys).values({ scope, key }).onConflictDoNothing().returning({ id: idempotencyKeys.id });
    if (claimed) {
      try {
        const value = await work();
        await db.update(idempotencyKeys).set({ response: value }).where(eq(idempotencyKeys.id, claimed.id));
        return { value, replay: false };
      } catch (err) {
        await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, claimed.id)).catch(() => undefined);
        throw err;
      }
    }

    // Someone already used this key: wait for their result.
    const deadline = Date.now() + WAIT_MS;
    for (;;) {
      const [existing] = await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
        .limit(1);
      if (!existing) break; // their attempt failed and was cleared: claim it ourselves
      if (existing.response) return { value: existing.response as T, replay: true };
      if (Date.now() - existing.createdAt.getTime() > PENDING_STALE_MS) {
        // The first request never finished (the server restarted): clear it and go again.
        await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id));
        break;
      }
      if (Date.now() > deadline) {
        throw new AppError("CONFLICT", "Your submission is already being processed. Please wait a moment and check again.", 409);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new AppError("CONFLICT", "Your submission is already being processed. Please wait a moment and check again.", 409);
}

/** Forgets keys older than two days. */
export async function pruneIdempotencyKeys() {
  await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, new Date(Date.now() - 2 * 86_400_000)));
}
