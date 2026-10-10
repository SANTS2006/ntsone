import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

// A small client for the Monime API (https://docs.monime.io, version caph-2025-08-23).
//  - Every request carries the access token and the space id, a timeout, and (for anything that creates
//    something) an Idempotency-Key, so a retry can never create a second payment or payout.
//  - Amounts are whole minor units (1 Leone = 100), as Monime expects.
//  - The token is only ever sent in the Authorization header; it is never logged or put in an error message.

export const isMonimeConfigured = () => Boolean(env.MONIME_ACCESS_TOKEN && env.MONIME_SPACE_ID);

/** Hides the access token and space id if a library ever puts them in an error message. */
function redact(text: string): string {
  let out = text;
  for (const secret of [env.MONIME_ACCESS_TOKEN, env.MONIME_SPACE_ID]) if (secret) out = out.split(secret).join("[hidden]");
  return out;
}

export class MonimeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId?: string,
    /** What Monime said was wrong (its "reason"), or what went wrong reaching it. Never contains the credentials. */
    readonly reason?: string,
  ) {
    super(message);
    this.name = "MonimeError";
  }
}

interface CallOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** 25-64 characters. Required for requests that create something. */
  idempotencyKey?: string;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, options: CallOptions = {}): Promise<T> {
  if (!isMonimeConfigured()) throw AppError.paymentUnavailable("Payments are not set up on this platform yet.");

  const url = new URL(`${env.MONIME_API_BASE.replace(/\/$/, "")}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.MONIME_ACCESS_TOKEN}`,
    "Monime-Space-Id": env.MONIME_SPACE_ID,
    "Monime-Version": env.MONIME_API_VERSION,
    Accept: "application/json",
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  // Reads can be repeated freely; a create can be repeated too because of its idempotency key.
  const attempts = method === "GET" || options.idempotencyKey ? 3 : 1;
  let last: MonimeError | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(300 * 3 ** (attempt - 1));
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      });
      const requestId = response.headers.get("monime-request-id") ?? undefined;
      let json: { success?: boolean; result?: T; error?: { code?: string; reason?: string; message?: string; details?: unknown } } = {};
      try {
        json = (await response.json()) as typeof json;
      } catch {
        /* an empty or non-JSON body; handled below */
      }
      if (response.ok && json.success !== false) return json.result as T;

      const details = json.error?.details === undefined ? "" : ` ${redact(JSON.stringify(json.error.details)).slice(0, 300)}`;
      const reason = `${String(json.error?.reason ?? json.error?.code ?? `HTTP ${response.status}`)}${json.error?.message ? `: ${redact(String(json.error.message)).slice(0, 200)}` : ""}${details}`;
      const retryable = response.status >= 500 || response.status === 429;
      last = new MonimeError(`Monime ${method} ${path} failed: ${reason}`, response.status, retryable, requestId, reason);
      if (!retryable) throw last;
    } catch (err) {
      if (err instanceof MonimeError) {
        if (!err.retryable) throw err;
        last = err;
      } else {
        // A timeout or a dropped connection: nothing is known about whether Monime got it, which is what the key is for.
        const why = redact(err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
        last = new MonimeError(`Monime ${method} ${path} could not be reached`, 0, true, undefined, why);
      }
    }
  }
  throw last ?? new MonimeError("Monime request failed", 0, true);
}

export interface MonimeMoney {
  currency: string;
  value: number;
}

export interface MonimeCheckoutSession {
  id: string;
  status: "pending" | "cancelled" | "expired" | "completed";
  orderNumber?: string | null;
  reference?: string | null;
  redirectUrl: string;
  expireTime?: string;
  metadata?: Record<string, string> | null;
}

export interface MonimePayment {
  id: string;
  // "failed" and similar appear when a payer's attempt does not go through (wrong PIN, no money, limit...).
  status: "pending" | "processing" | "completed" | (string & {});
  amount: MonimeMoney;
  failureDetail?: { code?: string; message?: string } | null;
  channel?: { type: string; provider?: string; reference?: string; phoneNumber?: string; accountNumber?: string; scheme?: string; last4?: string };
  orderNumber?: string | null;
  reference?: string | null;
  fees?: { code: string; amount: MonimeMoney }[] | null;
}

export interface MonimePayout {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  amount: MonimeMoney;
  failureDetail?: { code?: string; message?: string } | null;
}

export type PayoutDestination =
  | { type: "momo"; providerId: string; phoneNumber: string }
  | { type: "bank"; providerId: string; accountNumber: string };

export function createCheckoutSession(input: {
  idempotencyKey: string;
  name: string;
  description?: string;
  reference: string;
  successUrl: string;
  cancelUrl: string;
  lineItems: { name: string; unitMinor: number; quantity: number; reference: string }[];
  metadata?: Record<string, string>;
}) {
  return call<MonimeCheckoutSession>("POST", "/checkout-sessions", {
    idempotencyKey: input.idempotencyKey,
    body: {
      name: input.name.slice(0, 150),
      description: input.description?.slice(0, 1000),
      reference: input.reference,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      lineItems: input.lineItems.map((line) => ({
        type: "custom",
        name: line.name.slice(0, 100),
        price: { currency: "SLE", value: line.unitMinor },
        quantity: line.quantity,
        reference: line.reference.slice(0, 100),
      })),
      // Mobile money (Orange Money, Africell Money, QMoney, ...) is always offered. Cards, banks and wallets only when switched on.
      paymentOptions: {
        card: { disable: !env.MONIME_ALLOW_CARDS },
        bank: { disable: !env.MONIME_ALLOW_BANKS },
        wallet: { disable: true },
        momo: { disable: false },
      },
      metadata: input.metadata,
    },
  });
}

export const getCheckoutSession = (id: string) => call<MonimeCheckoutSession>("GET", `/checkout-sessions/${encodeURIComponent(id)}`);

/** The payments Monime recorded for a checkout session, found by its order number. */
export const listPaymentsForOrder = (orderNumber: string) =>
  call<MonimePayment[]>("GET", "/payments", { query: { orderNumber, limit: 50 } });

export const createPayout = (input: { idempotencyKey: string; amountMinor: number; destination: PayoutDestination; metadata?: Record<string, string> }) =>
  call<MonimePayout>("POST", "/payouts", {
    idempotencyKey: input.idempotencyKey,
    body: { amount: { currency: "SLE", value: input.amountMinor }, destination: input.destination, metadata: input.metadata },
  });

export const getPayout = (id: string) => call<MonimePayout>("GET", `/payouts/${encodeURIComponent(id)}`);

export interface MonimeMomo {
  providerId: string;
  name: string;
  country: string;
  status?: { active?: boolean };
  featureSet?: { payout?: { canPayTo?: boolean }; payment?: { canPayFrom?: boolean } };
}

export interface MonimeBank {
  providerId: string;
  name: string;
  status?: { active?: boolean };
  featureSet?: { payout?: { canPayTo?: boolean } };
}

export const listBanks = () => call<MonimeBank[]>("GET", "/banks", { query: { country: "SL" } });

export const listMomos = () => call<MonimeMomo[]>("GET", "/momos", { query: { country: "SL" } });

export interface MonimeDiagnosis {
  ok: boolean;
  status: number;
  /** What to do about it, in plain words. */
  hint: string;
  detail?: string;
  requestId?: string;
}

/** Tries the connection and explains, in plain words, why it did not work. */
export async function diagnoseMonime(): Promise<MonimeDiagnosis> {
  if (!isMonimeConfigured()) return { ok: false, status: 0, hint: "Add MONIME_ACCESS_TOKEN and MONIME_SPACE_ID in the hosting settings." };
  if (!env.MONIME_SPACE_ID.startsWith("spc-")) {
    return { ok: false, status: 0, hint: "MONIME_SPACE_ID looks wrong: a Monime space id starts with \"spc-\". Copy it again from the Monime dashboard." };
  }
  try {
    await call<unknown>("GET", "/financial-accounts", { query: { limit: 1 } });
    return { ok: true, status: 200, hint: "Connected to Monime." };
  } catch (err) {
    if (!(err instanceof MonimeError)) return { ok: false, status: 0, hint: "Something went wrong checking Monime." };
    const base = { ok: false, status: err.status, detail: err.reason, requestId: err.requestId };
    if (err.status === 401) return { ...base, hint: "Monime rejected the access token (not authenticated). Create a new personal access token in the Monime dashboard and paste it again: only the token itself, with no quotes and no \"Bearer\"." };
    if (err.status === 403) return { ...base, hint: "The token is valid but is not allowed to do this. Give the token permission for payments, checkout sessions and financial accounts (or create it with full access), and check the space id belongs to the same account." };
    if (err.status === 404) return { ...base, hint: "Monime could not find that space. Check MONIME_SPACE_ID is the id of the space the token was created in." };
    if (err.status === 429) return { ...base, hint: "Monime is limiting requests right now. Try again in a minute." };
    if (err.status >= 500) return { ...base, hint: "Monime is having a problem on its side. Try again shortly." };
    if (err.status === 0) return { ...base, hint: "This server could not make a connection to Monime. If it keeps happening, check the MONIME_API_BASE setting and that the host allows outgoing requests." };
    return { ...base, hint: "Monime refused the request." };
  }
}

export interface MonimeFinancialAccount {
  id: string;
  name: string;
  currency: string;
  balance?: { available?: MonimeMoney } | null;
}

export const getFinancialAccount = (id: string) => call<MonimeFinancialAccount>("GET", `/financial-accounts/${encodeURIComponent(id)}`);

export const listFinancialAccounts = () => call<MonimeFinancialAccount[]>("GET", "/financial-accounts", { query: { limit: 50 } });

/** True when a checkout address is on a host the platform trusts (https only), so a payer is never sent somewhere else. */
export function isTrustedCheckoutUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    const hosts = env.MONIME_REDIRECT_HOSTS.split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    return hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}
