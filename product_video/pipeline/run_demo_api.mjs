// Starts the backend against the DEMO database (settings in product_video/.demo.env), never the live one.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
for (const line of readFileSync(path.join(repo, "product_video/.demo.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
// The database drops idle connections now and then, which stops the API; start it again so recordings are not interrupted.
function start() {
  const child = spawn(process.execPath, [path.join(repo, "node_modules/tsx/dist/cli.mjs"), "src/server.ts"], {
    cwd: path.join(repo, "backend"),
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => {
    if (code === 0 || code === null) process.exit(0);
    console.log("API stopped (" + code + "), restarting in 2 seconds");
    setTimeout(start, 2000);
  });
}
start();
