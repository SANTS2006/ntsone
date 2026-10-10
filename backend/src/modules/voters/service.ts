import { randomUUID } from "node:crypto";
import { recordAudit } from "../audit/recorder.js";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env, isProduction } from "../../config/env.js";
import { db } from "../../db/client.js";
import { payments, voterAccounts, voterEmailCodes } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { canonicalEmail } from "../../lib/emailKey.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { generateVerificationCode, hashToken } from "../../lib/tokens.js";
import { queueEmail } from "../email/outbox.js";
import { sendEmail } from "../email/service.js";
import { newVoteNotificationEmail, VERIFICATION_CODE_TTL_MINUTES, voterCodeEmail } from "../email/templates.js";
import * as pollsRepo from "../polls/repository.js";
import { allowedDomains, buildResults, emailAllowed, pollState } from "../polls/service.js";
import { createVotePayment, isPaidPoll, listCredits, redeemVotes, resolvePollPaymentConfig } from "../payments/pollPayments.js";

type Voter = typeof voterAccounts.$inferSelect;
type Poll = pollsRepo.PollRow;

// ---------------------------------------------------------------------------
// Session cookie: separate key and audience from staff sign-in, so the two never mix.

const SESSION_COOKIE = "voterSession";
const SESSION_PATH = "/api/voter";
const SESSION_KEY = `${env.JWT_SECRET}:voter-session`;
const SESSION_DAYS = 30;

function setSession(reply: FastifyReply, voterId: string) {
  const token = jwt.sign({ sub: voterId }, SESSION_KEY, { audience: "voter", expiresIn: `${SESSION_DAYS}d` });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: SESSION_PATH,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: SESSION_PATH });
}

async function currentVoter(request: FastifyRequest): Promise<Voter | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, SESSION_KEY, { audience: "voter" }) as { sub: string };
    const [voter] = await db.select().from(voterAccounts).where(eq(voterAccounts.id, sub)).limit(1);
    return voter?.emailVerifiedAt ? voter : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export { canonicalEmail };

const ballotKeyFor = (positionId: string, email: string) => `${positionId}:e:${canonicalEmail(email)}`;

/** Positions this voter has voted for: under their account, or under the same person's email. */
async function votedPositions(poll: Poll, voter: Voter, positionIds: string[]) {
  const [byAccount, byEmail] = await Promise.all([
    pollsRepo.votedPositionIds(poll.id, voter.id),
    poll.onePerEmail
      ? pollsRepo.votedPositionIdsByKeys(poll.id, positionIds.map((id) => ballotKeyFor(id, voter.email)))
      : Promise.resolve([] as string[]),
  ]);
  return [...new Set([...byAccount, ...byEmail])];
}

async function findPoll(slug: string): Promise<Poll> {
  const poll = await pollsRepo.findPollBySlug(slug);
  if (!poll) throw AppError.notFound("This poll doesn't exist or has been removed");
  return poll;
}

function assertEmailAllowed(poll: Poll, email: string) {
  if (!emailAllowed(poll, email)) {
    const domains = allowedDomains(poll).map((d) => `@${d}`).join(" or ");
    throw new AppError(
      "FORBIDDEN",
      `You can't vote with the email you entered. This poll only accepts email addresses ending in ${domains}.`,
      403,
      { reason: "domain_not_allowed", domains: allowedDomains(poll) },
    );
  }
}

/** A poll limited to verified voters only lets in emails its admin pre-registered. */
async function assertVerifiedVoter(poll: Poll, email: string, action: "create an account" | "sign in" | "vote") {
  if (!poll.verifiedVotersOnly) return;
  if (await pollsRepo.isVerifiedVoter(poll.id, canonicalEmail(email))) return;
  throw new AppError(
    "FORBIDDEN",
    `You cannot ${action} because you are not verified by the system as an eligible voter for this poll.`,
    403,
    { reason: "not_verified" },
  );
}

async function findVoterByEmail(email: string) {
  const [voter] = await db.select().from(voterAccounts).where(eq(voterAccounts.email, normalizeEmail(email))).limit(1);
  return voter ?? null;
}

function publicVoter(voter: Voter) {
  return { id: voter.id, name: voter.name, email: voter.email };
}

/** Signs the voter in and adds them to this poll's voters. */
async function startSession(reply: FastifyReply, voter: Voter, poll: Poll) {
  await Promise.all([
    pollsRepo.addPollVoter(poll.id, voter.id),
    db.update(voterAccounts).set({ lastLoginAt: new Date() }).where(eq(voterAccounts.id, voter.id)),
  ]);
  setSession(reply, voter.id);
  return { status: "signed_in" as const, voter: publicVoter(voter) };
}

async function sendCode(voter: Voter, poll: Poll, purpose: "confirm" | "reset" = "confirm") {
  const [latest] = await db
    .select({ createdAt: voterEmailCodes.createdAt })
    .from(voterEmailCodes)
    .where(and(eq(voterEmailCodes.voterId, voter.id), isNull(voterEmailCodes.consumedAt)))
    .orderBy(desc(voterEmailCodes.createdAt))
    .limit(1);
  // One code a minute is plenty and keeps the email quota safe.
  if (latest && Date.now() - latest.createdAt.getTime() < 60_000) return;

  const code = generateVerificationCode();
  await db.insert(voterEmailCodes).values({
    voterId: voter.id,
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60_000),
  });
  const email = voterCodeEmail({ pollName: poll.name, pollImageUrl: poll.imageUrl, name: voter.name, code, purpose });
  await sendEmail({ to: voter.email, toName: voter.name, subject: email.subject, html: email.html });
}

// ---------------------------------------------------------------------------
// Public poll data

function paymentInfo(poll: Poll) {
  const config = resolvePollPaymentConfig(poll.paymentConfig);
  if (!config.enabled) return null;
  return { currency: "SLE", pricePerVoteMinor: config.pricePerVoteMinor, allowAnyAmount: config.allowAnyAmount, maxVotesPerPayment: config.maxVotesPerPayment };
}

export function pollForVoters(poll: Poll, ballot: Awaited<ReturnType<typeof pollsRepo.getBallot>>) {
  return {
    id: poll.id,
    slug: poll.slug,
    name: poll.name,
    description: poll.description,
    imageUrl: poll.imageUrl,
    state: pollState(poll),
    closesAt: poll.closesAt,
    onePerEmail: poll.onePerEmail,
    allowedDomains: allowedDomains(poll),
    verifiedVotersOnly: poll.verifiedVotersOnly,
    showResults: poll.showResults,
    // Present when voters pay for their votes.
    payment: paymentInfo(poll),
    googleClientId: env.GOOGLE_CLIENT_ID || null,
    positions: ballot.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.imageUrl,
      candidates: p.candidates.map((c) => ({ id: c.id, name: c.name, description: c.description, imageUrl: c.imageUrl })),
    })),
  };
}

// Everyone voting reads the ballot, and everyone watching the live results re-reads them every few
// seconds. Thousands of people asking for the same thing shouldn't each run the same queries, so
// concurrent requests share one load and a few seconds of age is accepted. Votes themselves are
// never cached.
const PUBLIC_POLL_TTL_MS = 3_000;
const RESULTS_TTL_MS = 2_000;
const pollCache = new TtlCache<ReturnType<typeof pollForVoters>>(500);
const resultsCache = new TtlCache<Awaited<ReturnType<typeof buildResults>>>(500);

export async function getPublicPoll(slug: string) {
  return pollCache.get(slug, PUBLIC_POLL_TTL_MS, async () => {
    const poll = await findPoll(slug);
    return pollForVoters(poll, await pollsRepo.getBallot(poll.id));
  });
}

export async function getPublicResults(slug: string) {
  const poll = await findPoll(slug);
  if (!poll.showResults) throw AppError.forbidden("Results for this poll aren't public");
  return resultsCache.get(poll.id, RESULTS_TTL_MS, () => buildResults(poll.id));
}

/** Who is signed in on this browser, and which positions of this poll they've already voted for. */
export async function session(request: FastifyRequest, slug: string) {
  const poll = await findPoll(slug);
  const voter = await currentVoter(request);
  if (!voter) return { voter: null, votedPositionIds: [] as string[], emailAllowed: true, credits: [] as Awaited<ReturnType<typeof listCredits>> };
  const verified = !poll.verifiedVotersOnly || (await pollsRepo.isVerifiedVoter(poll.id, canonicalEmail(voter.email)));
  // Signing in to a new poll with an existing account makes you one of its voters (if it lets you in).
  if (verified && emailAllowed(poll, voter.email)) await pollsRepo.addPollVoter(poll.id, voter.id);
  return {
    voter: publicVoter(voter),
    votedPositionIds: await votedPositions(poll, voter, (await pollsRepo.getBallot(poll.id)).map((p) => p.id)),
    emailAllowed: emailAllowed(poll, voter.email) && verified,
    notVerified: !verified,
    // Votes this person has paid for and not used yet.
    credits: await listCredits(poll.id, voter.id),
  };
}

// ---------------------------------------------------------------------------
// Sign-up and sign-in

export async function register(input: { pollSlug: string; name: string; email: string; password: string }) {
  const poll = await findPoll(input.pollSlug);
  const email = normalizeEmail(input.email);
  assertEmailAllowed(poll, email);
  // Checked before anything is created, so an unverified email never gets an account.
  await assertVerifiedVoter(poll, email, "create an account");

  let voter: Voter | null | undefined = await findVoterByEmail(email);
  if (voter?.emailVerifiedAt) {
    throw AppError.conflict(
      voter.passwordHash
        ? "You already have a voter account with this email. Sign in instead."
        : "This email signs in with Google. Use Continue with Google instead.",
    );
  }
  const passwordHash = await hashPassword(input.password);
  if (voter) {
    // An earlier sign-up that was never confirmed: start again with the new details.
    [voter] = await db.update(voterAccounts).set({ name: input.name.trim(), passwordHash }).where(eq(voterAccounts.id, voter.id)).returning();
  } else {
    [voter] = await db.insert(voterAccounts).values({ name: input.name.trim(), email, passwordHash }).returning();
  }
  await sendCode(voter!, poll);
  return { status: "verify" as const, email };
}

export async function login(reply: FastifyReply, input: { pollSlug: string; email: string; password: string }) {
  const poll = await findPoll(input.pollSlug);
  const email = normalizeEmail(input.email);
  const voter = await findVoterByEmail(email);
  const ok = voter?.passwordHash ? await verifyPassword(voter.passwordHash, input.password) : false;
  if (!voter || !ok) {
    throw AppError.unauthorized(
      voter && !voter.passwordHash ? "This email signs in with Google. Use Continue with Google instead." : "Incorrect email or password",
    );
  }
  assertEmailAllowed(poll, email);
  await assertVerifiedVoter(poll, email, "sign in");
  if (!voter.emailVerifiedAt) {
    await sendCode(voter, poll);
    return { status: "verify" as const, email };
  }
  return startSession(reply, voter, poll);
}

/** Checks a 6-character code against the voter's latest unused one, and uses it up. */
async function consumeCode(voter: Voter, code: string) {
  const [row] = await db
    .select()
    .from(voterEmailCodes)
    .where(and(eq(voterEmailCodes.voterId, voter.id), isNull(voterEmailCodes.consumedAt)))
    .orderBy(desc(voterEmailCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt < new Date() || row.attempts >= 5) {
    throw AppError.validation("That code has expired. Ask for a new one.");
  }
  if (row.codeHash !== hashToken(code.trim().toUpperCase())) {
    await db.update(voterEmailCodes).set({ attempts: row.attempts + 1 }).where(eq(voterEmailCodes.id, row.id));
    throw AppError.validation("That code isn't right. Check the email and try again.");
  }
  await db.update(voterEmailCodes).set({ consumedAt: new Date() }).where(eq(voterEmailCodes.id, row.id));
}

export async function verifyEmail(reply: FastifyReply, input: { pollSlug: string; email: string; code: string }) {
  const poll = await findPoll(input.pollSlug);
  const voter = await findVoterByEmail(input.email);
  if (!voter) throw AppError.validation("That code isn't right. Check the email and try again.");
  await consumeCode(voter, input.code);
  const [verified] = await db.update(voterAccounts).set({ emailVerifiedAt: new Date() }).where(eq(voterAccounts.id, voter.id)).returning();
  assertEmailAllowed(poll, verified!.email);
  await assertVerifiedVoter(poll, verified!.email, "sign in");
  return startSession(reply, verified!, poll);
}

export async function resendCode(input: { pollSlug: string; email: string }) {
  const poll = await findPoll(input.pollSlug);
  const voter = await findVoterByEmail(input.email);
  // Same answer whether or not the address has an account, so this can't be used to probe emails.
  if (voter && !voter.emailVerifiedAt) await sendCode(voter, poll);
  return { status: "verify" as const, email: normalizeEmail(input.email) };
}

/** Emails a reset code. The answer is the same whether or not the address has an account. */
export async function forgotPassword(input: { pollSlug: string; email: string }) {
  const poll = await findPoll(input.pollSlug);
  const voter = await findVoterByEmail(input.email);
  if (voter?.emailVerifiedAt && (!poll.verifiedVotersOnly || (await pollsRepo.isVerifiedVoter(poll.id, canonicalEmail(voter.email))))) await sendCode(voter, poll, "reset");
  return { status: "reset_sent" as const, email: normalizeEmail(input.email) };
}

export async function resetPassword(input: { pollSlug: string; email: string; code: string; password: string }) {
  await findPoll(input.pollSlug);
  const voter = await findVoterByEmail(input.email);
  if (!voter?.emailVerifiedAt) throw AppError.validation("That code isn't right. Check the email and try again.");
  await consumeCode(voter, input.code);
  await db.update(voterAccounts).set({ passwordHash: await hashPassword(input.password) }).where(eq(voterAccounts.id, voter.id));
  return { status: "password_reset" as const };
}

export async function googleSignIn(reply: FastifyReply, input: { pollSlug: string; profile: { googleId: string; email: string; name: string } }) {
  const poll = await findPoll(input.pollSlug);
  const { googleId, email, name } = input.profile;
  assertEmailAllowed(poll, email);
  await assertVerifiedVoter(poll, email, "create an account");

  const [byGoogle] = await db.select().from(voterAccounts).where(eq(voterAccounts.googleId, googleId)).limit(1);
  let voter: Voter | null | undefined = byGoogle ?? (await findVoterByEmail(email));
  if (voter) {
    // Google has confirmed the address, so an account with that email is linked and confirmed.
    [voter] = await db
      .update(voterAccounts)
      .set({ googleId, emailVerifiedAt: voter.emailVerifiedAt ?? new Date() })
      .where(eq(voterAccounts.id, voter.id))
      .returning();
  } else {
    [voter] = await db.insert(voterAccounts).values({ name, email, googleId, emailVerifiedAt: new Date() }).returning();
  }
  return startSession(reply, voter!, poll);
}

// ---------------------------------------------------------------------------
// Voting

export async function castVote(
  request: FastifyRequest,
  input: { slug: string; positionId: string; candidateId: string },
) {
  const poll = await findPoll(input.slug);
  const voter = await currentVoter(request);
  if (!voter) throw AppError.unauthorized("Sign in to vote");

  const state = pollState(poll);
  if (state === "closed") throw new AppError("CONFLICT", "Voting has closed for this poll.", 409, { reason: "closed" });
  if (state === "draft") throw new AppError("CONFLICT", "Voting hasn't opened yet for this poll.", 409, { reason: "not_open" });
  assertEmailAllowed(poll, voter.email);
  await assertVerifiedVoter(poll, voter.email, "vote");

  const [position, candidate] = await Promise.all([
    pollsRepo.findPosition(poll.id, input.positionId),
    pollsRepo.findCandidate(poll.id, input.positionId, input.candidateId),
  ]);
  if (!position || !candidate) throw AppError.notFound("That choice isn't on this ballot any more. Please reload the page.");

  if (isPaidPoll(poll)) {
    throw new AppError("PAYMENT_REQUIRED", "This poll needs a payment for each vote. Choose a position and pay for your votes.", 402, { reason: "payment_required" });
  }

  if (poll.onePerEmail && (await votedPositions(poll, voter, [position.id])).includes(position.id)) {
    throw new AppError("CONFLICT", `You've already voted for ${position.title}. Each email address can vote only once.`, 409, {
      reason: "already_voted",
    });
  }

  const recorded = await pollsRepo.insertVote({
    pollId: poll.id,
    positionId: position.id,
    candidateId: candidate.id,
    voterId: voter.id,
    ballotKey: poll.onePerEmail ? ballotKeyFor(position.id, voter.email) : randomUUID(),
    ipAddress: request.ip,
  });
  if (!recorded) {
    throw new AppError("CONFLICT", `You've already voted for ${position.title}. Each email address can vote only once.`, 409, {
      reason: "already_voted",
    });
  }
  await pollsRepo.addPollVoter(poll.id, voter.id);
  // Who voted and where, never who they voted for: the ballot stays secret.
  await recordAudit({
    action: "voter.vote",
    actorType: "voter",
    actorName: voter.name,
    actorEmail: voter.email,
    tenantId: poll.tenantId,
    entityType: "poll",
    entityId: poll.id,
    metadata: { poll: poll.name, position: position.title },
  });

  const results = await buildResults(poll.id);
  if (poll.notifyOnVote) void notifyTeam(poll, voter, position.title, results.positions.find((p) => p.id === position.id)?.totalVotes ?? 0);
  return {
    votedPositionIds: await votedPositions(poll, voter, (await pollsRepo.getBallot(poll.id)).map((p) => p.id)),
    results: poll.showResults ? results : null,
  };
}

async function notifyTeam(poll: Poll, voter: Voter, positionTitle: string, totalVotesForPosition: number) {
  try {
    const recipients = await pollsRepo.listPollNotificationRecipients(poll);
    if (!recipients.length) return;
    const base = env.APP_URL.replace(/\/+$/, "");
    const { subject, html } = newVoteNotificationEmail({
      pollName: poll.name,
      voterName: voter.name,
      voterEmail: voter.email,
      positionTitle,
      votedAt: new Date(),
      totalVotesForPosition,
      resultsUrl: `${base}/admin/polls/${poll.id}/results`,
      settingsUrl: `${base}/admin/polls/${poll.id}`,
    });
    await Promise.all(recipients.map((r) => queueEmail({ to: r.email, toName: r.name, subject, html })));
  } catch (err) {
    console.error(`Could not send vote notification for poll ${poll.id}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Paid voting

/** Everything a voter must pass before paying or voting: signed in, the poll is open, and this email is allowed in. */
async function paidVotingVoter(request: FastifyRequest, slug: string) {
  const poll = await findPoll(slug);
  const voter = await currentVoter(request);
  if (!voter) throw AppError.unauthorized("Sign in to vote");
  const state = pollState(poll);
  if (state === "closed") throw new AppError("CONFLICT", "Voting has closed for this poll.", 409, { reason: "closed" });
  if (state === "draft") throw new AppError("CONFLICT", "Voting hasn't opened yet for this poll.", 409, { reason: "not_open" });
  assertEmailAllowed(poll, voter.email);
  await assertVerifiedVoter(poll, voter.email, "vote");
  return { poll, voter };
}

/** Starts paying for votes in one position. The voter is sent on to Monime to pay. */
export async function startVotePayment(request: FastifyRequest, input: { slug: string; positionId: string; amountMinor?: number }) {
  const { poll, voter } = await paidVotingVoter(request, input.slug);
  // One vote per email: someone who has already voted for this position cannot pay to vote for it again.
  if (poll.onePerEmail && (await votedPositions(poll, voter, [input.positionId])).includes(input.positionId)) {
    const position = await pollsRepo.findPosition(poll.id, input.positionId);
    throw new AppError("CONFLICT", `You've already voted for ${position?.title ?? "this position"}. Each email address can vote only once.`, 409, { reason: "already_voted" });
  }
  const started = await createVotePayment({
    poll,
    voter,
    positionId: input.positionId,
    amountMinor: input.amountMinor,
    context: { ip: request.ip, userAgent: request.headers["user-agent"] },
  });
  await pollsRepo.addPollVoter(poll.id, voter.id);
  return started;
}

/** Uses the votes a payment bought for one candidate. The ballot stays secret: only that they voted is recorded in the log. */
export async function castPaidVotes(request: FastifyRequest, input: { slug: string; paymentId: string; candidateId: string }) {
  const { poll, voter } = await paidVotingVoter(request, input.slug);
  if (poll.onePerEmail) {
    const [owned] = await db.select({ positionId: payments.pollPositionId }).from(payments).where(and(eq(payments.id, input.paymentId), eq(payments.voterId, voter.id), eq(payments.pollId, poll.id))).limit(1);
    if (owned?.positionId && (await votedPositions(poll, voter, [owned.positionId])).includes(owned.positionId)) {
      throw new AppError("CONFLICT", "You've already voted for this position. Each email address can vote only once.", 409, { reason: "already_voted" });
    }
  }
  const used = await redeemVotes({
    poll,
    voterId: voter.id,
    paymentId: input.paymentId,
    candidateId: input.candidateId,
    ipAddress: request.ip,
    oneVoteKeyFor: poll.onePerEmail ? (positionId) => ballotKeyFor(positionId, voter.email) : undefined,
    verifyCandidate: async (positionId, candidateId) => Boolean(await pollsRepo.findCandidate(poll.id, positionId, candidateId)),
  });
  const position = await pollsRepo.findPosition(poll.id, used.positionId);
  await recordAudit({
    action: "voter.vote",
    label: "Cast paid votes",
    actorType: "voter",
    actorName: voter.name,
    actorEmail: voter.email,
    tenantId: poll.tenantId,
    entityType: "poll",
    entityId: poll.id,
    metadata: { poll: poll.name, position: position?.title, votes: used.votes, amountMinor: used.amountMinor, paymentId: used.paymentId },
  });
  const results = await buildResults(poll.id);
  if (poll.notifyOnVote) void notifyTeam(poll, voter, position?.title ?? "a position", results.positions.find((p) => p.id === used.positionId)?.totalVotes ?? 0);
  return {
    votes: used.votes,
    credits: await listCredits(poll.id, voter.id),
    results: poll.showResults ? results : null,
  };
}
