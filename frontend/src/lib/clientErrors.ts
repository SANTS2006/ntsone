import { isChunkLoadError, reloadForNewVersion } from "./chunkRecovery";

const sent = new Set<string>();
let count = 0;

/** Sends a short, sanitised note about a problem in the browser so it appears in the server log. Never sends page content, tokens or personal data. */
export function reportClientError(kind: string, error: unknown, extra?: string) {
  try {
    if (count >= 10) return; // a broken page must not flood the server
    const message = String((error as { message?: string })?.message ?? error ?? "").slice(0, 300);
    const key = `${kind}:${message}`;
    if (sent.has(key)) return;
    sent.add(key);
    count += 1;
    const body = JSON.stringify({
      kind,
      message,
      stack: String((error as { stack?: string })?.stack ?? "").slice(0, 1200),
      path: window.location.pathname.slice(0, 200),
      extra: extra?.slice(0, 200),
    });
    if (navigator.sendBeacon?.("/api/public/client-errors", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/public/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* reporting must never cause an error of its own */
  }
}

/** Catches what React cannot: errors in event handlers and timers, promises nobody handled, and a page piece that failed to download. */
export function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    if (event.target && event.target !== window) return; // a missing image or file, not a script error
    reportClientError("window.error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      reportClientError("chunk.rejection", event.reason);
      return;
    }
    reportClientError("unhandledrejection", event.reason);
  });
  // Vite raises this when a piece of the app (or its styles) fails to download, for example after a new version went live.
  window.addEventListener("vite:preloadError", (event) => {
    reportClientError("chunk.preload", (event as unknown as { payload?: unknown }).payload ?? "preload failed");
    // The error boundary shows a recovery screen if this was not enough; one guarded reload fixes the usual stale-version case.
    event.preventDefault();
    reloadForNewVersion();
  });
}
