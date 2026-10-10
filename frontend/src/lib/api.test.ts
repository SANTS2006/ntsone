import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { "content-type": "application/json" } });
const fail = (status: number, body: unknown = { success: false, error: { code: "X", message: "nope" } }) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function load() {
  vi.resetModules();
  return import("./api");
}

describe("the API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shares ONE token refresh between requests that expire together, then retries each", async () => {
    const api = await load();
    api.setAccessToken("old");
    let refreshCalls = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init: RequestInit) => {
      if (url === "/api/auth/refresh") {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return ok({ accessToken: "new", user: { id: "u1" } });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer new" ? ok({ url }) : fail(401);
    });
    const results = await Promise.all([api.apiFetch("/a"), api.apiFetch("/b"), api.apiFetch("/c")]);
    expect(refreshCalls).toBe(1);
    expect(results).toEqual([{ url: "/api/a" }, { url: "/api/b" }, { url: "/api/c" }]);
    expect(api.getAccessToken()).toBe("new");
  });

  it("tells the app once when the session is really over, instead of retrying forever", async () => {
    const api = await load();
    api.setAccessToken("old");
    const lost = vi.fn();
    api.setSessionLostHandler(lost);
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => (url === "/api/auth/refresh" ? fail(401) : fail(401)));
    await expect(api.apiFetch("/things")).rejects.toMatchObject({ statusCode: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
    expect(api.getAccessToken()).toBeNull();
    // Only the first request and one refresh were made: no loop.
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("does NOT treat an unreachable server during refresh as being signed out", async () => {
    const api = await load();
    api.setAccessToken("old");
    const lost = vi.fn();
    api.setSessionLostHandler(lost);
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === "/api/auth/refresh") throw new TypeError("Failed to fetch");
      return fail(401);
    });
    await expect(api.apiFetch("/things")).rejects.toMatchObject({ statusCode: 401 });
    expect(lost).not.toHaveBeenCalled();
    expect(api.getAccessToken()).toBe("old");
  });

  it("reports the session check as 'none' (signed out), 'error' (cannot tell) or 'ok'", async () => {
    let api = await load();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fail(401));
    expect(await api.refreshSession()).toEqual({ kind: "none" });
    api = await load();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fail(502, {}));
    expect(await api.refreshSession()).toEqual({ kind: "error" });
    api = await load();
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("offline"));
    expect(await api.refreshSession()).toEqual({ kind: "error" });
    api = await load();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(ok({ accessToken: "t", user: { id: "u" } }));
    expect(await api.refreshSession()).toMatchObject({ kind: "ok", accessToken: "t" });
  });

  it("turns a dropped connection into a clear error instead of a crash", async () => {
    const api = await load();
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.apiFetch("/x")).rejects.toMatchObject({ code: "NETWORK_ERROR", statusCode: 0 });
  });

  it("gives up on a request that never answers", async () => {
    vi.useFakeTimers();
    const api = await load();
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const pending = api.apiFetch("/slow").catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await pending).toMatchObject({ code: "TIMEOUT" });
  });

  it("lets a caller cancel a request on purpose", async () => {
    const api = await load();
    const controller = new AbortController();
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const pending = api.apiFetch("/x", { signal: controller.signal }).catch((e) => e);
    controller.abort();
    expect(((await pending) as Error).name).toBe("AbortError");
  });

  it("explains a server failure that has no JSON body", async () => {
    const api = await load();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
    await expect(api.apiFetch("/x")).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining("server had a problem") });
  });

  it("survives a broken JSON body", async () => {
    const api = await load();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("{not json", { status: 200, headers: { "content-type": "application/json" } }));
    await expect(api.apiFetch("/x")).rejects.toMatchObject({ code: "UNKNOWN_ERROR" });
  });
});
