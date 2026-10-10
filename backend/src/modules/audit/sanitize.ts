// What is safe to keep in the audit log about a request. The log has to say what happened, but it must never become a
// second copy of people's passwords, codes, card or account numbers, or the answers on their forms.

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|signature|otp|pin$|cvv|card(number)?$|account_?number|iban|credential|api_?key|^code$|verification_?code|^content$|candidate/i;

const MAX_TEXT = 200;
const MAX_KEYS = 40;

function scalar(value: unknown): unknown {
  if (typeof value === "string") return value.length > MAX_TEXT ? `${value.slice(0, 120)}… (${value.length} characters)` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

/**
 * Keeps a request body at a safe level of detail: top-level text, numbers and yes/no are kept (shortened),
 * sensitive names are hidden, and anything nested is reduced to its shape (a list of N items, or the names of the keys)
 * so form answers, uploaded file contents and similar never land in the log.
 */
export function sanitizeForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value !== "object") return scalar(value);

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[hidden]";
    } else if (Array.isArray(inner)) {
      out[key] = `[${inner.length} items]`;
    } else if (inner !== null && typeof inner === "object") {
      out[key] = `{${Object.keys(inner as object).slice(0, 20).join(", ")}}`;
    } else {
      const kept = scalar(inner);
      if (kept !== undefined) out[key] = kept;
    }
  }
  return out;
}

/** The address's query string, with anything sensitive hidden. */
export function sanitizeQuery(query: unknown): Record<string, unknown> | undefined {
  const cleaned = sanitizeForAudit(query);
  return cleaned && typeof cleaned === "object" && Object.keys(cleaned).length > 0 ? (cleaned as Record<string, unknown>) : undefined;
}
