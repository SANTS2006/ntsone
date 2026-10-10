import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { payments } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { MAX_PAYMENT_MINOR } from "./pricing.js";

// Payment fraud protection that needs no one watching: limits on how fast one address, email or phone can
// start payments, and quiet flags on anything unusual so a person can look at it. Prices and totals are
// always worked out on the server, and every payment is checked with Monime itself before it counts.

const HOUR = 3_600_000;

export interface PaymentActor {
  ip?: string | null;
  email?: string | null;
  phone?: string | null;
}

async function countSince(where: ReturnType<typeof eq>, sinceMs: number, statuses?: string[]): Promise<number> {
  const conditions = [where, gte(payments.createdAt, new Date(Date.now() - sinceMs))];
  if (statuses) conditions.push(inArray(payments.status, statuses));
  const [row] = await db.select({ n: count() }).from(payments).where(and(...conditions));
  return row?.n ?? 0;
}

/** Stops someone hammering the payment system: too many attempts, or too many that were abandoned or failed. */
export async function assertPaymentAllowed(actor: PaymentActor): Promise<void> {
  const tooMany = () => new AppError("RATE_LIMITED", "Too many payment attempts. Please wait a while and then try again.", 429);
  const email = actor.email?.trim().toLowerCase();
  const failed = ["failed", "expired", "cancelled"];

  if (actor.ip) {
    const [hour, day] = await Promise.all([countSince(eq(payments.ipAddress, actor.ip), HOUR), countSince(eq(payments.ipAddress, actor.ip), 24 * HOUR, failed)]);
    if (hour >= 20 || day >= 15) throw tooMany();
  }
  if (email) {
    const [hour, day] = await Promise.all([
      countSince(eq(sql`lower(${payments.payerEmail})`, email) as ReturnType<typeof eq>, HOUR),
      countSince(eq(sql`lower(${payments.payerEmail})`, email) as ReturnType<typeof eq>, 24 * HOUR, failed),
    ]);
    if (hour >= 8 || day >= 10) throw tooMany();
  }
  if (actor.phone) {
    const hour = await countSince(eq(payments.payerPhone, actor.phone), HOUR);
    if (hour >= 8) throw tooMany();
  }
}

/** Quiet warnings stored with a payment, for the team to look at. They never block by themselves. */
export async function riskFlagsFor(actor: PaymentActor, amountMinor: number): Promise<string[]> {
  const flags: string[] = [];
  if (amountMinor >= MAX_PAYMENT_MINOR * 0.5) flags.push("large_amount");
  if (actor.ip && (await countSince(eq(payments.ipAddress, actor.ip), HOUR)) >= 6) flags.push("many_from_one_address");
  const email = actor.email?.trim().toLowerCase();
  if (email && (await countSince(eq(sql`lower(${payments.payerEmail})`, email) as ReturnType<typeof eq>, HOUR)) >= 3) flags.push("many_for_one_email");
  return flags;
}
