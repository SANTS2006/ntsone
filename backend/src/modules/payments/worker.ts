import { processPayouts } from "./payouts.js";
import { processRefunds } from "./refunds.js";
import { isMonimeConfigured } from "./monime.js";
import { reconcilePendingPayments } from "./service.js";
import { pool } from "../../db/client.js";

/** Runs `work` only if no other server holds the named lock (a Postgres advisory lock held on its own connection). */
async function withLeaderLock(name: string, work: () => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("select pg_try_advisory_lock(hashtext($1)) as ok", [name]);
    if (!rows[0]?.ok) return;
    try {
      await work();
    } finally {
      await client.query("select pg_advisory_unlock(hashtext($1))", [name]);
    }
  } finally {
    client.release();
  }
}

const INTERVAL_MS = 30_000;

/**
 * The background safety net for payments: every half minute, ask Monime about payments still open (in case a
 * notification never arrived), send queued withdrawals, and follow up on ones in progress. Runs on every instance;
 * the database makes sure two instances never send the same withdrawal.
 */
export function startPaymentsWorker(log: { error: (...args: unknown[]) => void }): () => Promise<void> {
  if (!isMonimeConfigured()) return async () => undefined;
  let stopped = false;
  let running: Promise<unknown> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;

  const tick = () => {
    if (stopped) return;
    running = (async () => {
      // Only one server runs a round at a time (a database lock), so many servers don't ask Monime about the same payments.
      await withLeaderLock("payments-worker", async () => {
        await reconcilePendingPayments().catch((err) => log.error("Payment check failed", err));
        await processPayouts().catch((err) => log.error("Withdrawal processing failed", err));
        await processRefunds().catch((err) => log.error("Refund processing failed", err));
      }).catch((err) => log.error("Payment worker round failed", err));
    })().finally(() => {
      if (!stopped) {
        timer = setTimeout(tick, INTERVAL_MS);
        timer.unref();
      }
    });
  };
  timer = setTimeout(tick, 15_000);
  timer.unref();

  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await running;
  };
}
