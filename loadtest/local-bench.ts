/**
 * A local benchmark of the parts of the server that do not need a database: the HTTP layer, static
 * file serving, and PDF generation. Run it from backend/:
 *
 *   NODE_ENV=production npx tsx ../loadtest/local-bench.ts
 *
 * It never connects to the database, so it is safe to run with any .env. Treat the numbers as the
 * ceiling for ONE process on THIS machine: real endpoints add database time on top.
 */
import { readdirSync } from "node:fs";
import { buildApp } from "../backend/src/app.js";
import { defaultDocumentSettings, renderBusinessDocument, documentPageSize } from "../backend/src/shared/designs/index.js";
import { svgPagesToPdf } from "../backend/src/modules/idcards/pdf.js";

const app = buildApp();
app.log.level = "silent";
await app.listen({ port: 0, host: "127.0.0.1" });
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;

async function load(name: string, path: string, concurrency: number, seconds: number, headers: Record<string, string> = {}) {
  const latencies: number[] = [];
  let errors = 0;
  const stopAt = Date.now() + seconds * 1000;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < stopAt) {
        const t0 = performance.now();
        try {
          const res = await fetch(base + path, { headers });
          await res.arrayBuffer();
          if (!res.ok) errors++;
        } catch {
          errors++;
        }
        latencies.push(performance.now() - t0);
      }
    }),
  );
  const elapsed = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  console.log(
    `${name.padEnd(34)} conc=${String(concurrency).padEnd(4)} ${(latencies.length / elapsed).toFixed(0).padStart(6)} req/s  p50=${percentile(latencies, 50).toFixed(1)}ms  p95=${percentile(latencies, 95).toFixed(1)}ms  p99=${percentile(latencies, 99).toFixed(1)}ms  errors=${errors}`,
  );
}

const asset = readdirSync("../frontend/dist/assets").find((f) => f.endsWith(".js"));
console.log(`Node ${process.version}, ${process.platform}, single process\n`);
for (const concurrency of [10, 100, 500]) await load("GET /health (liveness)", "/health", concurrency, 4);
if (asset) await load("GET /assets/*.js (brotli, cached)", `/assets/${asset}`, 100, 4, { "accept-encoding": "br" });
await load("GET / (SPA index)", "/", 100, 4);
await load("GET /api/nope (404 + request id)", "/api/nope", 100, 4);

// PDF generation: CPU-heavy, run through the concurrency limiter.
const settings = { ...defaultDocumentSettings("invoice"), template: "wave" as const };
const business = { name: "Bench Co", logo: null, email: "a@b.c", phone: "1", address: "x", website: "w", taxNumber: null };
const content = {
  kind: "invoice" as const, number: "INV-1", status: "draft", issueDate: new Date(), client: { name: "Client" },
  items: Array.from({ length: 12 }, (_, i) => ({ description: `Line item ${i} with some descriptive text`, quantity: 2, unitPrice: 19.5 })),
  discount: 0, taxRate: 5, amountPaid: 0, customFields: [], currency: "SLE",
};
const size = documentPageSize(content, business, settings);
const runs = 60;
const t0 = performance.now();
const durations: number[] = [];
await Promise.all(
  Array.from({ length: runs }, async () => {
    const s = performance.now();
    await svgPagesToPdf(renderBusinessDocument(content, business, settings), size.width, size.height);
    durations.push(performance.now() - s);
  }),
);
const total = (performance.now() - t0) / 1000;
durations.sort((a, b) => a - b);
console.log(
  `\nPDF invoices, ${runs} at once (limiter=3): ${(runs / total).toFixed(1)} PDFs/s, p50=${percentile(durations, 50).toFixed(0)}ms p95=${percentile(durations, 95).toFixed(0)}ms (includes queue wait), rss=${(process.memoryUsage().rss / 1048576).toFixed(0)}MB`,
);

await app.close();
process.exit(0);
