import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// Never reach a real database or Monime from these tests.
process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";
process.env.MONIME_ACCESS_TOKEN = "mon-test-token-should-never-leak";
process.env.MONIME_SPACE_ID = "spc-test";
process.env.PAYMENTS_MAX_AMOUNT = "1000000";

const { leonesToMinor, platformFee, formatMinor } = await import("../../src/lib/money.js");
const pricing = await import("../../src/modules/payments/pricing.js");
const { chargePlanFor } = await import("../../src/modules/payments/charge.js");
const { verifyWebhookSignature } = await import("../../src/modules/payments/webhookSignature.js");
const monime = await import("../../src/modules/payments/monime.js");
const { normalizePhone } = await import("../../src/modules/payments/payouts.js");
const { assertDocumentsUnlocked } = await import("../../src/modules/payments/gate.js");

describe("money", () => {
  it("keeps amounts as whole cents", () => {
    expect(leonesToMinor(1250.5)).toBe(125050);
    expect(leonesToMinor(0.1 + 0.2)).toBe(30);
    expect(() => leonesToMinor(-1)).toThrow();
    expect(() => leonesToMinor(Number.NaN)).toThrow();
    expect(formatMinor(125050)).toBe("NLe 1,250.50");
  });
  it("takes the platform fee, never more than the payment", () => {
    expect(platformFee(100_000, 2.5, 0)).toBe(2_500);
    expect(platformFee(100_000, 2.5, 100)).toBe(2_600);
    expect(platformFee(50, 0, 100)).toBe(50);
    expect(platformFee(100_000, 0, 0)).toBe(0);
  });
});

describe("what a registration or order costs", () => {
  const catalogue = [
    { id: "rice", name: "Rice 25kg", priceMinor: 40_000, maxQuantity: 5 },
    { id: "oil", name: "Palm oil", priceMinor: 12_550 },
  ];
  const program = { kind: "program", idCardEnabled: true, ticketEnabled: true, paymentConfig: { enabled: true, registrationFeeMinor: 5_000, idCardPriceMinor: 2_000, ticketPriceMinor: 0, feeAccepted: { percent: 5, at: "2026-10-04T00:00:00Z", by: "u1" } } };

  it("charges the fee and the ID card, but not a free ticket", () => {
    const plan = chargePlanFor(program, { orderItems: [] }, undefined)!;
    expect(plan.lines.map((l) => l.id)).toEqual(["registration", "id_card"]);
    expect(plan.totalMinor).toBe(7_000);
    expect(plan.charge).toBe(true);
  });

  it("charges nothing for the ID card when the program has none", () => {
    const plan = chargePlanFor({ ...program, idCardEnabled: false }, { orderItems: [] }, undefined)!;
    expect(plan.totalMinor).toBe(5_000);
  });

  it("does nothing when payments are off", () => {
    expect(chargePlanFor({ ...program, paymentConfig: { enabled: false } }, { orderItems: [] }, undefined)).toBeNull();
  });

  it("prices an order from the server's own list, never from the browser", () => {
    const order = { ...program, kind: "order_form" };
    const plan = chargePlanFor(order, { orderItems: catalogue }, [{ itemId: "rice", quantity: 2 }, { itemId: "oil", quantity: 1 }])!;
    expect(plan.totalMinor).toBe(2 * 40_000 + 12_550);
    expect(plan.lines[0]).toMatchObject({ name: "Rice 25kg", unitMinor: 40_000, quantity: 2 });
  });

  it("merges repeated items and enforces limits", () => {
    const order = { ...program, kind: "order_form" };
    const plan = chargePlanFor(order, { orderItems: catalogue }, [{ itemId: "oil", quantity: 1 }, { itemId: "oil", quantity: 2 }])!;
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]!.quantity).toBe(3);
    expect(() => chargePlanFor(order, { orderItems: catalogue }, [{ itemId: "rice", quantity: 6 }])).toThrow(/at most 5/);
  });

  it("refuses unknown items, an empty order, and a total above the largest payment", () => {
    const order = { ...program, kind: "order_form" };
    expect(() => chargePlanFor(order, { orderItems: catalogue }, [{ itemId: "ghost", quantity: 1 }])).toThrow(/no longer available/);
    expect(() => chargePlanFor(order, { orderItems: catalogue }, [])).toThrow(/at least one item/);
    const big = [{ id: "car", name: "Car", priceMinor: pricing.MAX_PAYMENT_MINOR }];
    expect(() => chargePlanFor(order, { orderItems: big }, [{ itemId: "car", quantity: 2 }])).toThrow(/largest payment/);
  });

  it("an order form with items but payments off still records the order", () => {
    const order = { ...program, kind: "order_form", paymentConfig: { enabled: false } };
    const plan = chargePlanFor(order, { orderItems: catalogue }, [{ itemId: "oil", quantity: 1 }])!;
    expect(plan.charge).toBe(false);
    expect(plan.totalMinor).toBe(12_550);
  });

  it("validates the catalogue", () => {
    expect(pricing.orderItemsSchema.safeParse([{ id: "a", name: "A", priceMinor: 0 }]).success).toBe(false);
    expect(pricing.orderItemsSchema.safeParse([{ id: "a", name: "A", priceMinor: 100 }, { id: "a", name: "B", priceMinor: 100 }]).success).toBe(false);
    expect(pricing.orderItemsSchema.safeParse([{ id: "a b", name: "A", priceMinor: 100 }]).success).toBe(false);
    expect(pricing.orderItemsSchema.safeParse([{ id: "a", name: "A", priceMinor: 100, imageUrl: "https://evil.example/x.png" }]).success).toBe(false);
  });
});

describe("webhook signatures", () => {
  const secret = "s".repeat(40);
  const body = JSON.stringify({ event: { id: "e1", name: "checkout_session.completed" } });
  const now = 1_725_018_144;
  const hmac = (signed: string) => createHmac("sha256", secret).update(signed).digest("hex");

  it("accepts a timestamped signature, and a plain digest", () => {
    const header = `t=${now},v1=${hmac(`${now}.${body}`)}`;
    expect(verifyWebhookSignature({ rawBody: body, secret, header, nowSeconds: now + 10 })).toBe("valid");
    expect(verifyWebhookSignature({ rawBody: body, secret, header: hmac(body), nowSeconds: now })).toBe("valid");
  });

  it("rejects a changed body, a wrong secret and a stale timestamp", () => {
    const header = `t=${now},v1=${hmac(`${now}.${body}`)}`;
    expect(verifyWebhookSignature({ rawBody: body + " ", secret, header, nowSeconds: now })).toBe("invalid");
    expect(verifyWebhookSignature({ rawBody: body, secret: "x".repeat(40), header, nowSeconds: now })).toBe("invalid");
    expect(verifyWebhookSignature({ rawBody: body, secret, header, nowSeconds: now + 3600 })).toBe("invalid");
  });

  it("reports absent when there is nothing to check", () => {
    expect(verifyWebhookSignature({ rawBody: body, secret: "", header: "x" })).toBe("absent");
    expect(verifyWebhookSignature({ rawBody: body, secret, header: undefined })).toBe("absent");
  });
});

describe("the Monime client", () => {
  afterEach(() => vi.unstubAllGlobals());

  const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "monime-request-id": "req-1" } });

  it("sends the token, space id and an idempotency key, with prices in cents", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, result: { id: "cs-1", status: "pending", redirectUrl: "https://pay.monime.io/x" } }));
    vi.stubGlobal("fetch", fetchMock);
    await monime.createCheckoutSession({
      idempotencyKey: "11111111-2222-3333-4444-555555555555",
      name: "Demo",
      reference: "pay-1",
      successUrl: "https://app/ok",
      cancelUrl: "https://app/no",
      lineItems: [{ name: "Ticket", unitMinor: 15000, quantity: 2, reference: "ticket" }],
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(String(url)).toBe("https://api.monime.io/v1/checkout-sessions");
    expect(headers.Authorization).toBe("Bearer mon-test-token-should-never-leak");
    expect(headers["Monime-Space-Id"]).toBe("spc-test");
    expect(headers["Idempotency-Key"]).toBe("11111111-2222-3333-4444-555555555555");
    const body = JSON.parse(String(init.body));
    expect(body.lineItems[0].price).toEqual({ currency: "SLE", value: 15000 });
    expect(body.paymentOptions.momo.disable).toBe(false);
    expect(body.paymentOptions.card.disable).toBe(true);
  });

  it("retries a server error with the same key, and gives up on a client error", async () => {
    const calls: Record<string, string>[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_u: unknown, init: RequestInit) => {
        calls.push(init.headers as Record<string, string>);
        return jsonResponse(503, { success: false });
      })
      .mockImplementationOnce(async (_u: unknown, init: RequestInit) => {
        calls.push(init.headers as Record<string, string>);
        return jsonResponse(200, { success: true, result: { id: "p-1", status: "pending" } });
      });
    vi.stubGlobal("fetch", fetchMock);
    const out = await monime.createPayout({ idempotencyKey: "payout-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", amountMinor: 100, destination: { type: "momo", providerId: "m17", phoneNumber: "23276123456" } });
    expect(out.id).toBe("p-1");
    expect(calls).toHaveLength(2);
    expect(calls[0]!["Idempotency-Key"]).toBe(calls[1]!["Idempotency-Key"]);

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(400, { success: false, error: { reason: "bad" } })));
    await expect(monime.getCheckoutSession("cs-1")).rejects.toMatchObject({ status: 400, retryable: false });
  });

  it("never puts the token in an error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { success: false, error: { reason: "unauthorized" } })));
    try {
      await monime.getCheckoutSession("cs-1");
      expect.unreachable();
    } catch (err) {
      expect(String((err as Error).message)).not.toContain("mon-test-token");
    }
  });

  it("explains why a connection check failed, in plain words, without the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { success: false, error: { code: 401, reason: "not_authenticated" } })));
    const rejected = await monime.diagnoseMonime();
    expect(rejected).toMatchObject({ ok: false, status: 401, detail: "not_authenticated", requestId: "req-1" });
    expect(rejected.hint).toMatch(/rejected the access token/i);
    expect(JSON.stringify(rejected)).not.toContain("mon-test-token");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(403, { success: false, error: { reason: "forbidden" } })));
    expect((await monime.diagnoseMonime()).hint).toMatch(/not allowed/i);

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { success: true, result: [] })));
    expect(await monime.diagnoseMonime()).toMatchObject({ ok: true });

    // A network failure whose message contains the token must not leak it.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError('invalid header value "Bearer mon-test-token-should-never-leak"'); }));
    const unreachable = await monime.diagnoseMonime();
    expect(unreachable.status).toBe(0);
    expect(JSON.stringify(unreachable)).not.toContain("mon-test-token-should-never-leak");
  });

  it("only trusts Monime's own checkout pages", () => {
    expect(monime.isTrustedCheckoutUrl("https://checkout.monime.io/s/abc")).toBe(true);
    expect(monime.isTrustedCheckoutUrl("https://monime.io/pay")).toBe(true);
    expect(monime.isTrustedCheckoutUrl("http://checkout.monime.io/s/abc")).toBe(false);
    expect(monime.isTrustedCheckoutUrl("https://monime.io.evil.example/pay")).toBe(false);
    expect(monime.isTrustedCheckoutUrl("https://evil.example/?u=monime.io")).toBe(false);
    expect(monime.isTrustedCheckoutUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("withdrawal details", () => {
  it("normalises Sierra Leone mobile numbers", () => {
    expect(normalizePhone("076 123456")).toBe("23276123456");
    expect(normalizePhone("+232 76 123456")).toBe("23276123456");
    expect(normalizePhone("76123456")).toBe("23276123456");
    expect(() => normalizePhone("12345")).toThrow();
    expect(() => normalizePhone("07612345678901")).toThrow();
  });
});

describe("documents held until paid", () => {
  it("holds back an ID card or ticket while payment is pending or under review only", () => {
    expect(() => assertDocumentsUnlocked({ paymentStatus: "pending" })).toThrow(/payment/i);
    expect(() => assertDocumentsUnlocked({ paymentStatus: "review" })).toThrow();
    for (const status of ["none", "paid", "waived"]) expect(() => assertDocumentsUnlocked({ paymentStatus: status })).not.toThrow();
  });
});

describe("the private payment link", () => {
  it("is short enough to fit in Monime's 255-character return addresses", async () => {
    const { signPaymentToken, readPaymentToken } = await import("../../src/modules/payments/service.js");
    const id = "46703421-a539-4e8e-ada0-325190600278";
    const token = signPaymentToken(id);
    expect(`https://ntsone.ntsdigitalsolutions.com/payment/${token}?result=cancelled`.length).toBeLessThan(255);
    expect(readPaymentToken(token)).toBe(id);
  });

  it("rejects a changed, forged or expired link", async () => {
    const { signPaymentToken, readPaymentToken } = await import("../../src/modules/payments/service.js");
    const token = signPaymentToken("46703421-a539-4e8e-ada0-325190600278");
    const [id, expiry, signature] = token.split(".");
    expect(() => readPaymentToken(`${id}.${expiry}.${signature!.slice(0, -1)}x`)).toThrow();
    expect(() => readPaymentToken(`11111111-a539-4e8e-ada0-325190600278.${expiry}.${signature}`)).toThrow();
    expect(() => readPaymentToken(`${id}.${(1).toString(36)}.${signature}`)).toThrow();
    expect(() => readPaymentToken("not-a-link")).toThrow();
  });
});

describe("refunds", () => {
  it("returns the platform's fee in proportion, and the exact rest on the last refund", async () => {
    const { feeShare } = await import("../../src/modules/payments/refunds.js");
    // A NLe 100.00 payment with a NLe 5.00 fee.
    const payment = { amountMinor: 10_000, feeMinor: 500, refundedMinor: 0 };
    expect(feeShare(payment, 0, 4_000)).toBe(200);
    // The rest of it: whatever fee is left, so nothing is lost to rounding.
    expect(feeShare({ ...payment, refundedMinor: 4_000 }, 200, 6_000)).toBe(300);
    expect(feeShare(payment, 0, 10_000)).toBe(500);
    // Never more than the fee that was taken.
    expect(feeShare({ amountMinor: 10_000, feeMinor: 500, refundedMinor: 9_000 }, 500, 100)).toBe(0);
  });

  it("only lets payments be turned on after the fee is agreed to", async () => {
    const { resolveFeeAcceptance } = await import("../../src/modules/payments/fees.js");
    expect(() => resolveFeeAcceptance(undefined, undefined, "u1")).toThrow(/Agree to the platform fee/);
    const accepted = resolveFeeAcceptance(undefined, true, "u1");
    expect(accepted).toMatchObject({ percent: 5, by: "u1" });
    // Already agreed to at this fee: nothing more to tick.
    expect(resolveFeeAcceptance(accepted, undefined, "u2")).toBe(accepted);
    // The fee went up since: they must agree again.
    expect(() => resolveFeeAcceptance({ ...accepted, percent: 2 }, undefined, "u2")).toThrow();
  });
});

describe("paid voting", () => {
  it("works out how many votes an amount buys, and charges exactly those votes", async () => {
    const { planVotePurchase } = await import("../../src/modules/payments/pollPayments.js");
    const fixed = { pricePerVoteMinor: 1_000, allowAnyAmount: false, maxVotesPerPayment: 100 };
    // One fixed price is one vote, whatever the browser says.
    expect(planVotePurchase(fixed, 99_999)).toEqual({ votes: 1, totalMinor: 1_000, unitMinor: 1_000 });
    expect(planVotePurchase(fixed)).toEqual({ votes: 1, totalMinor: 1_000, unitMinor: 1_000 });

    const any = { pricePerVoteMinor: 1_000, allowAnyAmount: true, maxVotesPerPayment: 50 };
    expect(planVotePurchase(any, 2_500)).toEqual({ votes: 2, totalMinor: 2_000, unitMinor: 1_000 });
    expect(planVotePurchase(any, 50_000).votes).toBe(50);
    // Less than one vote, nothing, a fraction, or a negative: refused.
    expect(() => planVotePurchase(any, 999)).toThrow();
    expect(() => planVotePurchase(any)).toThrow();
    expect(() => planVotePurchase(any, 1_500.5)).toThrow();
    expect(() => planVotePurchase(any, -5_000)).toThrow();
    // More than the most one payment may buy.
    expect(() => planVotePurchase(any, 51_000)).toThrow(/at most 50/);
  });

  it("reads a poll's payment settings safely", async () => {
    const { resolvePollPaymentConfig, isPaidPoll } = await import("../../src/modules/payments/pollPayments.js");
    expect(isPaidPoll({ paymentConfig: {} })).toBe(false);
    expect(isPaidPoll({ paymentConfig: { enabled: true, pricePerVoteMinor: 500 } })).toBe(true);
    // Nonsense from the database never switches payments on.
    expect(resolvePollPaymentConfig({ enabled: "yes", pricePerVoteMinor: -1 }).enabled).toBe(false);
  });
});

describe("the platform fee is compulsory", () => {
  it("lets only an organization admin agree to it", async () => {
    const { assertCanAgreeToFee } = await import("../../src/modules/payments/fees.js");
    expect(() => assertCanAgreeToFee("viewer", true)).toThrow();
    expect(() => assertCanAgreeToFee("program_admin", true)).toThrow();
    expect(() => assertCanAgreeToFee("admin", true)).not.toThrow();
    expect(() => assertCanAgreeToFee("viewer", undefined)).not.toThrow();
  });

  it("refuses to charge anyone for a form whose admin never agreed", async () => {
    const { chargePlanFor } = await import("../../src/modules/payments/charge.js");
    const program = { kind: "program", idCardEnabled: false, ticketEnabled: false, paymentConfig: { enabled: true, registrationFeeMinor: 1000 } };
    expect(() => chargePlanFor(program, { orderItems: [] }, undefined)).toThrow(/agrees to the platform fee/);
    const agreed = { ...program, paymentConfig: { ...program.paymentConfig, feeAccepted: { percent: 5, at: "2026-10-04T00:00:00Z", by: "u1" } } };
    expect(chargePlanFor(agreed, { orderItems: [] }, undefined)).toMatchObject({ totalMinor: 1000, charge: true });
  });
});

describe("passwords and tokens", () => {
  it("only accepts a strong new password", async () => {
    const { strongPassword } = await import("../../src/lib/passwordPolicy.js");
    expect(strongPassword.safeParse("short1").success).toBe(false);
    expect(strongPassword.safeParse("onlyletterspassword").success).toBe(false);
    expect(strongPassword.safeParse("1234567890123").success).toBe(false);
    expect(strongPassword.safeParse("password123").success).toBe(false);
    expect(strongPassword.safeParse("Kamara-Market-2026").success).toBe(true);
  });

  it("refuses an access token made for another purpose or with another algorithm", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { signAccessToken, verifyAccessToken } = await import("../../src/lib/jwt.js");
    const good = signAccessToken({ sub: "u1", email: "a@b.com", role: "admin", tenantId: "t1" });
    expect(verifyAccessToken(good).sub).toBe("u1");
    // Same secret but no audience (like a token made for something else), and an unsigned token.
    const secret = process.env.JWT_SECRET!;
    expect(() => verifyAccessToken(jwt.sign({ sub: "u1" }, secret))).toThrow();
    expect(() => verifyAccessToken(jwt.sign({ sub: "u1" }, secret, { algorithm: "HS512", audience: "access" }))).toThrow();
    expect(() => verifyAccessToken(jwt.sign({ sub: "u1" }, "", { algorithm: "none" as never, audience: "access" }))).toThrow();
  });
});
