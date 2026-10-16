import { ApiError } from "./api";

/** What the server said is wrong with each field, keyed by field name (empty when it only said something general). */
export function serverFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details || typeof err.details !== "object") return {};
  const details = err.details as { field?: unknown; fields?: unknown };
  const result: Record<string, string> = {};
  if (details.fields && typeof details.fields === "object") {
    for (const [key, message] of Object.entries(details.fields as Record<string, unknown>)) if (typeof message === "string") result[key] = message;
  }
  if (typeof details.field === "string") result[details.field] = err.message;
  return result;
}

/**
 * Puts the server's message under the box it is about, for the fields the form has. Returns false when the message is
 * not about one of them, so the caller can show it some other way (a toast).
 */
export function showServerFieldErrors(err: unknown, fields: readonly string[], setError: (field: never, error: { type: string; message: string }) => void): boolean {
  const found = Object.entries(serverFieldErrors(err)).filter(([key]) => fields.includes(key));
  for (const [key, message] of found) setError(key as never, { type: "server", message });
  return found.length > 0;
}
