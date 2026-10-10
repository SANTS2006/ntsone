import { backupConfig, processNextRestore, runScheduledBackup, stopBackupWork } from "./service.js";

const TICK_MS = 15_000;
const SCHEDULE_CHECK_MS = 5 * 60_000;

/**
 * Runs the daily backup and any queued restore. Every instance runs this loop; the database decides who does the work:
 * a unique index allows only one running backup, and a queued restore is claimed with a row lock, so two instances can
 * never do the same job. (No in-memory clock decides anything: the "is a backup due" question is answered from the
 * backups table.)
 */
export function startBackupWorker(log: { error: (...args: unknown[]) => void }): () => Promise<void> {
  if (!backupConfig().enabled) return async () => undefined;
  let stopped = false;
  let running: Promise<unknown> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;
  let lastScheduleCheck = 0;

  const tick = () => {
    if (stopped) return;
    running = (async () => {
      // Restores first: they are waiting for a person.
      while (!stopped && (await processNextRestore().catch((err) => (log.error("Restore processing failed", err), false)))) {
        /* keep going while there is queued work */
      }
      if (!stopped && Date.now() - lastScheduleCheck >= SCHEDULE_CHECK_MS) {
        lastScheduleCheck = Date.now();
        await runScheduledBackup().catch((err) => log.error("Scheduled backup failed", err));
      }
    })().finally(() => {
      if (!stopped) {
        timer = setTimeout(tick, TICK_MS);
        timer.unref();
      }
    });
  };
  timer = setTimeout(tick, 30_000);
  timer.unref();

  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    // A long backup is not waited for; it is marked interrupted and the next instance starts a fresh one.
    await Promise.race([running, new Promise((r) => setTimeout(r, 10_000))]);
    await stopBackupWork(5_000);
  };
}
