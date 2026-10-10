import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Never reach a real database from this test: nothing here queries one.
process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL = "http://localhost:4000";
process.env.API_URL = "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";
process.env.NODE_ENV = "production";

const dist = path.resolve(__dirname, "../../../frontend/dist");
const built = (() => {
  try {
    return readdirSync(path.join(dist, "assets")).find((f) => f.endsWith(".js"));
  } catch {
    return undefined;
  }
})();

// These need the built web app (npm run build). They check how the server serves it in production.
describe.skipIf(!built)("serving the built web app (production mode)", async () => {
  const { buildApp } = await import("../../src/app.js");
  const app = buildApp();
  app.log.level = "silent";
  await app.ready();

  it("answers a page piece that no longer exists with a real 404, not the home page (the stale-version blank screen)", async () => {
    const res = await app.inject({ method: "GET", url: "/assets/OldPage-deadbeef.js" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/html/);
    expect(res.headers["cache-control"]).toBe("no-store");
    const css = await app.inject({ method: "GET", url: "/assets/old-style-1234.css" });
    expect(css.statusCode).toBe(404);
  });

  it("serves a real built file with a long cache lifetime", async () => {
    const res = await app.inject({ method: "GET", url: `/assets/${built}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("serves the app shell for page addresses, always revalidated", async () => {
    for (const url of ["/admin/backups", "/admin/programs/123/registrations", "/vote/some-poll", "/programs/x/register"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers["content-type"]).toMatch(/html/);
      expect(res.headers["cache-control"]).toBe("no-cache");
      expect(res.body).toContain('<div id="root">');
    }
  });

  it("serves what is needed to install the app: the worker is never cached for long, the manifest is valid, and every icon exists", async () => {
    const sw = await app.inject({ method: "GET", url: "/sw.js" });
    expect(sw.statusCode).toBe(200);
    expect(sw.headers["content-type"]).toMatch(/javascript/);
    expect(sw.headers["cache-control"]).toBe("no-cache");
    expect(sw.body).toContain("/api/");

    const manifestRes = await app.inject({ method: "GET", url: "/manifest.webmanifest" });
    expect(manifestRes.statusCode).toBe(200);
    expect(manifestRes.headers["content-type"]).toMatch(/json/);
    const manifest = manifestRes.json();
    expect(manifest).toMatchObject({ name: "NTSOne", short_name: "NTSOne", display: "standalone", scope: "/", id: "/" });
    expect(manifest.start_url.startsWith("/")).toBe(true);
    const purposes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? "any"}`);
    expect(purposes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap((s: { icons: unknown[] }) => s.icons)] as { src: string }[]) {
      const res = await app.inject({ method: "GET", url: icon.src });
      expect(res.statusCode, icon.src).toBe(200);
    }

    for (const url of ["/offline.html", "/offline.js", "/apple-touch-icon.png"]) {
      expect((await app.inject({ method: "GET", url })).statusCode, url).toBe(200);
    }
  });

  it("keeps API 404s as JSON", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nothing-here" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});
