/*
 * NTSOne service worker. It makes the app install like a normal app and keeps it usable on a weak or missing connection.
 *
 * What it does:
 *  - keeps the built app files (/assets/...) so the app opens quickly, and keeps images and fonts up to date in the background;
 *  - opens pages from the network first, and falls back to the last copy of the app (then to an offline page) when the network is
 *    slow or gone, so the app never shows the browser's "no internet" dinosaur.
 *
 * What it NEVER does: touch /api/ (private data is always live and never stored here), /payment/ (the return from the payment
 * provider must always reach the server), anything that is not a GET, or anything on another website.
 */

const VERSION = "v1";
const SHELL_CACHE = `ntsone-shell-${VERSION}`;
const ASSET_CACHE = `ntsone-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const SHELL_KEY = "/__app-shell";
const PRECACHE = [OFFLINE_URL, "/offline.js", "/favicon.png", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];
const MAX_ASSETS = 160;
// On a slow connection (or a server that is waking up) show the last copy of the app after this long instead of a blank screen.
const NAVIGATION_TIMEOUT_MS = 4000;

const STATIC_FILE = /\.(?:png|jpe?g|webp|svg|ico|woff2?|webmanifest)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // One missing file must not stop the worker from installing.
      Promise.allSettled(PRECACHE.map((url) => cache.add(url))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("ntsone-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// The page asks for the waiting version to take over when the person taps "Update".
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** Requests this worker leaves completely alone. */
function shouldIgnore(request, url) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/payment/")) return true;
  if (url.pathname === "/sw.js") return true;
  if (request.headers.has("range")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (shouldIgnore(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
  } else if (url.pathname.startsWith("/assets/")) {
    // Built files have a fingerprint in their name, so a copy never goes out of date.
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  } else if (STATIC_FILE.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

async function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function handleNavigation(request) {
  try {
    const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    const type = response.headers.get("content-type") || "";
    if (response.ok && type.includes("text/html")) {
      // Keep the latest copy of the app for when the connection is gone.
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_KEY, copy));
    }
    return response;
  } catch (_error) {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match(SHELL_KEY)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    await trim(cache, MAX_ASSETS);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (hit) return hit;
  return (await refresh) || Response.error();
}
