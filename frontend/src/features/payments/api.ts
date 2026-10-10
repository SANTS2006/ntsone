import { apiFetch } from "@/lib/api";
import type { PaginatedResult, PaymentConfig } from "@/types/api";

/** What the admin sends when saving: the settings, and whether they agree to the platform's fee. */
export type PaymentConfigInput = PaymentConfig & { acceptFee?: boolean };

// ---- a program's payment settings and payments ----

export function updatePaymentConfig(programId: string, config: PaymentConfigInput) {
  return apiFetch<{ paymentConfig: PaymentConfig }>(`/programs/${programId}/payment-config`, { method: "PUT", body: config });
}

/** A poll's paid-voting settings (prices in cents). */
export interface PollPaymentConfig {
  enabled: boolean;
  pricePerVoteMinor: number;
  allowAnyAmount: boolean;
  maxVotesPerPayment: number;
  feeAccepted?: { percent: number; at: string; by: string };
}

export const updatePollPaymentConfig = (pollId: string, config: Omit<PollPaymentConfig, "feeAccepted"> & { acceptFee?: boolean }) =>
  apiFetch<{ paymentConfig: PollPaymentConfig }>(`/polls/${pollId}/payment-config`, { method: "PUT", body: config });

export const getPollPaymentTerms = (pollId: string) => apiFetch<PaymentTerms>(`/polls/${pollId}/payment-terms`);

export interface PaymentTerms {
  feePercent: number;
  feeFixedMinor: number;
  accepted: { percent: number; at: string } | null;
}

export const getPaymentTerms = (programId: string) => apiFetch<PaymentTerms>(`/programs/${programId}/payment-terms`);

export interface ProgramPayment {
  id: string;
  status: "pending" | "completed" | "failed" | "expired" | "cancelled" | "review";
  amountMinor: number;
  feeMinor: number;
  refundedMinor: number;
  currency: string;
  purpose: "registration" | "order";
  payerName: string | null;
  payerEmail: string | null;
  payerPhone: string | null;
  /** Monime's order number for this payment: quote it to Monime support. */
  providerOrderNumber: string | null;
  channel: { type?: string; provider?: string; phoneNumber?: string; reference?: string } | null;
  failureReason: string | null;
  risk: { flags?: string[] };
  createdAt: string;
  paidAt: string | null;
  /** When it can first be refunded (a few minutes after it was paid). */
  refundableAt: string | null;
  registrationId: string;
  registrationNumber: string;
}

export interface ProgramPaymentsPage extends PaginatedResult<ProgramPayment> {
  summary: { paidMinor: number; pendingMinor: number };
}

export function listProgramPayments(programId: string, params: { page?: number; pageSize?: number; status?: string; dateFrom?: string; dateTo?: string }) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") query.set(k, String(v));
  return apiFetch<ProgramPaymentsPage>(`/programs/${programId}/payments?${query.toString()}`);
}

export function waivePayment(programId: string, registrationId: string, note?: string) {
  return apiFetch<null>(`/programs/${programId}/registrations/${registrationId}/waive-payment`, { method: "POST", body: { note } });
}

// ---- refunds ----

export interface RefundRow {
  id: string;
  amountMinor: number;
  currency: string;
  status: "pending_review" | "queued" | "processing" | "completed" | "failed" | "rejected";
  reason: string;
  providerId: string;
  phoneNumber: string;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** A payment for votes in a poll. The candidate is never part of it. */
export interface PollPayment extends Omit<ProgramPayment, "registrationId" | "registrationNumber" | "purpose"> {
  votes: number | null;
  used: boolean;
  positionTitle: string | null;
}

export interface PollPaymentsPage extends PaginatedResult<PollPayment> {
  summary: { paidMinor: number; pendingMinor: number; votesUsed: number; votesWaiting: number };
}

export function listPollPayments(pollId: string, params: { page?: number; pageSize?: number; status?: string; dateFrom?: string; dateTo?: string }) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") query.set(k, String(v));
  return apiFetch<PollPaymentsPage>(`/polls/${pollId}/payments?${query.toString()}`);
}

export const listPollPaymentRefunds = (pollId: string, paymentId: string) => apiFetch<RefundRow[]>(`/polls/${pollId}/payments/${paymentId}/refunds`);

export const requestPollRefund = (pollId: string, paymentId: string, input: { amountMinor: number; reason: string; providerId: string; phoneNumber: string; password: string }) =>
  apiFetch<{ id: string; status: string }>(`/polls/${pollId}/payments/${paymentId}/refund`, { method: "POST", body: input });

export const listPaymentRefunds = (programId: string, paymentId: string) => apiFetch<RefundRow[]>(`/programs/${programId}/payments/${paymentId}/refunds`);

export const requestRefund = (
  programId: string,
  paymentId: string,
  input: { amountMinor: number; reason: string; providerId: string; phoneNumber: string; password: string },
) => apiFetch<{ id: string; status: string }>(`/programs/${programId}/payments/${paymentId}/refund`, { method: "POST", body: input });

// ---- what a payer sees ----

export interface PaymentView {
  status: "pending" | "completed" | "failed" | "expired" | "cancelled" | "review";
  registrationPaymentStatus: string;
  amountMinor: number;
  currency: string;
  lineItems: { id: string; name: string; unitMinor: number; quantity: number; totalMinor: number }[];
  registrationNumber: string;
  registrationStatus: string;
  programName: string;
  programSlug: string;
  kind: "program" | "order_form" | "poll";
  /** Only for a payment for votes. */
  poll?: { slug: string; name: string; positionTitle: string; votes: number; used: boolean; refunded: boolean };
  paidAt: string | null;
  redirectUrl: string | null;
  expiresAt: string | null;
  canRetry: boolean;
  confirmationMessage: string | null;
  showRegistrationNumber: boolean;
  idCardAvailable: boolean;
  ticketAvailable: boolean;
  receiptToken?: string;
}

export function getPaymentView(token: string, refresh = false) {
  return apiFetch<PaymentView>(`/public/payments/${encodeURIComponent(token)}${refresh ? "?refresh=1" : ""}`);
}

export interface PaymentStartView {
  token: string;
  status: "pending" | "failed";
  redirectUrl: string | null;
  amountMinor: number;
  currency: string;
}

export function retryPayment(token: string) {
  return apiFetch<PaymentStartView>(`/public/payments/${encodeURIComponent(token)}/retry`, { method: "POST" });
}

// ---- the payment fund ----

export interface Provider {
  providerId: string;
  name: string;
}

export interface PayoutAccount {
  id: string;
  type: "momo" | "bank";
  providerId: string;
  providerName: string;
  accountNumber: string;
  accountName: string;
  usableAfter: string;
  usable: boolean;
}

export interface FundsSummary {
  configured: boolean;
  balances: { totalMinor: number; availableMinor: number; pendingMinor: number };
  accounts: PayoutAccount[];
  providers: { momo: Provider[]; banks: Provider[] };
  limits: {
    minMinor: number;
    dailyLimitMinor: number;
    reviewAboveMinor: number;
    holdMinutes: number;
    newAccountMinutes: number;
    feePercent: number;
    feeFixedMinor: number;
  };
  /** Only on the platform's own fund. */
  feesEarnedMinor?: number;
  paymentsCounted?: number;
}

export interface LedgerEntry {
  id: string;
  kind: string;
  amountMinor: number;
  currency: string;
  availableAt: string;
  note: string | null;
  createdAt: string;
  registrationNumber: string | null;
}

export interface PayoutRow {
  id: string;
  amountMinor: number;
  currency: string;
  status: "pending_review" | "queued" | "processing" | "completed" | "failed" | "cancelled" | "rejected";
  failureReason: string | null;
  accountName: string;
  providerId: string;
  accountNumber: string;
  createdAt: string;
  completedAt: string | null;
}

export interface FundRefund {
  id: string;
  amountMinor: number;
  currency: string;
  status: RefundRow["status"];
  reason: string;
  createdAt: string;
  registrationNumber: string | null;
}
export const getFundRefunds = (page: number) => apiFetch<PaginatedResult<FundRefund>>(`/funds/refunds?page=${page}&pageSize=10`);

export const getFunds = () => apiFetch<FundsSummary>("/funds");
const dates = (range: { dateFrom?: string; dateTo?: string }) =>
  (range.dateFrom ? `&dateFrom=${encodeURIComponent(range.dateFrom)}` : "") + (range.dateTo ? `&dateTo=${encodeURIComponent(range.dateTo)}` : "");

export const getLedger = (page: number, range: { dateFrom?: string; dateTo?: string } = {}) =>
  apiFetch<PaginatedResult<LedgerEntry>>(`/funds/entries?page=${page}&pageSize=15${dates(range)}`);
export const getPayouts = (page: number, range: { dateFrom?: string; dateTo?: string } = {}) =>
  apiFetch<PaginatedResult<PayoutRow>>(`/funds/payouts?page=${page}&pageSize=10${dates(range)}`);

export const addPayoutAccount = (input: { type: "momo" | "bank"; providerId: string; accountNumber: string; accountName: string; password: string }) =>
  apiFetch<PayoutAccount[]>("/funds/accounts", { method: "POST", body: input });

export const removePayoutAccount = (accountId: string, password: string) =>
  apiFetch<PayoutAccount[]>(`/funds/accounts/${accountId}/remove`, { method: "POST", body: { password } });

export const requestPayout = (input: { accountId: string; amountMinor: number; password: string }) =>
  apiFetch<{ id: string; status: string }>("/funds/payouts", { method: "POST", body: input });

export const cancelPayout = (payoutId: string) => apiFetch<null>(`/funds/payouts/${payoutId}/cancel`, { method: "POST" });

/** One payment fund: an organization's, or the platform's own (the fees it keeps). The same page shows either. */
export interface FundApi {
  scope: "organization" | "platform";
  /** The start of this fund's query keys, so everything on the page refreshes together. */
  root: string;
  getFunds: () => Promise<FundsSummary>;
  getLedger: (page: number, range?: { dateFrom?: string; dateTo?: string }) => Promise<PaginatedResult<LedgerEntry>>;
  getPayouts: (page: number, range?: { dateFrom?: string; dateTo?: string }) => Promise<PaginatedResult<PayoutRow>>;
  addAccount: (input: { type: "momo" | "bank"; providerId: string; accountNumber: string; accountName: string; password: string }) => Promise<PayoutAccount[]>;
  removeAccount: (accountId: string, password: string) => Promise<PayoutAccount[]>;
  requestPayout: (input: { accountId: string; amountMinor: number; password: string }) => Promise<{ id: string; status: string }>;
  cancelPayout: (payoutId: string) => Promise<null>;
}

export const organizationFund: FundApi = {
  scope: "organization",
  root: "funds",
  getFunds,
  getLedger,
  getPayouts,
  addAccount: addPayoutAccount,
  removeAccount: removePayoutAccount,
  requestPayout,
  cancelPayout,
};

export const platformFund: FundApi = {
  scope: "platform",
  root: "platform-fund",
  getFunds: () => apiFetch<FundsSummary>("/platform/fund"),
  getLedger: (page, range = {}) => apiFetch<PaginatedResult<LedgerEntry>>(`/platform/fund/entries?page=${page}&pageSize=15${dates(range)}`),
  getPayouts: (page, range = {}) => apiFetch<PaginatedResult<PayoutRow>>(`/platform/fund/payouts?page=${page}&pageSize=10${dates(range)}`),
  addAccount: (input) => apiFetch<PayoutAccount[]>("/platform/fund/accounts", { method: "POST", body: input }),
  removeAccount: (accountId, password) => apiFetch<PayoutAccount[]>(`/platform/fund/accounts/${accountId}/remove`, { method: "POST", body: { password } }),
  requestPayout: (input) => apiFetch<{ id: string; status: string }>("/platform/fund/payouts", { method: "POST", body: input }),
  cancelPayout: (payoutId) => apiFetch<null>(`/platform/fund/payouts/${payoutId}/cancel`, { method: "POST" }),
};

// ---- the platform team ----

export interface PlatformPayments {
  awaitingReview: { id: string; tenantName: string; amountMinor: number; accountName: string; providerId: string; accountNumber: string; createdAt: string }[];
  refundsAwaitingReview: { id: string; paymentId: string; tenantName: string; amountMinor: number; reason: string; providerId: string; phoneNumber: string; createdAt: string }[];
  paymentsInReview: { id: string; amountMinor: number; failureReason: string | null; createdAt: string; tenantName: string; payerEmail: string | null }[];
  totals: { paidMinor: number; feesMinor: number; paymentCount: number };
  monime: {
    configured: boolean;
    accounts: { id: string; name: string; currency: string; availableMinor: number | null; fields?: string }[];
    /** What is wrong, in plain words. */
    error?: string;
    status?: number;
    detail?: string;
    requestId?: string;
  };
}

export const getPlatformPayments = () => apiFetch<PlatformPayments>("/platform/payments");
export const reviewPayout = (payoutId: string, decision: "approve" | "reject", note?: string) =>
  apiFetch<null>(`/platform/payments/payouts/${payoutId}/review`, { method: "POST", body: { decision, note } });
export const reviewRefund = (refundId: string, decision: "approve" | "reject", note?: string) =>
  apiFetch<null>(`/platform/payments/refunds/${refundId}/review`, { method: "POST", body: { decision, note } });
export const recheckPayment = (paymentId: string) => apiFetch<{ status: string }>(`/platform/payments/payments/${paymentId}/recheck`, { method: "POST" });
