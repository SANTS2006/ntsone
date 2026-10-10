import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(configDir, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Deliberately not named PORT: some dev/hosting tooling injects a generic PORT env
  // var into every child process in this monorepo (including the Vite frontend, which
  // ignores it), and a same-named var here would silently steal that value and collide
  // with Vite's own dev-server port.
  API_PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("ntsone"),

  BREVO_API_KEY: z.string().optional().default(""),
  EMAIL_FROM_NAME: z.string().default("NTSOne"),
  EMAIL_FROM_ADDRESS: z.string().default("no-reply@example.com"),

  // OAuth client ID from Google Cloud Console; the "Sign in with Google" button only shows when set.
  GOOGLE_CLIENT_ID: z.string().optional().default(""),

  // Most connections one server instance keeps to the database. Keep (instances x this) below the
  // database's connection limit.
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  // ---- Payments through Monime (https://docs.monime.io). Everything is optional: with no access token
  // the payment features simply stay switched off. Keep the token and secrets only in the hosting settings. ----
  // Pasted values often carry a trailing space or line break, quotes, or a leading "Bearer ": all are removed.
  MONIME_ACCESS_TOKEN: z
    .string()
    .optional()
    .default("")
    .transform((v) => v.trim().replace(/^["']+|["']+$/g, "").replace(/^Bearers+/i, "").trim()),
  MONIME_SPACE_ID: z
    .string()
    .optional()
    .default("")
    .transform((v) => v.trim().replace(/^["']+|["']+$/g, "").trim()),
  MONIME_API_BASE: z.string().trim().url().default("https://api.monime.io/v1"),
  MONIME_API_VERSION: z.string().default("caph.2025-08-23"),
  // The secret set on the webhook in the Monime dashboard (at least 32 characters).
  MONIME_WEBHOOK_SECRET: z.string().optional().default(""),
  // When "true", a webhook whose signature can't be verified is refused. Off by default: either way a
  // webhook only prompts us to ask Monime directly what happened, and the answer is what counts.
  MONIME_WEBHOOK_STRICT: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // Payers may only be sent to pages on these hosts (and their subdomains).
  MONIME_REDIRECT_HOSTS: z.string().default("monime.io,monime.app"),
  // Card and bank payments are off unless switched on; mobile money (Orange, Africell, QMoney) is always on.
  MONIME_ALLOW_CARDS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  MONIME_ALLOW_BANKS: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // What the platform keeps from each payment: a percentage plus a fixed amount in Leones.
  PAYMENTS_FEE_PERCENT: z.coerce.number().min(0).max(30).default(5),
  PAYMENTS_FEE_FIXED: z.coerce.number().min(0).default(0),
  // Money from a payment can't be withdrawn until this many hours have passed (time to spot problems).
  PAYMENTS_HOLD_MINUTES: z.coerce.number().min(0).max(60 * 24 * 30).default(5),
  // The largest single payment accepted, in Leones.
  PAYMENTS_MAX_AMOUNT: z.coerce.number().positive().default(10_000_000),
  // Withdrawals: smallest, largest per day, the size above which a person on our team must approve it, and how long a new account waits.
  PAYOUT_MIN_AMOUNT: z.coerce.number().positive().default(50),
  PAYOUT_DAILY_LIMIT: z.coerce.number().positive().default(5_000_000),
  PAYOUT_REVIEW_ABOVE: z.coerce.number().min(0).default(1_000_000),
  // How long after a payment it can still be refunded.
  // A payment can be refunded this many minutes after it was received (time for it to settle and for mistakes to show).
  REFUND_DELAY_MINUTES: z.coerce.number().int().min(0).max(24 * 60).default(3),
  REFUND_WINDOW_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  PAYOUT_NEW_ACCOUNT_MINUTES: z.coerce.number().min(0).max(60 * 24 * 14).default(3),

  // ---- Backup and recovery. Backups are encrypted files kept OUTSIDE the server (the server's own disk is erased on every
  // deploy). Keep the key and storage credentials only in the hosting settings; lose the key and the backups cannot be read. ----
  BACKUP_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  // "s3" works with Amazon S3, Cloudflare R2, Backblaze B2, MinIO and anything that speaks the S3 protocol. "local" is for development.
  BACKUP_STORAGE: z.enum(["local", "s3"]).default("local"),
  BACKUP_LOCAL_DIR: z.string().default(""),
  // Local storage inside a production server loses backups on every deploy, so it is refused unless this is "true".
  BACKUP_ALLOW_LOCAL_IN_PRODUCTION: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  BACKUP_S3_ENDPOINT: z.string().optional().default(""),
  BACKUP_S3_REGION: z.string().default("auto"),
  BACKUP_S3_BUCKET: z.string().optional().default(""),
  BACKUP_S3_PREFIX: z.string().default("database-backups"),
  BACKUP_S3_ACCESS_KEY_ID: z.string().optional().default(""),
  BACKUP_S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  BACKUP_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  // At least 32 characters of random text (for example the output of: openssl rand -base64 48). Backups are AES-256-GCM encrypted with it.
  BACKUP_ENCRYPTION_KEY: z.string().optional().default(""),
  // Defaults for the retention policy (a super admin can change them on the Backups page): keep backups for this many days,
  // but always keep at least the newest BACKUP_KEEP_LATEST verified ones.
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  BACKUP_KEEP_LATEST: z.coerce.number().int().min(1).max(365).default(7),
  // The daily automatic backup starts at this hour (UTC, 0-23) on whichever instance gets there first.
  BACKUP_SCHEDULE_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(2),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
