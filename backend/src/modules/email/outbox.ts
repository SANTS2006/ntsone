import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { emailOutbox } from "../../db/schema/index.js";
import { deliverEmail, sendEmail, type SendEmailInput } from "./service.js";

// A durable queue for notification emails (new registrations, votes, orders, access given). The
// email is stored first, so the request that caused it can finish and a provider outage only delays
// it. A worker in each server instance sends what is due, backing off between tries, and gives up
// (status "failed", kept for inspection) after MAX_ATTEMPTS.

const MAX_ATTEMPTS = 6;
const BATCH = 10;
const POLL_MS = 10_000;
// 30s, 2m, 8m, 32m, ~2h: a mail outage of a couple of hours still delivers everything afterwards.
const backoffMs = (attempt: number) => Math.min(30_000 * 4 ** (attempt - 1), 3 * 60 * 60_000);

/** Saves an email to be sent in the background. If it can't even be saved, it is sent directly. */
export async function queueEmail(input: SendEmailInput): Promise<void> {
  try {
    await db.insert(emailOutbox).values({ payload: input as unknown as Record<string, unknown> });
  } catch (err) {
    console.error("Could not queue an email; sending it directly", err);
    void sendEmail(input);
  }
}

/** Sends one batch of due emails. Rows are claimed with SKIP LOCKED so several instances never send the same one. */
export async function processOutbox(): Promise<number> {
  const claimed = await db.transaction(async (tx) => {
    const due = await tx.execute<{ id: string }>(sql`
      select id from email_outbox
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      limit ${BATCH}
      for update skip locked
    `);
    const ids = due.rows.map((r) => r.id);
    if (ids.length === 0) return [];
    // Push the next attempt out while we work, so a crash doesn't make another instance wait for nothing
    // and a slow send isn't picked up twice.
    await tx
      .update(emailOutbox)
      .set({ nextAttemptAt: sql`now() + interval '5 minutes'` })
      .where(inArray(emailOutbox.id, ids));
    return tx.select().from(emailOutbox).where(inArray(emailOutbox.id, ids));
  });

  for (const row of claimed) {
    const attempts = row.attempts + 1;
    const result = await deliverEmail(row.payload as SendEmailInput);
    if (result.ok) {
      await db.update(emailOutbox).set({ status: "sent", attempts, sentAt: new Date(), lastError: null }).where(eq(emailOutbox.id, row.id));
    } else if (!result.retryable || attempts >= MAX_ATTEMPTS) {
      console.error(`Email ${row.id} given up after ${attempts} attempt(s): ${result.error}`);
      await db.update(emailOutbox).set({ status: "failed", attempts, lastError: result.error ?? null }).where(eq(emailOutbox.id, row.id));
    } else {
      await db
        .update(emailOutbox)
        .set({ attempts, lastError: result.error ?? null, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) })
        .where(eq(emailOutbox.id, row.id));
    }
  }
  return claimed.length;
}

/** Deletes sent emails after a week and failed ones after 30 days. */
export async function pruneOutbox() {
  const week = new Date(Date.now() - 7 * 86_400_000);
  const month = new Date(Date.now() - 30 * 86_400_000);
  await db.delete(emailOutbox).where(and(eq(emailOutbox.status, "sent"), lte(emailOutbox.createdAt, week)));
  await db.delete(emailOutbox).where(and(eq(emailOutbox.status, "failed"), lt(emailOutbox.createdAt, month)));
}

/** Starts the background worker; returns a function that stops it and waits for the current batch. */
export function startOutboxWorker(log: { error: (...args: unknown[]) => void } = console): () => Promise<void> {
  let stopped = false;
  let running: Promise<unknown> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;

  const tick = () => {
    if (stopped) return;
    running = processOutbox()
      .catch((err) => log.error("Email outbox worker error", err))
      .finally(() => {
        if (!stopped) {
          timer = setTimeout(tick, POLL_MS);
          timer.unref();
        }
      });
  };
  timer = setTimeout(tick, 5_000);
  timer.unref();

  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await running;
  };
}
