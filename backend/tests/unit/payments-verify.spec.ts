import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const provider = vi.hoisted(() => ({
  session: { id: "cs-1", status: "completed", orderNumber: "ORD-1", reference: "pay-1", redirectUrl: "https://monime.io/x" } as Record<string, unknown>,
  payments: [] as Record<string, unknown>[],
}));

vi.mock("../../src/modules/payments/monime.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/modules/payments/monime.js")>("../../src/modules/payments/monime.js");
  return {
    ...actual,
    getCheckoutSession: async () => provider.session,
    listPaymentsForOrder: async () => provider.payments,
  };
});

const { verifyWithProvider } = await import("../../src/modules/payments/service.js");

const payment = { id: "pay-1", checkoutSessionId: "cs-1", amountMinor: 50_000, currency: "SLE" } as Parameters<typeof verifyWithProvider>[0];
const done = (value: number, status = "completed", currency = "SLE") => ({ id: "mp-1", status, amount: { currency, value }, channel: { type: "momo", provider: "m17" } });

beforeEach(() => {
  provider.session = { id: "cs-1", status: "completed", orderNumber: "ORD-1", reference: "pay-1", redirectUrl: "https://monime.io/x" };
  provider.payments = [];
});

describe("deciding whether a payment really happened (asking Monime, not trusting a message)", () => {
  it("counts a completed payment of the right amount", async () => {
    provider.payments = [done(50_000)];
    expect(await verifyWithProvider(payment)).toMatchObject({ outcome: "completed", receivedMinor: 50_000 });
  });

  it("flags too little money for a person to look at", async () => {
    provider.payments = [done(30_000)];
    expect(await verifyWithProvider(payment)).toMatchObject({ outcome: "underpaid", receivedMinor: 30_000 });
  });

  it("counts more than asked as paid (and the extra is flagged elsewhere)", async () => {
    provider.payments = [done(60_000)];
    expect(await verifyWithProvider(payment)).toMatchObject({ outcome: "completed", receivedMinor: 60_000 });
  });

  it("ignores payments that are not completed or are in another currency", async () => {
    provider.payments = [done(50_000, "processing"), done(50_000, "completed", "USD")];
    expect((await verifyWithProvider(payment)).outcome).toBe("pending");
  });

  it("waits when the checkout says completed but no payment is visible yet", async () => {
    provider.payments = [];
    expect((await verifyWithProvider(payment)).outcome).toBe("pending");
  });

  it("refuses a checkout that belongs to a different payment", async () => {
    provider.session = { ...provider.session, reference: "someone-else" };
    provider.payments = [done(50_000)];
    expect((await verifyWithProvider(payment)).outcome).toBe("mismatch");
  });

  it("follows the checkout being cancelled, expired or still open", async () => {
    provider.session = { ...provider.session, status: "cancelled" };
    expect((await verifyWithProvider(payment)).outcome).toBe("cancelled");
    provider.session = { ...provider.session, status: "expired" };
    expect((await verifyWithProvider(payment)).outcome).toBe("expired");
    provider.session = { ...provider.session, status: "pending" };
    expect((await verifyWithProvider(payment)).outcome).toBe("pending");
  });
});
