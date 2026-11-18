import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client.js";
import { tenants } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { formatMinor } from "../../lib/money.js";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import { notifyAdmins } from "./payouts.js";
import { defaultTerms, termsFor } from "./terms.js";

/**
 * The platform's say over each organization's payments: the fee it keeps, how long money is held before it can be
 * withdrawn, and when withdrawals are switched on. A value left empty means "use the platform default".
 */
const bodySchema = z.object({
  feePercent: z.number().min(0, "The fee can't be negative").max(100, "The fee can't be more than 100%").nullable(),
  feeFixedMinor: z.number().int().min(0).max(100_000_000).nullable(),
  holdMinutes: z.number().int().min(0, "The hold time can't be negative").max(60 * 24 * 90, "The hold time can be at most 90 days").nullable(),
  /** When withdrawals switch on; empty means they are on now. */
  withdrawalsActiveFrom: z.coerce.date().nullable(),
});

async function view(tenantId: string) {
  const terms = await termsFor(tenantId);
  return { ...terms, defaults: defaultTerms() };
}

async function assertTenant(tenantId: string) {
  const [tenant] = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw AppError.notFound("Account not found");
  return tenant;
}

export async function updatePaymentTerms(actor: { id: string }, tenantId: string, input: z.infer<typeof bodySchema>, ipAddress?: string) {
  const tenant = await assertTenant(tenantId);
  const before = await termsFor(tenantId);
  await db
    .update(tenants)
    .set({
      feePercent: input.feePercent === null ? null : input.feePercent.toFixed(2),
      feeFixedMinor: input.feeFixedMinor,
      holdMinutes: input.holdMinutes,
      withdrawalsActiveFrom: input.withdrawalsActiveFrom,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
  const after = await termsFor(tenantId);
  const snapshot = (t: typeof before) => ({ feePercent: t.feePercent, feeFixedMinor: t.feeFixedMinor, holdMinutes: t.holdMinutes, withdrawalsActiveFrom: t.withdrawalsActiveFrom?.toISOString() ?? null });
  // Everything that changes how an organization is charged or paid is on the record, with the old and the new value.
  await recordAudit({
    actorUserId: actor.id,
    action: "tenant.payment_terms",
    label: "Changed an organization's payment terms",
    entityType: "tenant",
    entityId: tenantId,
    entityLabel: tenant.name,
    metadata: { before: snapshot(before), after: snapshot(after) },
    ipAddress,
  });
  await notifyAdmins(tenantId, {
    heading: "Your payment terms were updated",
    message: "The platform updated the fee and the withdrawal timing for your organization's payments. It applies to payments from now on.",
    details: [
      { label: "Platform fee", value: `${after.feePercent}%${after.feeFixedMinor > 0 ? ` + ${formatMinor(after.feeFixedMinor)}` : ""}` },
      { label: "Hold before withdrawal", value: after.holdMinutes === 0 ? "None" : `${after.holdMinutes} minutes` },
      { label: "Withdrawals", value: after.withdrawalsActiveFrom && after.withdrawalsActiveFrom.getTime() > Date.now() ? `Active from ${after.withdrawalsActiveFrom.toUTCString()}` : "Active" },
    ],
  });
  return view(tenantId);
}

/** For the platform's super admin: one organization's fee, hold time and withdrawal activation. */
export async function platformPaymentTermsRoutes(app: FastifyInstance) {
  app.get<{ Params: { tenantId: string } }>("/tenants/:tenantId/payment-terms", async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    await assertTenant(tenantId);
    reply.header("Cache-Control", "no-store");
    return sendSuccess(reply, await view(tenantId));
  });

  app.put<{ Params: { tenantId: string } }>("/tenants/:tenantId/payment-terms", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    if (!request.user) throw AppError.unauthorized();
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const input = bodySchema.parse(request.body);
    return sendSuccess(reply, await updatePaymentTerms(request.user, tenantId, input, request.ip), "Payment terms saved");
  });
}
