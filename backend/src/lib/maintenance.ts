import { and, isNotNull, lt, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailVerificationCodes, passwordResetTokens, refreshTokens, voterEmailCodes } from "../db/schema/index.js";
import { pruneOutbox } from "../modules/email/outbox.js";
import { pruneIdempotencyKeys } from "./idempotency.js";

const SIX_HOURS = 6 * 60 * 60_000;

/**
 * Deletes data that is only useful for a short time: expired sign-in sessions and one-time codes,
 * old idempotency keys, delivered emails. Safe to run from every instance at once (they are plain
 * deletes), so no coordination is needed.
 */
export async function runMaintenance(log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void } = console) {
  const day = new Date(Date.now() - 86_400_000);
  const steps: [string, () => Promise<unknown>][] = [
    ["refresh tokens", () => db.delete(refreshTokens).where(or(lt(refreshTokens.expiresAt, day), and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt, day))))],
    ["password reset tokens", () => db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, day))],
    ["email verification codes", () => db.delete(emailVerificationCodes).where(lt(emailVerificationCodes.expiresAt, day))],
    ["voter codes", () => db.delete(voterEmailCodes).where(lt(voterEmailCodes.expiresAt, day))],
    ["idempotency keys", pruneIdempotencyKeys],
    ["email outbox", pruneOutbox],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      log.error(`Maintenance step failed (${name})`, err);
    }
  }
}

/** Runs the clean-up shortly after start and then every six hours. Returns a function that stops it. */
export function startMaintenance(log?: Parameters<typeof runMaintenance>[0]): () => void {
  const first = setTimeout(() => void runMaintenance(log), 60_000);
  const repeat = setInterval(() => void runMaintenance(log), SIX_HOURS);
  first.unref();
  repeat.unref();
  return () => {
    clearTimeout(first);
    clearInterval(repeat);
  };
}
