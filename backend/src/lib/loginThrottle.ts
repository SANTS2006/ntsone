import { AppError } from "./errors.js";

// After too many wrong passwords for one account, sign-in for it is paused for a while, however many
// addresses the guesses come from. (The per-address limit on /auth/login stops one address; this stops
// a spread-out guessing attack on one account.) Kept in memory per server instance; each instance
// counts separately, which still caps the damage while keeping sign-in free of extra database calls.

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 20_000;

const failures = new Map<string, { count: number; first: number }>();

const keyOf = (email: string) => email.trim().toLowerCase();

export function assertLoginAllowed(email: string) {
  const entry = failures.get(keyOf(email));
  if (!entry) return;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(keyOf(email));
    return;
  }
  if (entry.count >= MAX_FAILURES) {
    throw new AppError("RATE_LIMITED", "Too many failed sign-in attempts. Please wait a few minutes, or reset your password.", 429);
  }
}

export function recordLoginFailure(email: string) {
  const key = keyOf(email);
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now - entry.first > WINDOW_MS) failures.set(key, { count: 1, first: now });
  else entry.count++;
  if (failures.size > MAX_TRACKED) {
    for (const [k, v] of failures) {
      if (now - v.first > WINDOW_MS) failures.delete(k);
      if (failures.size <= MAX_TRACKED * 0.9) break;
    }
  }
}

export function clearLoginFailures(email: string) {
  failures.delete(keyOf(email));
}
