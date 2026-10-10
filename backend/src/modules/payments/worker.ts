import { processPayouts } from "./payouts.js";
import { processRefunds } from "./refunds.js";
import { isMonimeConfigured } from "./monime.js";
import { reconcilePendingPayments } from "./service.js";

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
      await reconcilePendingPayments().catch((err) => log.error("Payment check failed", err));
      await processPayouts().catch((err) => log.error("Withdrawal processing failed", err));
      await processRefunds().catch((err) => log.error("Refund processing failed", err));
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
