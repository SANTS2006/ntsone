import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { db } from "../../db/client.js";
import { businesses, payments, polls, programs, registrations, users } from "../../db/schema/index.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { auditContext, type AuditContext } from "./context.js";
import { describeRequest, isLoggedGet, isViewEvent } from "./describe.js";
import { completeDraft, enqueueAudit, type AuditDraft } from "./recorder.js";
import { sanitizeForAudit, sanitizeQuery } from "./sanitize.js";

// Every action in the system is written to the audit log by this hook, without each feature having to remember to:
//  - every request that changes something (create, update, delete, submit, upload, sign in/out, payment, vote...);
//  - downloads, exports, and opening of sensitive records;
//  - what visitors do on the live registration and order pages (opening them, submitting, paying, downloading);
//  - failed and refused attempts, which are the ones that matter most.
// Named events the code records itself (recordAudit) are folded into the same request instead of being repeated.

type AuditedRequest = FastifyRequest & { auditCtx?: AuditContext };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- which account a request belongs to

const tenantCache = new TtlCache<string | null>(5_000);
const cached = (key: string, load: () => Promise<string | null>) => tenantCache.get(key, 60_000, load).catch(() => null);

const firstTenant = async (rows: Promise<{ tenantId: string | null }[]>) => (await rows)[0]?.tenantId ?? null;

/** The account whose data a request touched: the owner of the program, poll, business or person it names. */
export async function resolveTenantId(request: FastifyRequest, pattern: string): Promise<string | null> {
  const p = (request.params ?? {}) as Record<string, string | undefined>;
  if (p.tenantId && UUID.test(p.tenantId)) return p.tenantId;
  if (p.programId && UUID.test(p.programId)) {
    return cached(`program:${p.programId}`, () => firstTenant(db.select({ tenantId: programs.tenantId }).from(programs).where(eq(programs.id, p.programId!)).limit(1)));
  }
  if (p.pollId && UUID.test(p.pollId)) {
    return cached(`poll:${p.pollId}`, () => firstTenant(db.select({ tenantId: polls.tenantId }).from(polls).where(eq(polls.id, p.pollId!)).limit(1)));
  }
  if (p.businessId && UUID.test(p.businessId)) {
    return cached(`business:${p.businessId}`, () => firstTenant(db.select({ tenantId: businesses.tenantId }).from(businesses).where(eq(businesses.id, p.businessId!)).limit(1)));
  }
  if (p.slug) {
    const slug = p.slug.slice(0, 200);
    if (pattern.startsWith("/api/voter/")) {
      return cached(`pollslug:${slug}`, () => firstTenant(db.select({ tenantId: polls.tenantId }).from(polls).where(eq(polls.slug, slug)).limit(1)));
    }
    return cached(`programslug:${slug}`, () => firstTenant(db.select({ tenantId: programs.tenantId }).from(programs).where(eq(programs.slug, slug)).limit(1)));
  }
  if (p.token && pattern.includes("/payments/")) {
    // The signed link is only read here to find the account; it is not trusted for anything else.
    const sub = p.token.split(".")[0];
    if (sub && UUID.test(sub)) {
      return cached(`payment:${sub}`, () => firstTenant(db.select({ tenantId: payments.tenantId }).from(payments).where(eq(payments.id, sub)).limit(1)));
    }
  }
  if (p.token && pattern.includes("/submissions/")) {
    const sub = (jwt.decode(p.token) as { sub?: string } | null)?.sub;
    if (sub && UUID.test(sub)) {
      return cached(`submission:${sub}`, () =>
        firstTenant(
          db
            .select({ tenantId: programs.tenantId })
            .from(registrations)
            .innerJoin(programs, eq(programs.id, registrations.programId))
            .where(eq(registrations.id, sub))
            .limit(1),
        ),
      );
    }
  }
  if (p.userId && UUID.test(p.userId)) {
    return cached(`user:${p.userId}`, () => firstTenant(db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, p.userId!)).limit(1)));
  }
  return null;
}

// ---------------------------------------------------------------- what to record

/** Page views by visitors are kept once per person per page per ten minutes, so a busy form does not flood the log. */
const recentViews = new Map<string, number>();
const VIEW_WINDOW_MS = 10 * 60_000;

export function seenRecently(key: string): boolean {
  const now = Date.now();
  const last = recentViews.get(key);
  if (last !== undefined && now - last < VIEW_WINDOW_MS) return true;
  if (recentViews.size > 5_000) {
    for (const [k, t] of recentViews) if (now - t >= VIEW_WINDOW_MS) recentViews.delete(k);
    if (recentViews.size > 5_000) recentViews.clear();
  }
  recentViews.set(key, now);
  return false;
}

const outcomeOf = (status: number): AuditDraft["outcome"] => (status === 401 || status === 403 ? "denied" : status >= 400 ? "failed" : "success");

/** True when this request is the kind that is written to the log. */
export function shouldAudit(method: string, pattern: string): boolean {
  if (!pattern.startsWith("/api/")) return false;
  if (method === "OPTIONS" || method === "HEAD") return false;
  // Reading the audit log is not logged (it would record itself every time the page refreshes); exporting it is.
  if (pattern.startsWith("/api/audit-logs") && !pattern.endsWith("/export")) return false;
  if (method === "GET") return isLoggedGet(pattern);
  return true;
}

export function registerRequestAudit(app: FastifyInstance) {
  app.addHook("onRequest", (request, _reply, done) => {
    const pattern = request.routeOptions?.url ?? request.url.split("?")[0] ?? "";
    if (!shouldAudit(request.method, pattern)) return done();
    const ctx: AuditContext = {
      requestId: request.id,
      method: request.method,
      path: pattern,
      ip: request.ip,
      userAgent: request.headers["user-agent"]?.slice(0, 300),
      pending: [],
    };
    (request as AuditedRequest).auditCtx = ctx;
    auditContext.run(ctx, done);
  });

  // Later stages of the request can run outside the first one's async chain, so the context is put back.
  app.addHook("preHandler", (request, _reply, done) => {
    const ctx = (request as AuditedRequest).auditCtx;
    if (ctx) auditContext.enterWith(ctx);
    done();
  });

  app.addHook("onResponse", async (request, reply) => {
    const ctx = (request as AuditedRequest).auditCtx;
    if (!ctx) return;
    try {
      const status = reply.statusCode;
      const outcome = outcomeOf(status);
      const described = describeRequest(ctx.method, ctx.path, request.params as Record<string, unknown>);

      // A successful sign-in session renewal happens constantly in the background; only its failures are interesting.
      if (ctx.path === "/api/auth/refresh" && status < 400) return;

      // Who did it.
      const user = request.user;
      const actor: Partial<AuditDraft> = user
        ? { actorUserId: user.id, actorType: "user", actorName: user.name, actorEmail: user.email, actorRole: user.role }
        : ctx.path.startsWith("/api/webhooks/")
          ? { actorType: "system", actorName: "Monime" }
          : ctx.path.startsWith("/api/voter/")
            ? { actorType: "voter", actorName: "Voter" }
            : { actorType: "visitor", actorName: "Visitor" };

      const tenantId = (await resolveTenantId(request, ctx.path)) ?? user?.tenantId ?? null;

      const drafts: AuditDraft[] = [...ctx.pending];
      if (drafts.length === 0) {
        // Opening a live page is recorded once per visitor per ten minutes.
        if (isViewEvent(described.action) && status < 400 && seenRecently(`${ctx.ip}|${ctx.path}|${described.entityId ?? ""}|${described.action}`)) return;
        const params = { ...(request.params as Record<string, unknown>) };
        delete params.token;
        drafts.push({
          action: described.action,
          label: described.label,
          entityType: described.entityType,
          entityId: described.entityId,
          source: "request",
          metadata: {
            ...(Object.keys(params).length ? { params } : {}),
            ...(sanitizeQuery(request.query) ? { query: sanitizeQuery(request.query) } : {}),
            ...(request.body !== undefined && ctx.method !== "GET" ? { body: sanitizeForAudit(request.body) } : {}),
          },
        });
      }

      const rows = await Promise.all(
        drafts.map((draft) =>
          completeDraft({
            ...actor,
            ...draft,
            // An event the code recorded names its own person and account when it knows them.
            actorUserId: draft.actorUserId ?? actor.actorUserId ?? null,
            actorType: draft.actorUserId && draft.actorUserId !== actor.actorUserId ? "user" : (draft.actorType ?? actor.actorType),
            actorName: draft.actorUserId && draft.actorUserId !== actor.actorUserId ? null : (draft.actorName ?? actor.actorName),
            actorEmail: draft.actorUserId && draft.actorUserId !== actor.actorUserId ? null : (draft.actorEmail ?? actor.actorEmail),
            actorRole: draft.actorUserId && draft.actorUserId !== actor.actorUserId ? null : (draft.actorRole ?? actor.actorRole),
            tenantId: draft.tenantId ?? tenantId,
            statusCode: status,
            outcome: draft.outcome && draft.outcome !== "success" ? draft.outcome : outcome,
            requestId: ctx.requestId,
            method: ctx.method,
            path: ctx.path,
            userAgent: ctx.userAgent,
            ipAddress: draft.ipAddress ?? ctx.ip,
          }),
        ),
      );
      enqueueAudit(rows);
    } catch (err) {
      // The log must never get in the way of the request it describes.
      request.log.error({ err }, "Could not record the request in the audit log");
    }
  });
}
