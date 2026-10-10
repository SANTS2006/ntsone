import { apiFetch } from "@/lib/api";
import type { PollResults, PollState } from "../polls/api";

export interface VoteCandidate {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface VotePosition {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  candidates: VoteCandidate[];
}

export interface VotePoll {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  state: PollState;
  closesAt: string | null;
  onePerEmail: boolean;
  allowedDomains: string[];
  /** Only emails the admin pre-registered can create an account and vote. */
  verifiedVotersOnly?: boolean;
  showResults: boolean;
  /** Present when voters pay for their votes. */
  payment?: { currency: string; pricePerVoteMinor: number; allowAnyAmount: boolean; maxVotesPerPayment: number } | null;
  googleClientId: string | null;
  positions: VotePosition[];
}

export interface Voter {
  id: string;
  name: string;
  email: string;
}

/** Votes someone has paid for and not used yet. */
export interface VoteCredit {
  paymentId: string;
  positionId: string | null;
  votes: number;
  amountMinor: number;
  paidAt: string | null;
}

export interface VoterSession {
  voter: Voter | null;
  votedPositionIds: string[];
  /** Paid votes waiting to be used (paid polls). */
  credits?: VoteCredit[];
  emailAllowed: boolean;
  /** The poll only accepts verified voters and this email isn't one. */
  notVerified?: boolean;
}

export type AuthResult = { status: "signed_in"; voter: Voter } | { status: "verify"; email: string };

// Voter calls never try the staff sign-in refresh: voters have their own session.
const voterFetch = <T>(path: string, options: Parameters<typeof apiFetch>[1] = {}) =>
  apiFetch<T>(`/voter${path}`, { ...options, skipAuthRetry: true });

const slugPath = (slug: string) => `/polls/${encodeURIComponent(slug)}`;

export const getVotePoll = (slug: string) => voterFetch<VotePoll>(slugPath(slug));
export const getVoteResults = (slug: string) => voterFetch<PollResults>(`${slugPath(slug)}/results`);
export const getVoterSession = (slug: string) => voterFetch<VoterSession>(`${slugPath(slug)}/session`);

export const castVote = (slug: string, positionId: string, candidateId: string) =>
  voterFetch<{ votedPositionIds: string[]; results: PollResults | null }>(`${slugPath(slug)}/positions/${positionId}/vote`, {
    method: "POST",
    body: { candidateId },
  });

export const startVotePayment = (slug: string, positionId: string, amountMinor?: number) =>
  voterFetch<{ token: string; status: "pending" | "failed"; redirectUrl: string | null; amountMinor: number; votes: number; currency: string }>(
    `${slugPath(slug)}/positions/${positionId}/pay`,
    { method: "POST", body: amountMinor === undefined ? {} : { amountMinor } },
  );

export const castPaidVotes = (slug: string, paymentId: string, candidateId: string) =>
  voterFetch<{ votes: number; credits: VoteCredit[]; results: PollResults | null }>(`${slugPath(slug)}/credits/${paymentId}/vote`, { method: "POST", body: { candidateId } });

export const registerVoter = (input: { pollSlug: string; name: string; email: string; password: string }) =>
  voterFetch<AuthResult>("/auth/register", { method: "POST", body: input });
export const loginVoter = (input: { pollSlug: string; email: string; password: string }) =>
  voterFetch<AuthResult>("/auth/login", { method: "POST", body: input });
export const verifyVoter = (input: { pollSlug: string; email: string; code: string }) =>
  voterFetch<AuthResult>("/auth/verify", { method: "POST", body: input });
export const resendVoterCode = (input: { pollSlug: string; email: string }) =>
  voterFetch<AuthResult>("/auth/resend", { method: "POST", body: input });
export const forgotVoterPassword = (input: { pollSlug: string; email: string }) =>
  voterFetch<{ status: "reset_sent"; email: string }>("/auth/forgot-password", { method: "POST", body: input });
export const resetVoterPassword = (input: { pollSlug: string; email: string; code: string; password: string }) =>
  voterFetch<{ status: "password_reset" }>("/auth/reset-password", { method: "POST", body: input });
export const googleVoter = (input: { pollSlug: string; credential: string }) =>
  voterFetch<AuthResult>("/auth/google", { method: "POST", body: input });
export const logoutVoter = () => voterFetch<null>("/auth/logout", { method: "POST" });
