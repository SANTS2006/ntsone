import { createHmac, timingSafeEqual } from "node:crypto";

// Monime signs its webhooks (header "Monime-Signature", HMAC-SHA256 with the secret set on the webhook), but its
// public documentation does not yet spell out the exact layout of that header. So this accepts the layouts such
// signatures normally take, compares in constant time, and rejects stale timestamps. It is only one layer: a
// webhook never decides anything by itself. Whatever it claims, the platform asks Monime directly what happened.

export type SignatureResult = "valid" | "invalid" | "absent";

const TOLERANCE_SECONDS = 5 * 60;

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function digestMatches(candidate: string, expected: Buffer): boolean {
  const value = candidate.trim().replace(/^sha256=/i, "");
  if (/^[0-9a-f]{64}$/i.test(value)) return safeEqual(Buffer.from(value, "hex"), expected);
  try {
    return safeEqual(Buffer.from(value, "base64"), expected) || safeEqual(Buffer.from(value, "base64url"), expected);
  } catch {
    return false;
  }
}

export function verifyWebhookSignature(params: {
  rawBody: string;
  secret: string;
  header: string | undefined;
  /** A timestamp sent in a separate header, if there is one. */
  timestampHeader?: string;
  nowSeconds?: number;
}): SignatureResult {
  const { rawBody, secret, header } = params;
  if (!secret || !header) return "absent";
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);

  // "t=1725018144,v1=abcdef..." (or with several v1 values), or just the digest itself.
  const parts = header.split(",").map((part) => part.trim());
  const keyed = parts.map((part) => part.split("=", 2) as [string, string | undefined]);
  const timestamp = keyed.find(([key]) => key === "t")?.[1] ?? params.timestampHeader;
  const signatures = keyed.filter(([key]) => /^v\d+$/.test(key)).map(([, value]) => value ?? "");
  if (signatures.length === 0) signatures.push(header);

  if (timestamp && /^\d+$/.test(timestamp) && Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return "invalid";

  const signedStrings = timestamp ? [`${timestamp}.${rawBody}`, `${timestamp}${rawBody}`, rawBody] : [rawBody];
  for (const signed of signedStrings) {
    const expected = createHmac("sha256", secret).update(signed).digest();
    if (signatures.some((candidate) => digestMatches(candidate, expected))) return "valid";
  }
  return "invalid";
}
