import { env } from "../../config/env.js";

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  /** Where replies should go, e.g. the person who submitted a report. */
  replyTo?: { email: string; name?: string };
  /** Shown as the sender, e.g. a business's name; the address stays the platform's own. */
  fromName?: string;
  /** Files to attach, as base64, e.g. an invoice PDF. */
  attachments?: { name: string; content: string }[];
}

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10_000;

export interface DeliveryResult {
  ok: boolean;
  /** Worth trying again later: a network problem, a timeout, a rate limit, or a provider error. */
  retryable: boolean;
  error?: string;
}

/** One attempt to hand an email to Brevo, with a timeout. Never throws. */
export async function deliverEmail(input: SendEmailInput): Promise<DeliveryResult> {
  if (!env.BREVO_API_KEY) {
    console.log(`[email:dev-stub] to=${input.to} subject="${input.subject}"`);
    return { ok: true, retryable: false };
  }
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: input.fromName ?? env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS },
        to: [{ email: input.to, name: input.toName ?? input.to }],
        subject: input.subject,
        htmlContent: input.html,
        ...(input.replyTo ? { replyTo: { email: input.replyTo.email, name: input.replyTo.name ?? input.replyTo.email } } : {}),
        ...(input.attachments?.length ? { attachment: input.attachments } : {}),
      }),
    });
    if (response.ok) return { ok: true, retryable: false };
    const body = (await response.text()).slice(0, 300);
    // 4xx other than 408/429 means the email itself is the problem; trying again won't help.
    const retryable = response.status >= 500 || response.status === 429 || response.status === 408;
    return { ok: false, retryable, error: `Brevo ${response.status}: ${body}` };
  } catch (err) {
    return { ok: false, retryable: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sends a transactional email via Brevo right away, for callers that need to tell the person
 * whether it went (a sign-in code, "send invoice"). One quick retry covers a blip. If BREVO_API_KEY
 * is not configured (local/dev), the email is logged instead.
 *
 * Never throws: callers send email as a side effect of work that has already been committed, and a
 * mail outage must not turn that into a failed request the user can't cleanly retry. For
 * notifications that can wait, use queueEmail instead: it is kept and retried until it goes.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  let result = await deliverEmail(input);
  if (!result.ok && result.retryable) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    result = await deliverEmail(input);
  }
  if (!result.ok) console.error(`Email send failed: ${result.error}`);
  return result.ok;
}
