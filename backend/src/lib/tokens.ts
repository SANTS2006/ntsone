import { randomBytes, randomInt, createHash } from "node:crypto";

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

// No 0/O, 1/I/L: the code is read off an email and typed by hand.
const VERIFICATION_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateVerificationCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += VERIFICATION_ALPHABET[randomInt(VERIFICATION_ALPHABET.length)];
  }
  return code;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function addDuration(base: Date, duration: string): Date {
  const match = /^(\d+)\s*(m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: ${duration}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] as "m" | "h" | "d";
  const msPerUnit = {
    m: 60_000,
    h: 60 * 60_000,
    d: 24 * 60 * 60_000,
  } as const satisfies Record<"m" | "h" | "d", number>;
  return new Date(base.getTime() + amount * msPerUnit[unit]);
}
