import { createHash, createHmac } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env, isProduction } from "../../config/env.js";

/** Where backup files are kept. Everything the rest of the code needs is here, so the place can change without touching the backup logic. */
export interface BackupStorageProvider {
  readonly name: "local" | "s3";
  put(key: string, filePath: string): Promise<void>;
  getToFile(key: string, destPath: string): Promise<void>;
  /** The size of the stored file, or null when it is not there. */
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------- local disk (development)

export class LocalBackupStorage implements BackupStorageProvider {
  readonly name = "local" as const;
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid backup key");
    return full;
  }
  async put(key: string, filePath: string) {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
    await copyFile(filePath, dest);
  }
  async getToFile(key: string, destPath: string) {
    await copyFile(this.resolve(key), destPath);
  }
  async head(key: string) {
    try {
      return { size: (await stat(this.resolve(key))).size };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

// ---------------------------------------------------------------- S3-compatible storage (production)

const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const encodeRfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SigV4Input {
  method: string;
  url: URL;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  now: Date;
  /** S3 wants the payload hash sent as a header too. */
  includeContentSha?: boolean;
  headers?: Record<string, string>;
}

/** AWS Signature Version 4. Returns the headers to send. (Exported so it can be checked against AWS's published test vectors.) */
export function signV4(input: SigV4Input): Record<string, string> {
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...(input.headers ?? {}), host: input.url.host, "x-amz-date": amzDate };
  if (input.includeContentSha) headers["x-amz-content-sha256"] = input.payloadHash;
  const names = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalPath =
    input.url.pathname
      .split("/")
      .map((segment) => encodeRfc3986(decodeURIComponent(segment)))
      .join("/") || "/";
  const query = [...input.url.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = [input.method, canonicalPath, query, canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const signingKey = hmac(hmac(hmac(kDate, input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const S3_TIMEOUT_MS = 10 * 60_000;

export class S3BackupStorage implements BackupStorageProvider {
  readonly name = "s3" as const;
  constructor(private readonly cfg: S3Config) {}

  private urlFor(key: string): URL {
    const objectKey = [this.cfg.prefix.replace(/^\/+|\/+$/g, ""), key].filter(Boolean).join("/");
    const base = new URL(this.cfg.endpoint);
    const encoded = objectKey.split("/").map(encodeRfc3986).join("/");
    if (this.cfg.forcePathStyle) return new URL(`${base.origin}/${this.cfg.bucket}/${encoded}`);
    return new URL(`${base.protocol}//${this.cfg.bucket}.${base.host}/${encoded}`);
  }

  private async call(method: string, key: string, opts: { payloadHash: string; body?: Readable; length?: number }) {
    const url = this.urlFor(key);
    const headers = signV4({
      method,
      url,
      region: this.cfg.region,
      service: "s3",
      accessKeyId: this.cfg.accessKeyId,
      secretAccessKey: this.cfg.secretAccessKey,
      payloadHash: opts.payloadHash,
      now: new Date(),
      includeContentSha: true,
    });
    if (opts.length !== undefined) headers["content-length"] = String(opts.length);
    const init: RequestInit & { duplex?: "half" } = { method, headers, signal: AbortSignal.timeout(S3_TIMEOUT_MS) };
    if (opts.body) {
      init.body = Readable.toWeb(opts.body) as never;
      init.duplex = "half";
    }
    return fetch(url, init);
  }

  async put(key: string, filePath: string) {
    const size = (await stat(filePath)).size;
    const res = await this.call("PUT", key, { payloadHash: "UNSIGNED-PAYLOAD", body: createReadStream(filePath), length: size });
    if (!res.ok) throw new Error(`Backup storage refused the upload (HTTP ${res.status})`);
    await res.arrayBuffer().catch(() => undefined);
  }
  async getToFile(key: string, destPath: string) {
    const res = await this.call("GET", key, { payloadHash: sha256Hex("") });
    if (!res.ok || !res.body) throw new Error(`Backup storage could not provide the file (HTTP ${res.status})`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath, { mode: 0o600 }));
  }
  async head(key: string) {
    const res = await this.call("HEAD", key, { payloadHash: sha256Hex("") });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Backup storage check failed (HTTP ${res.status})`);
    return { size: Number(res.headers.get("content-length") ?? 0) };
  }
  async delete(key: string) {
    const res = await this.call("DELETE", key, { payloadHash: sha256Hex("") });
    if (!res.ok && res.status !== 404) throw new Error(`Backup storage could not delete the file (HTTP ${res.status})`);
    await res.arrayBuffer().catch(() => undefined);
  }
}

// ---------------------------------------------------------------- choosing one

export interface StorageStatus {
  provider: BackupStorageProvider | null;
  kind: "local" | "s3";
  /** Why backups cannot run, in words for a super admin. Null when everything needed is set. */
  problem: string | null;
}

let cached: StorageStatus | undefined;

export function getBackupStorage(): StorageStatus {
  if (cached) return cached;
  if (env.BACKUP_STORAGE === "s3") {
    const missing = [
      ["BACKUP_S3_ENDPOINT", env.BACKUP_S3_ENDPOINT],
      ["BACKUP_S3_BUCKET", env.BACKUP_S3_BUCKET],
      ["BACKUP_S3_ACCESS_KEY_ID", env.BACKUP_S3_ACCESS_KEY_ID],
      ["BACKUP_S3_SECRET_ACCESS_KEY", env.BACKUP_S3_SECRET_ACCESS_KEY],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);
    cached = missing.length
      ? { provider: null, kind: "s3", problem: `Backup storage is not fully set up. Missing: ${missing.join(", ")}.` }
      : {
          provider: new S3BackupStorage({
            endpoint: env.BACKUP_S3_ENDPOINT,
            region: env.BACKUP_S3_REGION,
            bucket: env.BACKUP_S3_BUCKET,
            prefix: env.BACKUP_S3_PREFIX,
            accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
            secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
            forcePathStyle: env.BACKUP_S3_FORCE_PATH_STYLE,
          }),
          kind: "s3",
          problem: null,
        };
  } else if (isProduction && !env.BACKUP_ALLOW_LOCAL_IN_PRODUCTION) {
    cached = {
      provider: null,
      kind: "local",
      problem: "Backups need durable storage. The server's own disk is erased on every deploy, so set BACKUP_STORAGE=s3 and its settings.",
    };
  } else {
    cached = { provider: new LocalBackupStorage(env.BACKUP_LOCAL_DIR || path.resolve(process.cwd(), ".backups")), kind: "local", problem: null };
  }
  return cached;
}
