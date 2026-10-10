import { describe, expect, it } from "vitest";

// Never reach a real database from this test: any query would fail against this dead address.
process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const { buildApp } = await import("../../src/app.js");

interface Route {
  method: string;
  url: string;
}

// Routes that are public on purpose (they carry their own protection: rate limits, signed links, voter sessions).
const OPEN_PREFIXES = ["/api/auth/", "/api/public/", "/api/voter/", "/api/webhooks/"];

async function collectRoutes() {
  const app = buildApp();
  app.log.level = "silent";
  const routes: Route[] = [];
  app.addHook("onRoute", (route) => {
    for (const method of [route.method].flat()) {
      if (method !== "HEAD" && method !== "OPTIONS") routes.push({ method, url: route.url });
    }
  });
  await app.ready();
  return { app, routes };
}

// Each request comes from its own address so the rate limiter never interferes with the auth checks.
let ipCounter = 0;
const nextIp = () => `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;
const bodyless = (method: string) => method === "GET" || method === "DELETE";
const headersFor = (method: string) => (bodyless(method) ? {} : { "content-type": "application/json" });
const bodyFor = (method: string) => (bodyless(method) ? undefined : "{}");

const fill = (url: string) => url.replace(/:[A-Za-z]+/g, "00000000-0000-4000-8000-000000000000").replace(/\*/g, "x");

describe("every protected API route refuses anonymous and forged requests", async () => {
  const { app, routes } = await collectRoutes();
  const protectedRoutes = routes.filter((r) => r.url.startsWith("/api/") && !OPEN_PREFIXES.some((p) => r.url.startsWith(p)));

  it("finds a meaningful number of protected routes", () => {
    expect(protectedRoutes.length).toBeGreaterThan(100);
  });

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url}`, async () => {
      const anonymous = await app.inject({
        method: route.method as "GET",
        url: fill(route.url),
        headers: headersFor(route.method),
        remoteAddress: nextIp(),
        payload: bodyFor(route.method),
      });
      expect(anonymous.statusCode, "no token").toBe(401);

      const forged = await app.inject({
        method: route.method as "GET",
        url: fill(route.url),
        headers: { ...headersFor(route.method), authorization: "Bearer not.a.real.token" },
        remoteAddress: nextIp(),
        payload: bodyFor(route.method),
      });
      expect(forged.statusCode, "forged token").toBe(401);
    });
  }
});

describe("platform hardening", async () => {
  const app = buildApp();
  app.log.level = "silent";
  await app.ready();

  it("answers the liveness check and tags every response with a request id", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("reuses a well-formed incoming request id and ignores a malformed one", async () => {
    const good = await app.inject({ url: "/health", headers: { "x-request-id": "abc-12345678" } });
    expect(good.headers["x-request-id"]).toBe("abc-12345678");
    const bad = await app.inject({ url: "/health", headers: { "x-request-id": "<script>alert(1)</script>" } });
    expect(bad.headers["x-request-id"]).not.toContain("<");
  });

  it("sends security headers", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeTruthy();
    expect(res.headers["permissions-policy"]).toContain("geolocation=()");
  });

  it("does not leak internals on a server error", async () => {
    const res = await app.inject({ url: "/ready" });
    // The database is unreachable here, so it must say so plainly, with no stack trace or address.
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|postgres:/i);
  });

  it("refuses an oversized JSON body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/public/programs/x/registrations",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ pad: "a".repeat(1_200_000) }),
    });
    expect(res.statusCode).toBe(413);
  });
});
