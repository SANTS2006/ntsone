import { apiFetch } from "@/lib/api";
import type { PaginatedResult as Paginated } from "@/types/api";
import { uploadToCloudinary, type UploadSignature } from "../programs/api";

export type PollState = "draft" | "open" | "closed";

export interface Poll {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  status: PollState;
  /** The status after applying the closing time: an open poll past its closing time is closed. */
  state: PollState;
  closesAt: string | null;
  onePerEmail: boolean;
  restrictEmailDomain: boolean;
  allowedEmailDomains: string | null;
  showResults: boolean;
  notifyOnVote: boolean;
  /** Only emails on the pre-registered list can create an account and vote. */
  verifiedVotersOnly: boolean;
  /** Paid voting: the price of a vote and whether any amount can be paid. */
  paymentConfig?: import("../payments/api").PollPaymentConfig;
  createdAt: string;
  updatedAt: string;
  myRole?: "admin" | "viewer" | null;
  positionCount?: number;
  voterCount?: number;
}

export interface BallotCandidate {
  id?: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface BallotPosition {
  id?: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  candidates: BallotCandidate[];
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
  winnerIds: string[];
}

export interface PollResults {
  voters: number;
  registeredVoters: number;
  votes: number;
  positions: PositionResult[];
  updatedAt: string;
}

export interface PollVoter {
  id: string;
  name: string;
  email: string;
  signInMethod: "google" | "email";
  joinedAt: string;
  votes: number;
  lastVotedAt: string | null;
}

export interface PollShareInfo {
  poll: { url: string; qrCodeDataUrl: string };
  positions: { id: string; title: string; url: string; qrCodeDataUrl: string }[];
}

export interface ListPollsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PollState;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const listPolls = (params: ListPollsParams) => apiFetch<Paginated<Poll>>(`/polls${query({ ...params })}`);
export const getPoll = (pollId: string) => apiFetch<Poll>(`/polls/${pollId}`);
export const createPoll = (input: { name: string; description?: string; tenantId?: string }) => apiFetch<Poll>("/polls", { method: "POST", body: input });
export const updatePoll = (pollId: string, input: Partial<Omit<Poll, "id" | "state" | "status">>) =>
  apiFetch<Poll>(`/polls/${pollId}`, { method: "PATCH", body: input });
export const deletePoll = (pollId: string) => apiFetch<null>(`/polls/${pollId}`, { method: "DELETE" });
export const openPoll = (pollId: string) => apiFetch<Poll>(`/polls/${pollId}/open`, { method: "POST" });
export const closePoll = (pollId: string) => apiFetch<Poll>(`/polls/${pollId}/close`, { method: "POST" });
export const getBallot = (pollId: string) => apiFetch<BallotPosition[]>(`/polls/${pollId}/ballot`);
export const saveBallot = (pollId: string, positions: BallotPosition[]) =>
  apiFetch<BallotPosition[]>(`/polls/${pollId}/ballot`, { method: "PUT", body: { positions } });
export const getPollResults = (pollId: string) => apiFetch<PollResults>(`/polls/${pollId}/results`);
export const listPollVoters = (pollId: string, params: { page?: number; pageSize?: number; search?: string; dateFrom?: string; dateTo?: string }) =>
  apiFetch<Paginated<PollVoter>>(`/polls/${pollId}/voters${query({ ...params })}`);
export interface VerifiedVoters {
  enabled: boolean;
  voters: { email: string; signedUp: boolean; voted: boolean }[];
}
export const getVerifiedVoters = (pollId: string) => apiFetch<VerifiedVoters>(`/polls/${pollId}/verified-voters`);
export const saveVerifiedVoters = (pollId: string, input: { enabled: boolean; emails: string[] }) =>
  apiFetch<VerifiedVoters>(`/polls/${pollId}/verified-voters`, { method: "PUT", body: input });
export const getPollShareInfo = (pollId: string) => apiFetch<PollShareInfo>(`/polls/${pollId}/share`);

export async function uploadPollImage(pollId: string, file: File): Promise<string> {
  const signature = await apiFetch<UploadSignature>(`/polls/${pollId}/uploads/signature`, { method: "POST" });
  const { secureUrl } = await uploadToCloudinary(file, signature);
  return secureUrl;
}
