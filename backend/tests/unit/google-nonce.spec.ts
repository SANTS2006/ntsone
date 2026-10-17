import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL = "https://app.example.test";
process.env.API_URL = "https://app.example.test";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";
process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string; kty: string };

const google = await import("../../src/modules/voters/google.js");

const token = (claims: Record<string, unknown>, options: jwt.SignOptions = {}) =>
  jwt.sign(
    { sub: "g1", email: "ada@example.test", email_verified: true, name: "Ada", iss: "https://accounts.google.com", aud: "client-123.apps.googleusercontent.com", ...claims },
    privateKey,
    { algorithm: "RS256", keyid: "k1", expiresIn: "1h", ...options },
  );

vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ keys: [{ kid: "k1", kty: jwk.kty, n: jwk.n, e: jwk.e }] }), { status: 200, headers: { "cache-control": "max-age=600" } })),
);
afterEach(() => vi.useRealTimers());

const USED = /expired or was already used/;

describe("checking a Google token", () => {
  it("accepts a token carrying a fresh nonce exactly once", async () => {
    const nonce = google.issueGoogleNonce();
    const profile = await google.verifyGoogleCredential(token({ nonce }), { requireNonce: true });
    expect(profile).toMatchObject({ email: "ada@example.test", googleId: "g1" });
    await expect(google.verifyGoogleCredential(token({ nonce }), { requireNonce: true })).rejects.toThrow(USED);
  });

  it("refuses a token with no nonce, a made-up nonce, or a forged one", async () => {
    await expect(google.verifyGoogleCredential(token({}), { requireNonce: true })).rejects.toThrow(USED);
    await expect(google.verifyGoogleCredential(token({ nonce: "abc-def-ghi" }), { requireNonce: true })).rejects.toThrow(USED);
    const [raw, time] = google.issueGoogleNonce().split("-");
    await expect(google.verifyGoogleCredential(token({ nonce: `${raw}-${time}-${"0".repeat(24)}` }), { requireNonce: true })).rejects.toThrow(USED);
  });

  it("refuses an old nonce", async () => {
    const nonce = google.issueGoogleNonce();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11 * 60_000);
    await expect(google.verifyGoogleCredential(token({ nonce }, { expiresIn: "2h" }), { requireNonce: true })).rejects.toThrow(USED);
  });

  it("refuses a token for another app, from another issuer, with an unverified email, or already expired", async () => {
    await expect(google.verifyGoogleCredential(token({ aud: "someone-else" }))).rejects.toThrow(/expired|didn't work/);
    await expect(google.verifyGoogleCredential(token({ iss: "https://evil.example" }))).rejects.toThrow(/expired|didn't work/);
    await expect(google.verifyGoogleCredential(token({ email_verified: false }))).rejects.toThrow(/isn't verified/);
    await expect(google.verifyGoogleCredential(token({}, { expiresIn: "-1h" }))).rejects.toThrow(/expired/);
  });

  it("refuses a token signed by anyone but Google", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const forged = jwt.sign({ sub: "g1", email: "ada@example.test", email_verified: true, iss: "https://accounts.google.com", aud: "client-123.apps.googleusercontent.com" }, other, { algorithm: "RS256", keyid: "k1", expiresIn: "1h" });
    await expect(google.verifyGoogleCredential(forged)).rejects.toThrow(/expired|didn't work/);
    const unsigned = jwt.sign({ sub: "g1", email: "ada@example.test", email_verified: true }, "", { algorithm: "none" as never, keyid: "k1" });
    await expect(google.verifyGoogleCredential(unsigned)).rejects.toThrow();
  });
});
