import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

neonConfig.webSocketConstructor = ws;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  // Free idle connections, and fail fast instead of queueing forever when the database is slow.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // A runaway query or a forgotten open transaction must not hold a connection (or locks) for long. The restore turns the query limit off for itself.
  statement_timeout: 60_000,
  idle_in_transaction_session_timeout: 300_000,
});

// An idle connection that drops must not crash the process.
pool.on("error", (err) => {
  console.error("Database pool error", err);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
