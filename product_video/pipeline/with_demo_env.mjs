// Runs a command with the DEMO database settings loaded in-process, and refuses to run if the URL is the live database.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = { ...process.env };
for (const line of readFileSync(path.join(repo, "product_video/.demo.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const live = (readFileSync(path.join(repo, ".env"), "utf8").match(/^DATABASE_URL=(.*)$/m) ?? [])[1] ?? "";
const host = (u) => (u.match(/@([^/?]+)/) ?? [])[1];
if (!env.DATABASE_URL || host(env.DATABASE_URL) === host(live)) {
  console.error("Refusing to run: the demo database URL is missing or is the live database.");
  process.exit(1);
}
console.log("Running against demo database host:", host(env.DATABASE_URL));
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { cwd: path.join(repo, "backend"), env, stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
