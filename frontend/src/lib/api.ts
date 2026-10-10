import type { AuthUser } from "@/types/api";

export class ApiError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;

  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { code: string; message: string; details?: unknown };
}

let accessToken: string | null = null;
let refreshPromise: Promise<RefreshResult> | null = null;

/** How long a request may take before the page is told it failed (a slow server must never leave a page waiting forever). */
const REQUEST_TIMEOUT_MS = 30_000;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export type RefreshResult =
  | { kind: "ok"; accessToken: string; user: AuthUser }
  | { kind: "none" } // the server answered: there is no valid session
  | { kind: "error" }; // could not find out (network down, server waking up or failing)

/** fetch() that gives up after a while, and that turns a dropped connection into a clear ApiError. */
async function timedFetch(input: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (outer?.aborted) throw err; // the caller cancelled on purpose (for example by leaving the page)
    if (controller.signal.aborted) throw new ApiError("TIMEOUT", "The server took too long to answer. Please try again.", 0);
    throw new ApiError("NETWORK_ERROR", "Could not reach the server. Check your connection and try again.", 0);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Asks the server for a new access token using the refresh cookie. Everyone who needs one at the same moment
 * (the app starting, several requests failing together) shares ONE request, so the rotating refresh token is never
 * used twice at once.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<RefreshResult> => {
      try {
        const res = await timedFetch("/api/auth/refresh", { method: "POST", credentials: "include" }, 20_000);
        if (res.status === 401 || res.status === 403) return { kind: "none" };
        if (!res.ok) return { kind: "error" };
        const body = (await res.json()) as Envelope<{ accessToken: string; user: AuthUser }>;
        if (body.data?.accessToken) {
          setAccessToken(body.data.accessToken);
          return { kind: "ok", accessToken: body.data.accessToken, user: body.data.user };
        }
        return { kind: "none" };
      } catch {
        return { kind: "error" };
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Called when a session expired and could not be renewed, so the app can show the sign-in page instead of broken pages. */
let onSessionLost: (() => void) | null = null;
export function setSessionLostHandler(handler: (() => void) | null) {
  onSessionLost = handler;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuthRetry?: boolean;
  timeoutMs?: number;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuthRetry, timeoutMs, headers, ...rest } = options;

  const doFetch = (): Promise<Response> =>
    timedFetch(
      `/api${path}`,
      {
        ...rest,
        credentials: "include",
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      timeoutMs,
    );

  let response = await doFetch();

  if (response.status === 401 && !skipAuthRetry && path !== "/auth/refresh") {
    const refreshed = await refreshSession();
    if (refreshed.kind === "ok") {
      response = await doFetch();
    } else if (refreshed.kind === "none") {
      // The session is really over: tell the app once so it shows the sign-in page.
      accessToken = null;
      onSessionLost?.();
    }
  }

  const contentType = response.headers.get("content-type");
  let payload: Envelope<T>;
  try {
    payload = contentType?.includes("application/json") ? await response.json() : { success: response.ok };
  } catch {
    payload = { success: false };
  }

  if (!response.ok || !payload.success) {
    const fallback =
      response.status >= 500 ? "The server had a problem. Please try again in a moment." : response.status === 403 ? "You do not have permission to do this." : "Something went wrong";
    throw new ApiError(payload.error?.code ?? "UNKNOWN_ERROR", payload.error?.message ?? fallback, response.status, payload.error?.details);
  }

  return payload.data as T;
}

/** Prefers the exact UTF-8 name (RFC 5987 `filename*`) over the ASCII `filename` fallback. */
function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const extended = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      /* malformed encoding: fall through to the plain name */
    }
  }
  return disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1] ?? null;
}

/**
 * Downloads a binary response (file export, PDF, ...) from an authenticated endpoint.
 * Plain browser navigation can't carry the Authorization header, so this fetches the
 * bytes with fetch() and triggers a save via a throwaway object URL instead.
 */
export async function downloadAuthenticatedFile(path: string, fallbackFilename: string, post?: { body: unknown }): Promise<void> {
  const response = await timedFetch(
    `/api${path}`,
    {
      method: post ? "POST" : "GET",
      credentials: "include",
      headers: { ...(post ? { "Content-Type": "application/json" } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: post ? JSON.stringify(post.body) : undefined,
    },
    300_000,
  );

  if (!response.ok) {
    let message = "Failed to download file";
    try {
      const body = (await response.json()) as Envelope<unknown>;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError("DOWNLOAD_FAILED", message, response.status);
  }

  const filename = filenameFromDisposition(response.headers.get("content-disposition")) ?? fallbackFilename;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the save in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
