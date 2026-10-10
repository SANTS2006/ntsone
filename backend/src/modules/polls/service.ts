import QRCode from "qrcode";
import slugify from "slugify";
import { env } from "../../config/env.js";
import { canonicalEmail } from "../../lib/emailKey.js";
import { AppError } from "../../lib/errors.js";
import { buildPaginatedResult, type PaginationInput } from "../../lib/pagination.js";
import type { AuthenticatedUser } from "../users/types.js";
import { listAccessiblePollIds } from "./access.js";
import * as pollsRepo from "./repository.js";
import type { CreatePollInput, SaveBallotInput, UpdatePollInput } from "./schemas.js";

export type PollState = "draft" | "open" | "closed";

/** Open polls close by themselves once their closing time has passed. */
export function pollState(poll: Pick<pollsRepo.PollRow, "status" | "closesAt">, now = new Date()): PollState {
  if (poll.status === "open" && poll.closesAt && poll.closesAt <= now) return "closed";
  return poll.status;
}

export function allowedDomains(poll: Pick<pollsRepo.PollRow, "restrictEmailDomain" | "allowedEmailDomains">): string[] {
  if (!poll.restrictEmailDomain || !poll.allowedEmailDomains) return [];
  return poll.allowedEmailDomains.split(/[\s,]+/).filter(Boolean);
}

export function emailAllowed(poll: Pick<pollsRepo.PollRow, "restrictEmailDomain" | "allowedEmailDomains">, email: string): boolean {
  const domains = allowedDomains(poll);
  if (domains.length === 0) return true;
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return domains.includes(domain);
}

export function pollUrl(slug: string, positionId?: string) {
  const base = `${env.APP_URL.replace(/\/+$/, "")}/vote/${encodeURIComponent(slug)}`;
  return positionId ? `${base}/${positionId}` : base;
}

async function uniqueSlug(name: string) {
  const base = slugify(name, { lower: true, strict: true }).slice(0, 160) || "poll";
  let candidate = base;
  for (let n = 2; await pollsRepo.slugExists(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

export async function createPoll(user: AuthenticatedUser, input: CreatePollInput) {
  let tenantId = user.tenantId;
  if (user.role === "super_admin") {
    if (!input.tenantId) throw AppError.validation("Choose the account this poll belongs to");
    tenantId = input.tenantId;
  }
  if (!tenantId || user.role === "viewer") throw AppError.forbidden("This account cannot create polls");
  const poll = await pollsRepo.insertPoll({
    tenantId,
    createdBy: user.id,
    name: input.name,
    slug: await uniqueSlug(input.name),
    description: input.description,
  });
  // Tenant admins see every poll already; anyone else needs a membership to see what they made.
  if (user.role !== "admin" && user.role !== "super_admin") await pollsRepo.addPollMember(user.id, poll.id, "admin");
  return poll;
}

export async function listPolls(user: AuthenticatedUser, query: { page: number; pageSize: number; search?: string; status?: PollState }) {
  const accessiblePollIds = await listAccessiblePollIds(user);
  const pagination: PaginationInput = { page: query.page, pageSize: query.pageSize };
  const { items, total } = await pollsRepo.listPolls({ accessiblePollIds, search: query.search, status: query.status }, pagination);
  return buildPaginatedResult(
    items.map((p) => ({ ...p, state: pollState(p) })),
    total,
    pagination,
  );
}

export async function getPoll(pollId: string) {
  const poll = await pollsRepo.findPollById(pollId);
  if (!poll) throw AppError.notFound("Poll not found");
  return poll;
}

export async function updatePoll(pollId: string, input: UpdatePollInput) {
  const poll = await getPoll(pollId);
  const restrict = input.restrictEmailDomain ?? poll.restrictEmailDomain;
  const domains = input.allowedEmailDomains !== undefined ? input.allowedEmailDomains : poll.allowedEmailDomains;
  if (restrict && !domains) throw AppError.validation("Enter the email domain voters must use, e.g. example.edu");
  return pollsRepo.updatePollRow(pollId, input);
}

/** The poll's verified-voter setting and list, with who has signed up and voted. */
export async function getVerifiedVoters(pollId: string) {
  const poll = await getPoll(pollId);
  const { rows, signedUpEmails, votedEmails } = await pollsRepo.listVerifiedVoters(pollId);
  const signedUp = new Set(signedUpEmails.map(canonicalEmail));
  const voted = new Set(votedEmails.map(canonicalEmail));
  return {
    enabled: poll.verifiedVotersOnly,
    voters: rows.map((r) => ({ email: r.email, signedUp: signedUp.has(r.emailKey), voted: voted.has(r.emailKey) })),
  };
}

/** Saves the setting and makes the verified list exactly the emails given. */
export async function saveVerifiedVoters(pollId: string, input: { enabled: boolean; emails: string[] }) {
  await getPoll(pollId);
  const unique = new Map<string, { email: string; emailKey: string }>();
  for (const email of input.emails) {
    const emailKey = canonicalEmail(email);
    if (!unique.has(emailKey)) unique.set(emailKey, { email, emailKey });
  }
  if (input.enabled && unique.size === 0) {
    throw AppError.validation("Add at least one email before turning on verified voters, or nobody could vote");
  }
  await pollsRepo.replaceVerifiedVoters(pollId, [...unique.values()]);
  await pollsRepo.updatePollRow(pollId, { verifiedVotersOnly: input.enabled });
  return getVerifiedVoters(pollId);
}

export async function openPoll(pollId: string) {
  const poll = await getPoll(pollId);
  const ballot = await pollsRepo.getBallot(pollId);
  if (ballot.length === 0) throw AppError.conflict("Add at least one position to the ballot before opening the poll");
  const empty = ballot.find((p) => p.candidates.length < 1);
  if (empty) throw AppError.conflict(`Add at least one candidate to "${empty.title}" before opening the poll`);
  // Reopening after the set closing time would close again straight away, so the time is cleared.
  const closesAt = poll.closesAt && poll.closesAt <= new Date() ? null : poll.closesAt;
  return pollsRepo.updatePollRow(pollId, { status: "open", closesAt });
}

export async function closePoll(pollId: string) {
  await getPoll(pollId);
  return pollsRepo.updatePollRow(pollId, { status: "closed" });
}

export async function deletePoll(pollId: string) {
  await getPoll(pollId);
  await pollsRepo.softDeletePoll(pollId);
}

export async function saveBallot(pollId: string, input: SaveBallotInput) {
  await getPoll(pollId);
  const voted = await pollsRepo.votedIds(pollId);
  if (voted.positions.size) {
    const keptPositions = new Set(input.positions.map((p) => p.id).filter(Boolean));
    const keptCandidates = new Set(input.positions.flatMap((p) => p.candidates.map((c) => c.id)).filter(Boolean));
    const lostPosition = [...voted.positions].some((id) => !keptPositions.has(id));
    const lostCandidate = [...voted.candidates].some((id) => !keptCandidates.has(id));
    if (lostPosition || lostCandidate) {
      throw AppError.conflict("Positions and candidates that already have votes can't be removed. You can still rename them.");
    }
  }
  await pollsRepo.saveBallot(pollId, input);
  return pollsRepo.getBallot(pollId);
}

export interface CandidateResult {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  votes: number;
  percent: number;
  rank: number;
}

export interface PositionResult {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  totalVotes: number;
  voters: number;
  candidates: CandidateResult[];
  /** Everyone sharing the top vote count (more than one means a tie); empty before any votes. */
  winnerIds: string[];
}

/** Vote counts, percentages, and positions (1st, 2nd, ...) for every position on the ballot. */
export async function buildResults(pollId: string) {
  const [ballot, counts, totals, positionVoters] = await Promise.all([
    pollsRepo.getBallot(pollId),
    pollsRepo.voteCounts(pollId),
    pollsRepo.pollTotals(pollId),
    pollsRepo.positionVoterCounts(pollId),
  ]);
  const votesBy = new Map(counts.map((c) => [c.candidateId, Number(c.votes)]));
  const votersBy = new Map(positionVoters.map((p) => [p.positionId, Number(p.voters)]));

  const positions: PositionResult[] = ballot.map((position) => {
    const totalVotes = position.candidates.reduce((sum, c) => sum + (votesBy.get(c.id) ?? 0), 0);
    const ranked = position.candidates
      .map((c) => ({ c, votes: votesBy.get(c.id) ?? 0 }))
      .sort((a, b) => b.votes - a.votes);
    const candidates: CandidateResult[] = position.candidates.map((c) => {
      const votes = votesBy.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        imageUrl: c.imageUrl,
        votes,
        percent: totalVotes ? Math.round((votes / totalVotes) * 1000) / 10 : 0,
        // Candidates with the same votes share a place.
        rank: 1 + ranked.filter((r) => r.votes > votes).length,
      };
    });
    const top = ranked[0]?.votes ?? 0;
    return {
      id: position.id,
      title: position.title,
      description: position.description,
      imageUrl: position.imageUrl,
      totalVotes,
      voters: votersBy.get(position.id) ?? 0,
      candidates,
      winnerIds: top > 0 ? ranked.filter((r) => r.votes === top).map((r) => r.c.id) : [],
    };
  });

  return { ...totals, positions, updatedAt: new Date().toISOString() };
}

export async function listVoters(pollId: string, search: string | undefined, pagination: PaginationInput, range: { dateFrom?: Date; dateTo?: Date } = {}) {
  const { items, total } = await pollsRepo.listVoters(pollId, search, pagination, range);
  return buildPaginatedResult(items, total, pagination);
}

export async function shareInfo(pollId: string) {
  const poll = await getPoll(pollId);
  const ballot = await pollsRepo.getBallot(pollId);
  const qr = (url: string) => QRCode.toDataURL(url, { margin: 1, width: 320 });
  const url = pollUrl(poll.slug);
  return {
    poll: { url, qrCodeDataUrl: await qr(url) },
    positions: await Promise.all(
      ballot.map(async (p) => {
        const positionUrl = pollUrl(poll.slug, p.id);
        return { id: p.id, title: p.title, url: positionUrl, qrCodeDataUrl: await qr(positionUrl) };
      }),
    ),
  };
}
