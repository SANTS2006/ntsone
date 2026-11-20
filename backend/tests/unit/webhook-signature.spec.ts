import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../../src/modules/payments/webhookSignature.js";

const secret = "whsec_test_secret";
const body = JSON.stringify({ event: { name: "payment.created" }, data: { id: "pay_1" } });
const sign = (t: number, payload = body) => createHmac("sha256", secret).update(`${t}_${payload}`).digest("base64");

describe("Monime webhook signature (t=<unix>,v1=<base64> over '<t>_<body>')", () => {
  const now = 1_800_000_000;
  const header = (t: number, payload = body) => `t=${t},v1=${sign(t, payload)}`;

  it("accepts a correctly signed message", () => {
    expect(verifyWebhookSignature({ rawBody: body, secret, header: header(now), nowSeconds: now })).toBe("valid");
  });
  it("refuses a changed body", () => {
    expect(verifyWebhookSignature({ rawBody: body + " ", secret, header: header(now), nowSeconds: now })).toBe("invalid");
  });
  it("refuses a wrong secret", () => {
    expect(verifyWebhookSignature({ rawBody: body, secret: "other", header: header(now), nowSeconds: now })).toBe("invalid");
  });
  it("refuses a message older than 5 minutes (replay)", () => {
    expect(verifyWebhookSignature({ rawBody: body, secret, header: header(now - 301), nowSeconds: now })).toBe("invalid");
  });
  it("refuses a timestamp more than a minute ahead", () => {
    expect(verifyWebhookSignature({ rawBody: body, secret, header: header(now + 61), nowSeconds: now })).toBe("invalid");
  });
  it("reports a missing header as absent", () => {
    expect(verifyWebhookSignature({ rawBody: body, secret, header: undefined, nowSeconds: now })).toBe("absent");
  });
});
