import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const { buildApp } = await import("../../src/app.js");

describe("Monime webhook endpoint", async () => {
  const app = buildApp();
  app.log.level = "silent";
  await app.ready();

  const post = (payload: string) =>
    app.inject({ method: "POST", url: "/api/webhooks/monime", headers: { "content-type": "application/json" }, payload, remoteAddress: "10.1.1.1" });

  it("refuses a body that is not JSON", async () => {
    expect((await post("not json")).statusCode).toBe(400);
  });

  it("refuses a message that is not shaped like an event", async () => {
    expect((await post(JSON.stringify({ hello: "world" }))).statusCode).toBe(400);
  });

  it("does not accept anything but POST", async () => {
    const res = await app.inject({ method: "GET", url: "/api/webhooks/monime", remoteAddress: "10.1.1.2" });
    expect(res.statusCode).toBe(404);
  });

  it("a payer's status link that is forged is refused", async () => {
    const res = await app.inject({ method: "GET", url: "/api/public/payments/not-a-real-token", remoteAddress: "10.1.1.3" });
    expect(res.statusCode).toBe(404);
  });
});
