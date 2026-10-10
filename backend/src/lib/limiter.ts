/**
 * Runs at most `limit` jobs at once and queues the rest, so a burst of heavy work (PDF or Excel
 * generation) can't use all the memory at the same moment. A queue longer than `maxQueue` is refused
 * so a flood fails fast instead of piling up.
 */
export function createLimiter(limit: number, maxQueue = 100) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      if (waiting.length >= maxQueue) throw new Error("The server is busy. Please try again in a moment.");
      // The slot is handed over directly by the job that finishes, so the count never overshoots.
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      active++;
    }
    try {
      return await job();
    } finally {
      const resume = waiting.shift();
      if (resume) resume();
      else active--;
    }
  };
}
