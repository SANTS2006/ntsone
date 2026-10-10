import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "../modules/users/types.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  // Non-authoritative: authenticate() re-fetches the user row from the DB on
  // every request and never trusts this claim for access decisions. Carried
  // here only for defense-in-depth / log correlation.
  tenantId: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: "HS256", audience: "access", expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], audience: "access" }) as AccessTokenPayload;
}
