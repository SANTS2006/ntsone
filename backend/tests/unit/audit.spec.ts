import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const { buildApp } = await import("../../src/app.js");
const { describeRequest, isLoggedGet } = await import("../../src/modules/audit/describe.js");
const { sanitizeForAudit } = await import("../../src/modules/audit/sanitize.js");
const { setAuditSink, flushAudit, recordAudit } = await import("../../src/modules/audit/recorder.js");
const { shouldAudit, seenRecently } = await import("../../src/modules/audit/requestAudit.js");

type Row = Awaited<ReturnType<typeof import("../../src/modules/audit/recorder.js").completeDraft>>;

describe("describing a request in words", () => {
  it("knows the routes it was written for", () => {
    expect(describeRequest("POST", "/api/programs/:programId/form/publish", { programId: "abc" })).toMatchObject({
      action: "form.publish",
      label: "Published the registration form",
      entityType: "form",
      entityId: "abc",
    });
    expect(describeRequest("POST", "/api/public/programs/:slug/registrations", { slug: "my-event" })).toMatchObject({ action: "public.submit", entityId: "my-event" });
  });

  it("never keeps a private payment or submission link as an id", () => {
    expect(describeRequest("GET", "/api/public/payments/:token", { token: "secret.signed.link" }).entityId).toBeNull();
  });

  it("still describes a route nobody wrote a label for", () => {
    const d = describeRequest("POST", "/api/things/:thingId/frobnicate", { thingId: "42" });
    expect(d.label).toMatch(/frobnicate/);
    expect(d.action).toBe("post.things.frobnicate");
  });

  it("has a description for every route that changes something", async () => {
    const app = buildApp();
    app.log.level = "silent";
    const unlisted: string[] = [];
    app.addHook("onRoute", (route) => {
      for (const method of [route.method].flat()) {
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && route.url.startsWith("/api/")) {
          // A route with no entry would still be recorded, but with a generic sentence; add it to describe.ts.
          if (describeRequest(method, route.url).action.startsWith(`${method.toLowerCase()}.`)) unlisted.push(`${method} ${route.url}`);
        }
      }
    });
    await app.ready();
    expect(unlisted).toEqual([]);
  });

  it("records the reads that matter and leaves out the constant background ones", () => {
    expect(shouldAudit("GET", "/api/programs/:programId/registrations/export")).toBe(true);
    expect(shouldAudit("GET", "/api/programs/:programId/registrations/:registrationId")).toBe(true);
    expect(shouldAudit("GET", "/api/programs/:programId/registrations")).toBe(false);
    expect(shouldAudit("GET", "/api/funds")).toBe(false);
    expect(shouldAudit("POST", "/api/funds/payouts")).toBe(true);
    expect(isLoggedGet("/api/public/verify/:slug/:registrationNumber")).toBe(true);
    // Reading the log is not itself logged, but exporting it is.
    expect(shouldAudit("GET", "/api/audit-logs")).toBe(false);
    expect(shouldAudit("GET", "/api/audit-logs/export")).toBe(true);
    expect(shouldAudit("OPTIONS", "/api/programs")).toBe(false);
    expect(shouldAudit("GET", "/assets/app.js")).toBe(false);
  });
});

describe("what is safe to keep", () => {
  it("hides passwords, codes and tokens, and never keeps the candidate someone voted for", () => {
    expect(sanitizeForAudit({ email: "a@b.com", password: "hunter2", code: "123456", refreshToken: "x", candidateId: "c1", accountNumber: "0123456789" })).toEqual({
      email: "a@b.com",
      password: "[hidden]",
      code: "[hidden]",
      refreshToken: "[hidden]",
      candidateId: "[hidden]",
      accountNumber: "[hidden]",
    });
  });

  it("keeps only the shape of nested data, so form answers and file contents never reach the log", () => {
    const cleaned = sanitizeForAudit({ responses: { full_name: "Ama Kamara", id_number: "SL123" }, files: [{}, {}], content: "VGhpcyBpcyBhIGZpbGU=", name: "Programme" });
    expect(cleaned).toEqual({ responses: "{full_name, id_number}", files: "[2 items]", content: "[hidden]", name: "Programme" });
    expect(JSON.stringify(cleaned)).not.toContain("Ama");
  });

  it("shortens very long text", () => {
    const out = sanitizeForAudit({ note: "x".repeat(500) }) as { note: string };
    expect(out.note.length).toBeLessThan(160);
    expect(out.note).toContain("500 characters");
  });
});

describe("the request hook", () => {
  let rows: Row[];
  beforeEach(() => {
    rows = [];
    setAuditSink(async (batch) => void rows.push(...(batch as Row[])));
  });

  const app = buildApp();
  app.log.level = "silent";
  const fire = async (opts: { method: "GET" | "POST"; url: string; payload?: unknown; headers?: Record<string, string>; ip: string }) => {
    const res = await app.inject({ method: opts.method, url: opts.url, payload: opts.payload as string, headers: { "content-type": "application/json", ...opts.headers }, remoteAddress: opts.ip });
    // The record is written just after the response is sent.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flushAudit();
    return res;
  };

  it("records a refused attempt with what was tried but never the password", async () => {
    await fire({ method: "POST", url: "/api/auth/login", payload: { email: "ama@example.com", password: "wrong-password" }, ip: "10.9.0.1" });
    const row = rows.find((r) => r.action === "auth.login");
    expect(row).toBeTruthy();
    expect(row).toMatchObject({ source: "request", method: "POST", path: "/api/auth/login", actorType: "visitor", ipAddress: "10.9.0.1" });
    expect(row!.outcome).not.toBe("success");
    expect(JSON.stringify(row!.metadata)).toContain("ama@example.com");
    expect(JSON.stringify(row!.metadata)).not.toContain("wrong-password");
  });

  it("records a request that was not allowed as denied", async () => {
    const res = await fire({ method: "POST", url: "/api/programs", payload: { name: "x" }, ip: "10.9.0.2" });
    expect(res.statusCode).toBe(401);
    const row = rows.find((r) => r.action === "program.create");
    expect(row).toMatchObject({ outcome: "denied", statusCode: 401, label: "Created a program" });
  });

  it("opening a live page is recorded once per visitor per ten minutes", () => {
    expect(seenRecently("10.9.0.3|/api/public/programs/:slug|some-event|public.program_view")).toBe(false);
    expect(seenRecently("10.9.0.3|/api/public/programs/:slug|some-event|public.program_view")).toBe(true);
    // Another visitor, or another page, is a new view.
    expect(seenRecently("10.9.0.4|/api/public/programs/:slug|some-event|public.program_view")).toBe(false);
    expect(seenRecently("10.9.0.3|/api/public/programs/:slug|other-event|public.program_view")).toBe(false);
  });

  it("keeps every failed attempt to open a live page", async () => {
    await fire({ method: "GET", url: "/api/public/programs/no-such-event", ip: "10.9.0.8" });
    await fire({ method: "GET", url: "/api/public/programs/no-such-event", ip: "10.9.0.8" });
    expect(rows.filter((r) => r.action === "public.program_view" && r.ipAddress === "10.9.0.8")).toHaveLength(2);
  });

  it("leaves out background reads", async () => {
    await fire({ method: "GET", url: "/api/programs", ip: "10.9.0.5" });
    expect(rows).toHaveLength(0);
  });

  it("folds an event the code records into the request it belongs to, with the result", async () => {
    const local = buildApp();
    local.log.level = "silent";
    local.post("/api/test-event", async () => {
      await recordAudit({ action: "thing.done", label: "Did the thing", entityType: "thing", entityId: "t1", metadata: { size: 3 } });
      return { ok: true };
    });
    await local.ready();
    await local.inject({ method: "POST", url: "/api/test-event", payload: {}, headers: { "content-type": "application/json" }, remoteAddress: "10.9.0.6" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flushAudit();
    const mine = rows.filter((r) => r.path === "/api/test-event");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ action: "thing.done", label: "Did the thing", source: "event", statusCode: 200, outcome: "success", method: "POST", ipAddress: "10.9.0.6" });
    expect(mine[0]!.requestId).toBeTruthy();
  });

  it("only the platform's super admin can read the log", async () => {
    for (const url of ["/api/audit-logs", "/api/audit-logs/accounts", "/api/audit-logs/export", "/api/audit-logs/00000000-0000-4000-8000-000000000000"]) {
      const anonymous = await app.inject({ method: "GET", url, remoteAddress: "10.9.0.7" });
      expect(anonymous.statusCode).toBe(401);
    }
  });
});
