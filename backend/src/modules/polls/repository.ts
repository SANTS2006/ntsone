import { dateRangeConditions, type DateRange } from "../../lib/dateRange.js";
import { and, asc, count, countDistinct, desc, eq, ilike, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { pollCandidates, pollMembers, pollPositions, polls, pollVerifiedVoters, pollVoters, pollVotes, users, voterAccounts } from "../../db/schema/index.js";
import { toOffsetLimit, type PaginationInput } from "../../lib/pagination.js";
import type { SaveBallotInput } from "./schemas.js";

export type PollRow = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type PositionRow = typeof pollPositions.$inferSelect;
export type CandidateRow = typeof pollCandidates.$inferSelect;

export async function insertPoll(values: NewPoll): Promise<PollRow> {
  const [row] = await db.insert(polls).values(values).returning();
  return row!;
}

export async function addPollMember(userId: string, pollId: string, role: "admin" | "viewer") {
  await db.insert(pollMembers).values({ userId, pollId, roleOnPoll: role }).onConflictDoNothing();
}

export async function findPollById(id: string): Promise<PollRow | null> {
  const [row] = await db.select().from(polls).where(and(eq(polls.id, id), isNull(polls.deletedAt))).limit(1);
  return row ?? null;
}

export async function findPollBySlug(slug: string): Promise<PollRow | null> {
  const [row] = await db.select().from(polls).where(and(eq(polls.slug, slug), isNull(polls.deletedAt))).limit(1);
  return row ?? null;
}

export async function slugExists(slug: string): Promise<boolean> {
  const [row] = await db.select({ id: polls.id }).from(polls).where(eq(polls.slug, slug)).limit(1);
  return !!row;
}

export async function updatePollRow(id: string, values: Partial<NewPoll>): Promise<PollRow> {
  const [row] = await db
    .update(polls)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(polls.id, id))
    .returning();
  return row!;
}

export async function softDeletePoll(id: string) {
  await db.update(polls).set({ deletedAt: new Date() }).where(eq(polls.id, id));
}

export async function listPolls(
  filters: { accessiblePollIds: string[] | "all"; search?: string; status?: PollRow["status"] },
  pagination: PaginationInput,
) {
  const conditions = [isNull(polls.deletedAt)];
  if (filters.accessiblePollIds !== "all") {
    if (filters.accessiblePollIds.length === 0) return { items: [], total: 0 };
    conditions.push(inArray(polls.id, filters.accessiblePollIds));
  }
  if (filters.status) conditions.push(eq(polls.status, filters.status));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(ilike(polls.name, term), ilike(polls.slug, term))!);
  }
  const where = and(...conditions);
  const { limit, offset } = toOffsetLimit(pagination);

  const [rows, totalRow] = await Promise.all([
    db.select().from(polls).where(where).orderBy(desc(polls.createdAt)).limit(limit).offset(offset),
    db.select({ value: count() }).from(polls).where(where),
  ]);
  const ids = rows.map((r) => r.id);
  const [positionCounts, voterCounts] = ids.length
    ? await Promise.all([
        db.select({ pollId: pollPositions.pollId, value: count() }).from(pollPositions).where(inArray(pollPositions.pollId, ids)).groupBy(pollPositions.pollId),
        db
          .select({ pollId: pollVotes.pollId, value: countDistinct(pollVotes.voterId) })
          .from(pollVotes)
          .where(inArray(pollVotes.pollId, ids))
          .groupBy(pollVotes.pollId),
      ])
    : [[], []];
  const positionsBy = new Map(positionCounts.map((r) => [r.pollId, Number(r.value)]));
  const votersBy = new Map(voterCounts.map((r) => [r.pollId, Number(r.value)]));
  return {
    items: rows.map((r) => ({ ...r, positionCount: positionsBy.get(r.id) ?? 0, voterCount: votersBy.get(r.id) ?? 0 })),
    total: Number(totalRow[0]?.value ?? 0),
  };
}

export async function getBallot(pollId: string): Promise<(PositionRow & { candidates: CandidateRow[] })[]> {
  const [positions, candidates] = await Promise.all([
    db.select().from(pollPositions).where(eq(pollPositions.pollId, pollId)).orderBy(asc(pollPositions.orderIndex), asc(pollPositions.createdAt)),
    db.select().from(pollCandidates).where(eq(pollCandidates.pollId, pollId)).orderBy(asc(pollCandidates.orderIndex), asc(pollCandidates.createdAt)),
  ]);
  return positions.map((p) => ({ ...p, candidates: candidates.filter((c) => c.positionId === p.id) }));
}

/** Positions and candidates that already have votes, which the ballot editor must not delete. */
export async function votedIds(pollId: string) {
  const rows = await db
    .selectDistinct({ positionId: pollVotes.positionId, candidateId: pollVotes.candidateId })
    .from(pollVotes)
    .where(eq(pollVotes.pollId, pollId));
  return { positions: new Set(rows.map((r) => r.positionId)), candidates: new Set(rows.map((r) => r.candidateId)) };
}

/**
 * Saves the whole ballot: updates positions and candidates that keep their id, adds new ones,
 * and removes the ones left out. Order follows the list order.
 */
export async function saveBallot(pollId: string, input: SaveBallotInput) {
  await db.transaction(async (tx) => {
    const keptPositionIds = input.positions.map((p) => p.id).filter((id): id is string => !!id);
    const keptCandidateIds = input.positions.flatMap((p) => p.candidates.map((c) => c.id)).filter((id): id is string => !!id);

    await tx
      .delete(pollCandidates)
      .where(and(eq(pollCandidates.pollId, pollId), keptCandidateIds.length ? notInArray(pollCandidates.id, keptCandidateIds) : sql`true`));
    await tx
      .delete(pollPositions)
      .where(and(eq(pollPositions.pollId, pollId), keptPositionIds.length ? notInArray(pollPositions.id, keptPositionIds) : sql`true`));

    for (const [pi, position] of input.positions.entries()) {
      const values = { title: position.title, description: position.description, imageUrl: position.imageUrl, orderIndex: pi };
      let positionId = position.id;
      if (positionId) {
        await tx.update(pollPositions).set(values).where(and(eq(pollPositions.id, positionId), eq(pollPositions.pollId, pollId)));
      } else {
        const [row] = await tx.insert(pollPositions).values({ ...values, pollId }).returning({ id: pollPositions.id });
        positionId = row!.id;
      }
      for (const [ci, candidate] of position.candidates.entries()) {
        const cValues = { name: candidate.name, description: candidate.description, imageUrl: candidate.imageUrl, orderIndex: ci, positionId };
        if (candidate.id) {
          await tx.update(pollCandidates).set(cValues).where(and(eq(pollCandidates.id, candidate.id), eq(pollCandidates.pollId, pollId)));
        } else {
          await tx.insert(pollCandidates).values({ ...cValues, pollId });
        }
      }
    }
  });
}

export async function voteCounts(pollId: string) {
  return db
    .select({ positionId: pollVotes.positionId, candidateId: pollVotes.candidateId, votes: sql<number>`coalesce(sum(${pollVotes.weight}), 0)` })
    .from(pollVotes)
    .where(eq(pollVotes.pollId, pollId))
    .groupBy(pollVotes.positionId, pollVotes.candidateId);
}

export async function pollTotals(pollId: string) {
  const [[voted], [registered], [votes]] = await Promise.all([
    db.select({ value: countDistinct(pollVotes.voterId) }).from(pollVotes).where(eq(pollVotes.pollId, pollId)),
    db.select({ value: count() }).from(pollVoters).where(eq(pollVoters.pollId, pollId)),
    db.select({ value: sql<number>`coalesce(sum(${pollVotes.weight}), 0)` }).from(pollVotes).where(eq(pollVotes.pollId, pollId)),
  ]);
  return { voters: Number(voted?.value ?? 0), registeredVoters: Number(registered?.value ?? 0), votes: Number(votes?.value ?? 0) };
}

export async function positionVoterCounts(pollId: string) {
  return db
    .select({ positionId: pollVotes.positionId, voters: countDistinct(pollVotes.voterId) })
    .from(pollVotes)
    .where(eq(pollVotes.pollId, pollId))
    .groupBy(pollVotes.positionId);
}

export async function listVoters(pollId: string, search: string | undefined, pagination: PaginationInput, range: DateRange = {}) {
  const conditions = [eq(pollVoters.pollId, pollId), ...dateRangeConditions(pollVoters.joinedAt, range)];
  if (search) {
    const term = `%${search}%`;
    conditions.push(or(ilike(voterAccounts.name, term), ilike(voterAccounts.email, term))!);
  }
  const where = and(...conditions);
  const { limit, offset } = toOffsetLimit(pagination);
  const votesCast = db
    .select({ voterId: pollVotes.voterId, votes: sql<number>`coalesce(sum(${pollVotes.weight}), 0)`.as("votes"), lastVotedAt: sql<Date>`max(${pollVotes.createdAt})`.as("last_voted_at") })
    .from(pollVotes)
    .where(eq(pollVotes.pollId, pollId))
    .groupBy(pollVotes.voterId)
    .as("votes_cast");

  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: voterAccounts.id,
        name: voterAccounts.name,
        email: voterAccounts.email,
        signInMethod: sql<string>`case when ${voterAccounts.googleId} is not null then 'google' else 'email' end`,
        joinedAt: pollVoters.joinedAt,
        votes: sql<number>`coalesce(${votesCast.votes}, 0)`,
        lastVotedAt: votesCast.lastVotedAt,
      })
      .from(pollVoters)
      .innerJoin(voterAccounts, eq(voterAccounts.id, pollVoters.voterId))
      .leftJoin(votesCast, eq(votesCast.voterId, pollVoters.voterId))
      .where(where)
      .orderBy(desc(pollVoters.joinedAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(pollVoters).innerJoin(voterAccounts, eq(voterAccounts.id, pollVoters.voterId)).where(where),
  ]);
  return { items: items.map((i) => ({ ...i, votes: Number(i.votes) })), total: Number(totalRow[0]?.value ?? 0) };
}

export async function votedPositionIds(pollId: string, voterId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ positionId: pollVotes.positionId })
    .from(pollVotes)
    .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.voterId, voterId)));
  return rows.map((r) => r.positionId);
}

/** Positions this poll has a vote for under any of these ballot keys (one key per position and person). */
export async function votedPositionIdsByKeys(pollId: string, ballotKeys: string[]): Promise<string[]> {
  if (!ballotKeys.length) return [];
  const rows = await db
    .selectDistinct({ positionId: pollVotes.positionId })
    .from(pollVotes)
    .where(and(eq(pollVotes.pollId, pollId), inArray(pollVotes.ballotKey, ballotKeys)));
  return rows.map((r) => r.positionId);
}

/** Records a vote; returns false when the ballot key is taken (this voter already voted here). */
export async function insertVote(values: typeof pollVotes.$inferInsert): Promise<boolean> {
  const rows = await db.insert(pollVotes).values(values).onConflictDoNothing({ target: pollVotes.ballotKey }).returning({ id: pollVotes.id });
  return rows.length > 0;
}

export async function findCandidate(pollId: string, positionId: string, candidateId: string) {
  const [row] = await db
    .select()
    .from(pollCandidates)
    .where(and(eq(pollCandidates.id, candidateId), eq(pollCandidates.positionId, positionId), eq(pollCandidates.pollId, pollId)))
    .limit(1);
  return row ?? null;
}

export async function findPosition(pollId: string, positionId: string) {
  const [row] = await db
    .select()
    .from(pollPositions)
    .where(and(eq(pollPositions.id, positionId), eq(pollPositions.pollId, pollId)))
    .limit(1);
  return row ?? null;
}

export async function addPollVoter(pollId: string, voterId: string) {
  await db.insert(pollVoters).values({ pollId, voterId }).onConflictDoNothing();
}

/** The poll's team for notification emails: its members plus the account admins. */
export async function listPollNotificationRecipients(poll: Pick<PollRow, "id" | "tenantId">) {
  const members = db.select({ userId: pollMembers.userId }).from(pollMembers).where(eq(pollMembers.pollId, poll.id));
  return db
    .selectDistinct({ name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        isNotNull(users.emailVerifiedAt),
        or(and(eq(users.tenantId, poll.tenantId), eq(users.role, "admin")), inArray(users.id, members)),
      ),
    )
    .limit(50);
}

// ---------------------------------------------------------------------------
// Verified voters: emails an admin has pre-registered as eligible to vote

export async function isVerifiedVoter(pollId: string, emailKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: pollVerifiedVoters.id })
    .from(pollVerifiedVoters)
    .where(and(eq(pollVerifiedVoters.pollId, pollId), eq(pollVerifiedVoters.emailKey, emailKey)))
    .limit(1);
  return rows.length > 0;
}

export async function listVerifiedVoters(pollId: string) {
  const [rows, signedUp, voted] = await Promise.all([
    db.select().from(pollVerifiedVoters).where(eq(pollVerifiedVoters.pollId, pollId)).orderBy(asc(pollVerifiedVoters.createdAt), asc(pollVerifiedVoters.email)),
    db
      .select({ email: voterAccounts.email })
      .from(pollVoters)
      .innerJoin(voterAccounts, eq(voterAccounts.id, pollVoters.voterId))
      .where(eq(pollVoters.pollId, pollId)),
    db
      .selectDistinct({ email: voterAccounts.email })
      .from(pollVotes)
      .innerJoin(voterAccounts, eq(voterAccounts.id, pollVotes.voterId))
      .where(eq(pollVotes.pollId, pollId)),
  ]);
  return { rows, signedUpEmails: signedUp.map((r) => r.email), votedEmails: voted.map((r) => r.email) };
}

/** Makes the verified list exactly these emails: new ones are added, ones left out are removed. */
export async function replaceVerifiedVoters(pollId: string, entries: { email: string; emailKey: string }[]) {
  await db.transaction(async (tx) => {
    const keys = entries.map((e) => e.emailKey);
    if (keys.length === 0) await tx.delete(pollVerifiedVoters).where(eq(pollVerifiedVoters.pollId, pollId));
    else await tx.delete(pollVerifiedVoters).where(and(eq(pollVerifiedVoters.pollId, pollId), notInArray(pollVerifiedVoters.emailKey, keys)));
    for (let i = 0; i < entries.length; i += 500) {
      await tx
        .insert(pollVerifiedVoters)
        .values(entries.slice(i, i + 500).map((e) => ({ pollId, email: e.email, emailKey: e.emailKey })))
        .onConflictDoNothing();
    }
  });
}
