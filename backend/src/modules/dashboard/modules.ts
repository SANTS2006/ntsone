import { and, count, countDistinct, desc, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  businessDocuments,
  businesses,
  pollPositions,
  pollVotes,
  polls,
  programs,
  registrations,
} from "../../db/schema/index.js";
import { resolveStatuses, statusLabelFor } from "../../shared/designs/index.js";
import { listAccessibleBusinessIds } from "../businesses/access.js";
import { listAccessiblePollIds } from "../polls/access.js";
import { pollState } from "../polls/service.js";
import { getAuditInsights } from "../audit/insights.js";
import { getBookkeepingInsights } from "../bookkeeping/insights.js";
import { getPaymentInsights } from "../payments/insights.js";
import type { AuthenticatedUser } from "../users/types.js";

const NONE = "00000000-0000-0000-0000-000000000000";
const TREND_DAYS = 30;

const scope = (column: Parameters<typeof inArray>[0], ids: string[] | "all"): SQL | undefined =>
  ids === "all" ? undefined : inArray(column, ids.length ? ids : [NONE]);

const n = (value: unknown) => Number(value ?? 0);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function lastDays(rows: { day: string; value: unknown }[], start: Date) {
  const byDay = new Map(rows.map((r) => [r.day, n(r.value)]));
  return Array.from({ length: TREND_DAYS }, (_, i) => {
    const date = isoDay(new Date(start.getTime() + i * 86_400_000));
    return { date, count: byDay.get(date) ?? 0 };
  });
}

/** Voting polls and businesses (orders, invoices, receipts) at a glance for the dashboard. */
export async function getModuleInsights(user: AuthenticatedUser) {
  const [pollIds, businessIds] = await Promise.all([listAccessiblePollIds(user), listAccessibleBusinessIds(user)]);

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86_400_000);
  const trendStart = new Date(startOfToday.getTime() - (TREND_DAYS - 1) * 86_400_000);

  // ---- Polls
  const pollScope = and(isNull(polls.deletedAt), scope(polls.id, pollIds));
  const voteScope = scope(pollVotes.pollId, pollIds);
  const [pollRows, [voteRow], voteTrendRows] = await Promise.all([
    db.select().from(polls).where(pollScope).orderBy(desc(polls.createdAt)),
    db
      .select({
        votes: sql<number>`coalesce(sum(${pollVotes.weight}), 0)`,
        voters: countDistinct(pollVotes.voterId),
        week: sql<number>`coalesce(sum(${pollVotes.weight}) filter (where ${pollVotes.createdAt} >= ${startOfWeek}), 0)`,
        today: sql<number>`coalesce(sum(${pollVotes.weight}) filter (where ${pollVotes.createdAt} >= ${startOfToday}), 0)`,
      })
      .from(pollVotes)
      .innerJoin(polls, eq(polls.id, pollVotes.pollId))
      .where(and(isNull(polls.deletedAt), voteScope)),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${pollVotes.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`, value: sql<number>`coalesce(sum(${pollVotes.weight}), 0)` })
      .from(pollVotes)
      .innerJoin(polls, eq(polls.id, pollVotes.pollId))
      .where(and(isNull(polls.deletedAt), voteScope, gte(pollVotes.createdAt, trendStart)))
      .groupBy(sql`1`),
  ]);
  const pollIdList = pollRows.map((p) => p.id);
  const [positionCounts, voterCounts] = pollIdList.length
    ? await Promise.all([
        db.select({ pollId: pollPositions.pollId, value: count() }).from(pollPositions).where(inArray(pollPositions.pollId, pollIdList)).groupBy(pollPositions.pollId),
        db
          .select({ pollId: pollVotes.pollId, value: countDistinct(pollVotes.voterId), votes: sql<number>`coalesce(sum(${pollVotes.weight}), 0)` })
          .from(pollVotes)
          .where(inArray(pollVotes.pollId, pollIdList))
          .groupBy(pollVotes.pollId),
      ])
    : [[], []];
  const positionsBy = new Map(positionCounts.map((r) => [r.pollId, n(r.value)]));
  const votersBy = new Map(voterCounts.map((r) => [r.pollId, { voters: n(r.value), votes: n(r.votes) }]));
  const states = pollRows.map((p) => pollState(p));

  const pollSummary = {
    total: pollRows.length,
    open: states.filter((s) => s === "open").length,
    draft: states.filter((s) => s === "draft").length,
    closed: states.filter((s) => s === "closed").length,
    peopleVoted: n(voteRow?.voters),
    votesCast: n(voteRow?.votes),
    votesThisWeek: n(voteRow?.week),
    votesToday: n(voteRow?.today),
    trend: lastDays(voteTrendRows, trendStart),
    // Polls that are open or closing soonest come first, then the newest.
    top: pollRows
      .map((p, i) => ({ poll: p, state: states[i]! }))
      .sort((a, b) => Number(b.state === "open") - Number(a.state === "open"))
      .slice(0, 5)
      .map(({ poll, state }) => ({
        id: poll.id,
        name: poll.name,
        slug: poll.slug,
        imageUrl: poll.imageUrl,
        state,
        closesAt: poll.closesAt,
        positions: positionsBy.get(poll.id) ?? 0,
        voters: votersBy.get(poll.id)?.voters ?? 0,
        votes: votersBy.get(poll.id)?.votes ?? 0,
      })),
  };

  // ---- Businesses
  const businessScope = and(isNull(businesses.deletedAt), scope(businesses.id, businessIds));
  const orderScope = and(eq(programs.kind, "order_form"), isNull(programs.deletedAt), scope(programs.businessId, businessIds));
  const docScope = and(isNull(businessDocuments.deletedAt), scope(businessDocuments.businessId, businessIds));

  const [businessRows, [orderRow], orderTrendRows, docRows, recentOrders, orderCounts] = await Promise.all([
    db.select().from(businesses).where(businessScope).orderBy(desc(businesses.createdAt)),
    db
      .select({
        total: count(registrations.id),
        week: sql<number>`count(*) filter (where ${registrations.submittedAt} >= ${startOfWeek})`,
        today: sql<number>`count(*) filter (where ${registrations.submittedAt} >= ${startOfToday})`,
        fresh: sql<number>`count(*) filter (where ${registrations.status} = 'submitted')`,
        open: sql<number>`count(*) filter (where ${registrations.status} not in ('completed', 'delivered', 'cancelled', 'rejected'))`,
      })
      .from(registrations)
      .innerJoin(programs, eq(programs.id, registrations.programId))
      .where(orderScope),
    db
      .select({ day: sql<string>`to_char(date_trunc('day', ${registrations.submittedAt} at time zone 'UTC'), 'YYYY-MM-DD')`, value: count() })
      .from(registrations)
      .innerJoin(programs, eq(programs.id, registrations.programId))
      .where(and(orderScope, gte(registrations.submittedAt, trendStart)))
      .groupBy(sql`1`),
    db
      .select({
        kind: businessDocuments.kind,
        currency: businessDocuments.currency,
        count: count(),
        total: sql<string>`coalesce(sum(${businessDocuments.total}) filter (where ${businessDocuments.status} not in ('cancelled', 'void')), 0)`,
        paid: sql<string>`coalesce(sum(${businessDocuments.amountPaid}) filter (where ${businessDocuments.status} not in ('cancelled', 'void')), 0)`,
      })
      .from(businessDocuments)
      .where(docScope)
      .groupBy(businessDocuments.kind, businessDocuments.currency),
    db
      .select({
        id: registrations.id,
        programId: registrations.programId,
        businessId: programs.businessId,
        businessName: businesses.name,
        statusConfig: businesses.statusConfig,
        applicantName: registrations.applicantName,
        orderNumber: registrations.registrationNumber,
        status: registrations.status,
        submittedAt: registrations.submittedAt,
      })
      .from(registrations)
      .innerJoin(programs, eq(programs.id, registrations.programId))
      .innerJoin(businesses, eq(businesses.id, programs.businessId))
      .where(orderScope)
      .orderBy(desc(registrations.submittedAt))
      .limit(6),
    db
      .select({ businessId: programs.businessId, value: count(registrations.id) })
      .from(programs)
      .leftJoin(registrations, eq(registrations.programId, programs.id))
      .where(orderScope)
      .groupBy(programs.businessId),
  ]);

  const docCountsByBusiness = businessRows.length
    ? await db
        .select({ businessId: businessDocuments.businessId, kind: businessDocuments.kind, value: count() })
        .from(businessDocuments)
        .where(and(isNull(businessDocuments.deletedAt), inArray(businessDocuments.businessId, businessRows.map((b) => b.id))))
        .groupBy(businessDocuments.businessId, businessDocuments.kind)
    : [];
  const ordersBy = new Map(orderCounts.map((r) => [r.businessId, n(r.value)]));
  const docsBy = (businessId: string, kind: "invoice" | "receipt") =>
    n(docCountsByBusiness.find((d) => d.businessId === businessId && d.kind === kind)?.value);

  const money = (kind: "invoice" | "receipt") =>
    docRows
      .filter((r) => r.kind === kind)
      .map((r) => ({ currency: r.currency, count: n(r.count), total: n(r.total), paid: n(r.paid) }));
  const invoiceMoney = money("invoice");
  const receiptMoney = money("receipt");

  const businessSummary = {
    total: businessRows.length,
    orders: { total: n(orderRow?.total), thisWeek: n(orderRow?.week), today: n(orderRow?.today), new: n(orderRow?.fresh), inProgress: n(orderRow?.open) },
    invoices: { count: invoiceMoney.reduce((sum, r) => sum + r.count, 0), money: invoiceMoney },
    receipts: { count: receiptMoney.reduce((sum, r) => sum + r.count, 0), money: receiptMoney },
    trend: lastDays(orderTrendRows, trendStart),
    top: [...businessRows]
      .sort((a, b) => (ordersBy.get(b.id) ?? 0) - (ordersBy.get(a.id) ?? 0))
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        name: b.name,
        logoUrl: b.logoUrl,
        orders: ordersBy.get(b.id) ?? 0,
        invoices: docsBy(b.id, "invoice"),
        receipts: docsBy(b.id, "receipt"),
      })),
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      businessId: o.businessId,
      businessName: o.businessName,
      customer: o.applicantName,
      orderNumber: o.orderNumber,
      status: o.status,
      statusLabel: statusLabelFor(resolveStatuses(o.statusConfig, "order"), o.status),
      submittedAt: o.submittedAt,
    })),
  };

  // Payments for everyone with something to collect; the audit log only for the platform team.
  const [paymentSummary, auditSummary, booksSummary] = await Promise.all([getPaymentInsights(user), user.role === "super_admin" ? getAuditInsights() : Promise.resolve(null), getBookkeepingInsights(user)]);

  return { polls: pollSummary, businesses: businessSummary, payments: paymentSummary, audit: auditSummary, books: booksSummary };
}
