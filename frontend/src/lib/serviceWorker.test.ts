import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real public/sw.js with a simulated browser (caches, fetch, events) and checks what it does with each request.
const SOURCE = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
const ORIGIN = "https://app.test";

const asBasic = (body: string, init: ResponseInit = {}) => {
  const res = new Response(body, init);
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
};
const html = (body = "<html>app</html>") => asBasic(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

type Handler = (event: unknown) => void;

function loadWorker() {
  const listeners: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (req: unknown) => (typeof req === "string" ? new URL(req, ORIGIN).href : (req as { url: string }).url);
  const makeCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: unknown) => store.get(keyOf(req))?.clone(),
      put: async (req: unknown, res: Response) => void store.set(keyOf(req), res),
      add: async (req: unknown) => {
        const res = await fetchMock(keyOf(req));
        if (!res.ok) throw new Error("not ok");
        store.set(keyOf(req), res);
      },
      delete: async (req: unknown) => store.delete(keyOf(req)),
      keys: async () => [...store.keys()].map((url) => ({ url })),
    };
  };
  const caches = {
    open: async (name: string) => makeCache(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => void (listeners[type] = fn),
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
  };
  new Function("self", "caches", "fetch", "Response", "URL", "AbortController", "setTimeout", "clearTimeout", SOURCE)(self, caches, fetchMock, Response, URL, AbortController, setTimeout, clearTimeout);

  const waitUntilAll = async (type: string, event: Record<string, unknown> = {}) => {
    const pending: Promise<unknown>[] = [];
    listeners[type]!({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  };
  const request = (url: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}) => ({
    url: new URL(url, ORIGIN).href,
    method: init.method ?? "GET",
    mode: init.mode ?? "no-cors",
    headers: new Headers(init.headers),
  });
  /** Sends a request through the worker. Returns the response, or "ignored" when the worker left it alone. */
  const fetchEvent = async (req: ReturnType<typeof request>): Promise<Response | "ignored"> => {
    let answer: Promise<Response> | undefined;
    listeners.fetch!({ request: req, respondWith: (p: Promise<Response>) => (answer = p) });
    return answer ? await answer : "ignored";
  };
  return { listeners, stores, fetchMock, self, waitUntilAll, request, fetchEvent, install: () => waitUntilAll("install"), activate: () => waitUntilAll("activate") };
}

describe("the service worker", () => {
  let sw: ReturnType<typeof loadWorker>;
  beforeEach(() => {
    sw = loadWorker();
    sw.fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/offline.html")) return asBasic("<html>offline</html>", { status: 200, headers: { "content-type": "text/html" } });
      return asBasic("file", { status: 200 });
    });
  });
  afterEach(() => vi.useRealTimers());

  it("never touches private data, payments, other websites, changes, or its own file", async () => {
    await sw.install();
    for (const req of [
      sw.request("/api/auth/refresh"),
      sw.request("/api/wishlists"),
      sw.request("/payment/abc.def.ghi"),
      sw.request("https://elsewhere.test/assets/x.js"),
      sw.request("/api/programs", { method: "POST" }),
      sw.request("/assets/data.bin", { headers: { range: "bytes=0-10" } }),
      sw.request("/sw.js"),
      sw.request("/some/page", { method: "DELETE", mode: "navigate" }),
    ]) {
      expect(await sw.fetchEvent(req), req.url).toBe("ignored");
    }
  });

  it("keeps the offline page when it installs, and one missing file does not stop the install", async () => {
    sw.fetchMock.mockImplementation(async (input) => (String(input).endsWith("/offline.js") ? new Response("", { status: 404 }) : asBasic("ok", { status: 200 })));
    await expect(sw.install()).resolves.toBeUndefined();
    const shell = [...sw.stores.get("ntsone-shell-v1")!.keys()];
    expect(shell).toContain(`${ORIGIN}/offline.html`);
    expect(shell).not.toContain(`${ORIGIN}/offline.js`);
  });

  it("keeps built files after the first download and serves them without the network", async () => {
    const first = await sw.fetchEvent(sw.request("/assets/index-abc123.js"));
    expect(first).toBeInstanceOf(Response);
    const calls = sw.fetchMock.mock.calls.length;
    const second = await sw.fetchEvent(sw.request("/assets/index-abc123.js"));
    expect(await (second as Response).text()).toBe("file");
    expect(sw.fetchMock.mock.calls.length).toBe(calls);
  });

  it("does not keep a failed download of a built file", async () => {
    sw.fetchMock.mockResolvedValueOnce(asBasic("nope", { status: 404 }));
    await sw.fetchEvent(sw.request("/assets/gone-1.js"));
    expect(sw.stores.get("ntsone-assets-v1")?.size ?? 0).toBe(0);
  });

  it("opens pages from the network and keeps the latest copy of the app", async () => {
    sw.fetchMock.mockResolvedValueOnce(html("<html>fresh</html>"));
    const res = (await sw.fetchEvent(sw.request("/admin/programs", { mode: "navigate" }))) as Response;
    expect(await res.text()).toBe("<html>fresh</html>");
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.stores.get("ntsone-shell-v1")!.has(`${ORIGIN}/__app-shell`)).toBe(true);
  });

  it("does not keep error pages or non-page answers as the app copy", async () => {
    sw.fetchMock.mockResolvedValueOnce(asBasic("{}", { status: 500, headers: { "content-type": "text/html" } }));
    await sw.fetchEvent(sw.request("/admin", { mode: "navigate" }));
    sw.fetchMock.mockResolvedValueOnce(asBasic("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await sw.fetchEvent(sw.request("/admin", { mode: "navigate" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.stores.get("ntsone-shell-v1")?.has(`${ORIGIN}/__app-shell`) ?? false).toBe(false);
  });

  it("when offline, opens the last copy of the app, then the offline page, and never the browser error", async () => {
    await sw.install();
    sw.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const offlinePage = (await sw.fetchEvent(sw.request("/admin", { mode: "navigate" }))) as Response;
    expect(await offlinePage.text()).toBe("<html>offline</html>");

    sw.fetchMock.mockResolvedValueOnce(html("<html>last visit</html>"));
    await sw.fetchEvent(sw.request("/admin", { mode: "navigate" }));
    await new Promise((r) => setTimeout(r, 0));
    sw.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const cached = (await sw.fetchEvent(sw.request("/admin/wishlists", { mode: "navigate" }))) as Response;
    expect(await cached.text()).toBe("<html>last visit</html>");
  });

  it("on a very slow connection, shows the last copy of the app after a few seconds instead of a blank screen", async () => {
    vi.useFakeTimers();
    // A worker started after the fake clock, so its timeout runs on that clock.
    const slow = loadWorker();
    slow.fetchMock.mockResolvedValueOnce(html("<html>earlier</html>"));
    await slow.fetchEvent(slow.request("/", { mode: "navigate" }));
    await vi.advanceTimersByTimeAsync(0);
    slow.fetchMock.mockImplementation((_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const pending = slow.fetchEvent(slow.request("/admin", { mode: "navigate" }));
    await vi.advanceTimersByTimeAsync(4100);
    const res = (await pending) as Response;
    expect(await res.text()).toBe("<html>earlier</html>");
  });

  it("refreshes images and fonts in the background", async () => {
    await sw.fetchEvent(sw.request("/icons/icon-192.png"));
    sw.fetchMock.mockResolvedValue(asBasic("newer", { status: 200 }));
    const stale = (await sw.fetchEvent(sw.request("/icons/icon-192.png"))) as Response;
    expect(await stale.text()).toBe("file");
    await new Promise((r) => setTimeout(r, 0));
    const updated = (await sw.fetchEvent(sw.request("/icons/icon-192.png"))) as Response;
    expect(await updated.text()).toBe("newer");
  });

  it("leaves other files such as robots.txt to the network", async () => {
    expect(await sw.fetchEvent(sw.request("/robots.txt"))).toBe("ignored");
    expect(await sw.fetchEvent(sw.request("/sitemap.xml"))).toBe("ignored");
  });

  it("clears out old versions of its own caches when a new version starts, and only its own", async () => {
    await sw.install();
    sw.stores.set("ntsone-shell-v0", new Map());
    sw.stores.set("ntsone-assets-v0", new Map());
    sw.stores.set("someone-elses-cache", new Map());
    await sw.activate();
    expect([...sw.stores.keys()].sort()).toEqual(["ntsone-shell-v1", "someone-elses-cache"]);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it("updates only when the page says so", () => {
    sw.listeners.message!({ data: { type: "something-else" } });
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
    sw.listeners.message!({ data: { type: "SKIP_WAITING" } });
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
