import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import type { Readable } from "node:stream";

// Backup file layout (everything after the header is ciphertext):
//   "NTSBK1" (6 bytes) | salt (16) | iv (12) | AES-256-GCM ciphertext of the gzip-compressed dump | auth tag (16)
// The key is derived from BACKUP_ENCRYPTION_KEY with HKDF and a fresh random salt per file, so no two files share a key.
// Without a key (development only) the file is the plain gzip stream.
const MAGIC = Buffer.from("NTSBK1");
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN;

export const MIN_KEY_LENGTH = 32;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), salt, "ntsbk-v1-aes-256-gcm", 32));
}

export function isKeyUsable(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.trim().length >= MIN_KEY_LENGTH;
}

/** Compresses `source` and encrypts it into `destPath` (or leaves it unencrypted when no key is given). */
export async function packToFile(source: Readable, destPath: string, key?: string): Promise<void> {
  const out = createWriteStream(destPath, { mode: 0o600 });
  if (!key) {
    await pipeline(source, createGzip({ level: 6 }), out);
    return;
  }
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(key, salt), iv);
  out.write(Buffer.concat([MAGIC, salt, iv]));
  // pipeline would end `out` before the tag is appended, so write the tag from the cipher's end.
  await new Promise<void>((resolve, reject) => {
    const gzip = createGzip({ level: 6 });
    cipher.on("error", reject);
    out.on("error", reject);
    source.on("error", reject);
    gzip.on("error", reject);
    cipher.on("data", (chunk) => {
      if (!out.write(chunk)) {
        cipher.pause();
        out.once("drain", () => cipher.resume());
      }
    });
    cipher.on("end", () => {
      out.end(cipher.getAuthTag(), resolve);
    });
    source.pipe(gzip).pipe(cipher);
  });
}

/** A readable stream of the original (decompressed, decrypted) dump. Fails with an error if the file was altered or the key is wrong. */
export async function unpackFile(filePath: string, key?: string): Promise<Readable> {
  const info = await stat(filePath);
  const handle = await open(filePath, "r");
  const head = Buffer.alloc(MAGIC.length);
  await handle.read(head, 0, head.length, 0);
  if (!head.equals(MAGIC)) {
    await handle.close();
    return createReadStream(filePath).pipe(createGunzip());
  }
  if (!isKeyUsable(key)) {
    await handle.close();
    throw new Error("This backup is encrypted and BACKUP_ENCRYPTION_KEY is not set");
  }
  if (info.size < HEADER_LEN + TAG_LEN) {
    await handle.close();
    throw new Error("The backup file is too short to be valid");
  }
  const header = Buffer.alloc(HEADER_LEN);
  await handle.read(header, 0, HEADER_LEN, 0);
  const tag = Buffer.alloc(TAG_LEN);
  await handle.read(tag, 0, TAG_LEN, info.size - TAG_LEN);
  await handle.close();
  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_LEN);
  const iv = header.subarray(MAGIC.length + SALT_LEN);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(key, salt), iv);
  decipher.setAuthTag(tag);
  const raw = createReadStream(filePath, { start: HEADER_LEN, end: info.size - TAG_LEN - 1 });
  const gunzip = createGunzip();
  // Errors anywhere in the chain (wrong key, tampering) must reach the consumer of the final stream.
  raw.on("error", (e) => gunzip.destroy(e));
  decipher.on("error", (e) => gunzip.destroy(e));
  raw.pipe(decipher).pipe(gunzip);
  return gunzip;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), async function* (source) {
    for await (const chunk of source) {
      hash.update(chunk as Buffer);
      yield chunk;
    }
  }, async (sink) => {
    for await (const _ of sink) void _;
  });
  return hash.digest("hex");
}
