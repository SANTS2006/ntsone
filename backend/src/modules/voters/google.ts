import { createPublicKey } from "node:crypto";
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

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

/** Checks a "Sign in with Google" ID token and returns the person's verified Google profile. */
export async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
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
  if (!payload.sub || typeof payload.email !== "string" || payload.email_verified !== true) {
    throw AppError.unauthorized("Your Google account's email address isn't verified");
  }
  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : payload.email.split("@")[0]!,
  };
}
