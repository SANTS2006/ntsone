import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const { buildApp } = await import("../../src/app.js");

// "Sign in with Google" opens a window that must be able to talk back to the page and must be told the page's address.
// If either header changes, that window stays blank after the person picks an account.
describe("headers that keep Google sign-in working", async () => {
  const app = buildApp();
  app.log.level = "silent";
  await app.ready();
  const res = await app.inject({ method: "GET", url: "/health", remoteAddress: "10.2.2.2" });

  it("lets the sign-in window report back to the page", () => {
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
  });
  it("does not hide the site's address from Google", () => {
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
  it("allows Google's script, frames and requests in the content security policy", () => {
    const csp = String(res.headers["content-security-policy"]);
    expect(csp).toContain("script-src 'self' https://accounts.google.com/gsi/client");
    expect(csp).toContain("frame-src 'self' https://accounts.google.com/gsi/");
    expect(csp).toContain("connect-src 'self' https://api.cloudinary.com https://accounts.google.com/gsi/");
  });
});
