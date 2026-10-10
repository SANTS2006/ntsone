// Writes .br and .gz copies of the built text files so the server can send them
// compressed without spending CPU on every request.
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const COMPRESSIBLE = /\.(js|css|html|svg|json|webmanifest|txt|xml|woff)$/;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

let count = 0;
for await (const file of files(dist)) {
  if (!COMPRESSIBLE.test(file) || (await stat(file)).size < 1024) continue;
  const data = await readFile(file);
  await writeFile(`${file}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
  await writeFile(`${file}.gz`, gzipSync(data, { level: 9 }));
  count++;
}
console.log(`precompressed ${count} files`);
