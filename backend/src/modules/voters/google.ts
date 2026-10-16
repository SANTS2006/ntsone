import { createHmac, createPublicKey, randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS: [string, string] = ["accounts.google.com", "https://accounts.google.com"];

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

let cache: { keys: Map<string, string>; expiresAt: number } | null = null;

/** Google's current signing keys as PEM, cached for as long as Google says they're good for. */
async function googleKeys(): Promise<Map<string, string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.keys;
  const response = await fetch(CERTS_URL);
  if (!response.ok) throw AppError.validation("Couldn't reach Google to check the sign-in. Please try again.");
  const { keys } = (await response.json()) as { keys: Jwk[] };
  const pems = new Map<string, string>();
  for (const key of keys) {
    pems.set(key.kid, createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: "jwk" }).export({ type: "spki", format: "pem" }).toString());
  }
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  cache = { keys: pems, expiresAt: Date.now() + maxAge * 1000 };
  return pems;
}

// A nonce ties a Google ID token to one sign-in attempt on this site: it is handed out just before the Google window opens,
// Google puts it inside the signed token, and it can be used once. A token that is stolen or replayed later is refused.
const NONCE_TTL_MS = 10 * 60_000;
const usedNonces = new Map<string, number>();
const nonceSignature = (body: string) => createHmac("sha256", `google-nonce:${env.JWT_SECRET}`).update(body).digest("hex");

export function issueGoogleNonce(): string {
  const body = `${randomBytes(16).toString("hex")}.${Date.now().toString(36)}`;
  return `${body}.${nonceSignature(body)}`;
}

function consumeGoogleNonce(nonce: unknown) {
  const fail = () => AppError.unauthorized("This Google sign-in has expired or was already used. Please try again.");
  if (typeof nonce !== "string") throw fail();
  const [raw, time, signature] = nonce.split(".");
  if (!raw || !time || !signature) throw fail();
  const expected = Buffer.from(nonceSignature(`${raw}.${time}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw fail();
  const issuedAt = parseInt(time, 36);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > NONCE_TTL_MS || issuedAt > Date.now() + 60_000) throw fail();
  const now = Date.now();
  if (usedNonces.size > 2000) for (const [key, at] of usedNonces) if (now - at > NONCE_TTL_MS) usedNonces.delete(key);
  if (usedNonces.has(nonce)) throw fail();
  usedNonces.set(nonce, now);
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

/** Checks a "Sign in with Google" ID token and returns the person's verified Google profile. */
export async function verifyGoogleCredential(credential: string, options: { requireNonce?: boolean } = {}): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) throw AppError.validation("Google sign-in isn't set up yet");
  const decoded = jwt.decode(credential, { complete: true });
  const kid = decoded && typeof decoded === "object" ? decoded.header.kid : undefined;
  if (!kid) throw AppError.unauthorized("Google sign-in didn't work. Please try again.");

  let pem = (await googleKeys()).get(kid);
  if (!pem) {
    // Google rotated its keys since they were cached.
    cache = null;
    pem = (await googleKeys()).get(kid);
  }
  if (!pem) throw AppError.unauthorized("Google sign-in didn't work. Please try again.");

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(credential, pem, { algorithms: ["RS256"], audience: env.GOOGLE_CLIENT_ID, issuer: ISSUERS }) as jwt.JwtPayload;
  } catch {
    throw AppError.unauthorized("Google sign-in has expired. Please try again.");
  }
  if (options.requireNonce) consumeGoogleNonce(payload.nonce);
  if (!payload.sub || typeof payload.email !== "string" || payload.email_verified !== true) {
    throw AppError.unauthorized("Your Google account's email address isn't verified");
  }
  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : payload.email.split("@")[0]!,
  };
}
