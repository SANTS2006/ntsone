import cluster from "node:cluster";
import os from "node:os";

/**
 * Starts the API on several processes that share one port, so every CPU core serves requests (the operating system
 * spreads incoming connections between them). Set CLUSTER_WORKERS to a number, or "auto" for one per core; 1 or empty
 * runs a single process. Only the first process runs the background jobs (emails, payment checks, backups); a replaced
 * process takes over that role if the first one dies. Put a load balancer (see deploy/nginx.conf) in front to spread
 * traffic across several machines too.
 */
const raw = process.env.CLUSTER_WORKERS?.trim().toLowerCase();
const count = raw === "auto" ? Math.max(1, os.availableParallelism?.() ?? os.cpus().length) : Math.max(1, Math.min(64, Number(raw) || 1));

if (count > 1 && cluster.isPrimary) {
  const background = new Set<number>(); // pids of workers that run the background jobs
  const spawn = (runsBackground: boolean) => {
    const worker = cluster.fork({ NTS_BACKGROUND_JOBS: runsBackground ? "1" : "0" });
    if (runsBackground) background.add(worker.id);
    return worker;
  };
  for (let i = 0; i < count; i += 1) spawn(i === 0);
  cluster.on("exit", (worker, code, signal) => {
    console.error(`API process ${worker.process.pid} stopped (${signal ?? code}); starting another`);
    const hadBackground = background.delete(worker.id);
    setTimeout(() => spawn(hadBackground || background.size === 0), 1_000);
  });
  const stop = (signal: NodeJS.Signals) => {
    for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill(signal);
    cluster.removeAllListeners("exit");
    setTimeout(() => process.exit(0), 27_000).unref();
    cluster.on("exit", () => {
      if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(0);
    });
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  console.log(`Starting ${count} API processes`);
} else {
  await import("./server.js");
}
