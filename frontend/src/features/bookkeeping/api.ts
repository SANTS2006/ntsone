import { apiFetch } from "@/lib/api";
import type { PaginatedResult } from "@/types/api";
import { uploadToCloudinary, type UploadSignature } from "../programs/api";

export type EntryKind = "sale" | "other_income" | "purchase" | "expense" | "loan_in" | "loan_out" | "loan_repayment_in" | "loan_repayment_out" | "owner_in" | "owner_out";
export type PayMethod = "cash" | "mobile_money" | "bank" | "other";

export interface Entry {
  id: string;
  kind: EntryKind;
  entryDate: string;
  amountMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  category: string | null;
  description: string | null;
  partyName: string | null;
  partyPhone: string | null;
  paymentMethod: PayMethod;
  reference: string | null;
  loanId: string | null;
  voiceNoteId: string | null;
  moneyIn: boolean;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface EntryDetail extends Entry {
  payments: { id: string; amountMinor: number; paidOn: string; method: PayMethod; note: string | null; voided: boolean }[];
}

export interface EntriesPage extends PaginatedResult<Entry> {
  summary: { moneyInMinor: number; moneyOutMinor: number };
}

export interface EntryInput {
  kind: EntryKind;
  entryDate: string;
  amountMinor: number;
  paidMinor?: number;
  category?: string;
  description?: string;
  partyName?: string;
  partyPhone?: string;
  paymentMethod: PayMethod;
  reference?: string;
  voiceNoteId?: string;
}

export interface EntryUpdate {
  entryDate?: string;
  amountMinor?: number;
  category?: string | null;
  description?: string | null;
  partyName?: string | null;
  partyPhone?: string | null;
  paymentMethod?: PayMethod;
  reference?: string | null;
}

export interface Loan {
  id: string;
  direction: "lent" | "borrowed";
  partyName: string;
  partyPhone: string | null;
  principalMinor: number;
  interestPercent: number;
  interestMinor: number;
  totalDueMinor: number;
  repaidMinor: number;
  balanceMinor: number;
  issuedOn: string;
  dueOn: string | null;
  purpose: string | null;
  status: "open" | "paid" | "written_off" | "cancelled";
  overdue: boolean;
  createdAt: string;
}
export interface LoanDetail extends Loan {
  repayments: Entry[];
}

export interface LoanInput {
  direction: "lent" | "borrowed";
  partyName: string;
  partyPhone?: string;
  principalMinor: number;
  interestPercent: number;
  issuedOn: string;
  dueOn?: string;
  purpose?: string;
  paymentMethod: PayMethod;
  voiceNoteId?: string;
}

export interface VoiceNote {
  id: string;
  audioUrl: string;
  durationSeconds: number | null;
  caption: string | null;
  transcript: string | null;
  status: "new" | "done";
  entryId: string | null;
  createdAt: string;
}

export interface Summary {
  currency: string;
  period: { from: string; to: string };
  revenueMinor: number;
  costOfGoodsMinor: number;
  expensesMinor: number;
  profitMinor: number;
  moneyInMinor: number;
  moneyOutMinor: number;
  cashOnHandMinor: number;
  cashByMethod: { method: string; balanceMinor: number }[];
  owedToYouMinor: number;
  youOweMinor: number;
  unpaidEntries: number;
  openLoans: number;
  overdueLoans: number;
  newVoiceNotes: number;
  topExpenses: { category: string; totalMinor: number; count: number }[];
  trend: { revenue: { date: string; amountMinor: number }[]; costs: { date: string; amountMinor: number }[] };
}

interface Line {
  category: string;
  totalMinor: number;
  count: number;
}
export interface ProfitLoss {
  currency: string;
  period: { from: string; to: string };
  revenue: Line[];
  costOfGoods: Line[];
  expenses: Line[];
  revenueMinor: number;
  costOfGoodsMinor: number;
  grossProfitMinor: number;
  expensesMinor: number;
  netProfitMinor: number;
  monthly: { month: string; revenueMinor: number; costsMinor: number; profitMinor: number }[];
}

export interface CashFlow {
  currency: string;
  period: { from: string; to: string };
  openingMinor: number;
  moneyInMinor: number;
  moneyOutMinor: number;
  closingMinor: number;
  lines: { kind: EntryKind; label: string; moneyIn: boolean; totalMinor: number }[];
  byMethod: { method: string; balanceMinor: number }[];
  monthly: { month: string; moneyInMinor: number; moneyOutMinor: number }[];
}

interface Owing {
  party: string;
  phone: string | null;
  owingMinor: number;
  count: number;
  since: string;
}
export interface Debts {
  currency: string;
  owedToYou: Owing[];
  youOwe: Owing[];
  lentLoans: Loan[];
  borrowedLoans: Loan[];
  owedToYouMinor: number;
  youOweMinor: number;
}

export interface Period {
  from?: string;
  to?: string;
}

const base = (businessId: string) => `/businesses/${businessId}/books`;
function query(params: object) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) if (value !== undefined && value !== "" && value !== null) search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const getSummary = (businessId: string, period: Period = {}) => apiFetch<Summary>(`${base(businessId)}/summary${query(period)}`);
export const getProfitLoss = (businessId: string, period: Period = {}) => apiFetch<ProfitLoss>(`${base(businessId)}/reports/profit-loss${query(period)}`);
export const getCashFlow = (businessId: string, period: Period = {}) => apiFetch<CashFlow>(`${base(businessId)}/reports/cash-flow${query(period)}`);
export const getDebts = (businessId: string) => apiFetch<Debts>(`${base(businessId)}/reports/debts`);

export interface EntriesFilters extends Period {
  kind?: string;
  search?: string;
  category?: string;
  status?: "active" | "voided" | "all";
  unpaid?: "true";
  page?: number;
  pageSize?: number;
}
export const listEntries = (businessId: string, filters: EntriesFilters) => apiFetch<EntriesPage>(`${base(businessId)}/entries${query(filters)}`);
export const getEntry = (businessId: string, entryId: string) => apiFetch<EntryDetail>(`${base(businessId)}/entries/${entryId}`);
export const createEntry = (businessId: string, input: EntryInput) => apiFetch<Entry>(`${base(businessId)}/entries`, { method: "POST", body: input });
export const updateEntry = (businessId: string, entryId: string, input: EntryUpdate) => apiFetch<Entry>(`${base(businessId)}/entries/${entryId}`, { method: "PATCH", body: input });
export const voidEntry = (businessId: string, entryId: string, reason: string) => apiFetch<null>(`${base(businessId)}/entries/${entryId}/void`, { method: "POST", body: { reason } });
export const addEntryPayment = (businessId: string, entryId: string, input: { amountMinor: number; paidOn?: string; method: PayMethod; note?: string }) =>
  apiFetch<Entry>(`${base(businessId)}/entries/${entryId}/payments`, { method: "POST", body: input });
export const voidEntryPayment = (businessId: string, entryId: string, paymentId: string) => apiFetch<Entry>(`${base(businessId)}/entries/${entryId}/payments/${paymentId}/void`, { method: "POST" });

export const listLoans = (businessId: string, params: { status?: string; direction?: string } = {}) => apiFetch<Loan[]>(`${base(businessId)}/loans${query(params)}`);
export const getLoan = (businessId: string, loanId: string) => apiFetch<LoanDetail>(`${base(businessId)}/loans/${loanId}`);
export const createLoan = (businessId: string, input: LoanInput) => apiFetch<Loan>(`${base(businessId)}/loans`, { method: "POST", body: input });
export const updateLoan = (businessId: string, loanId: string, input: { dueOn?: string | null; purpose?: string | null; partyPhone?: string | null; interestPercent?: number }) =>
  apiFetch<LoanDetail>(`${base(businessId)}/loans/${loanId}`, { method: "PATCH", body: input });
export const addRepayment = (businessId: string, loanId: string, input: { amountMinor: number; paidOn?: string; method: PayMethod; note?: string }) =>
  apiFetch<LoanDetail>(`${base(businessId)}/loans/${loanId}/repayments`, { method: "POST", body: input });
export const writeOffLoan = (businessId: string, loanId: string, reason: string) => apiFetch<LoanDetail>(`${base(businessId)}/loans/${loanId}/write-off`, { method: "POST", body: { reason } });
export const cancelLoan = (businessId: string, loanId: string, reason: string) => apiFetch<LoanDetail>(`${base(businessId)}/loans/${loanId}/cancel`, { method: "POST", body: { reason } });

export const listVoiceNotes = (businessId: string, params: { status?: string; page?: number; pageSize?: number } = {}) => apiFetch<PaginatedResult<VoiceNote>>(`${base(businessId)}/voice${query(params)}`);
export const updateVoiceNote = (businessId: string, noteId: string, input: { caption?: string | null; transcript?: string | null; status?: "new" | "done" }) =>
  apiFetch<VoiceNote>(`${base(businessId)}/voice/${noteId}`, { method: "PATCH", body: input });
export const removeVoiceNote = (businessId: string, noteId: string) => apiFetch<null>(`${base(businessId)}/voice/${noteId}/remove`, { method: "POST" });

/** Uploads a recording straight to the file store, then saves it in the books as a voice note. */
export async function saveVoiceNote(businessId: string, recording: { blob: Blob; durationSeconds: number; caption?: string; transcript?: string }) {
  const signature = await apiFetch<UploadSignature>(`${base(businessId)}/voice/signature`, { method: "POST" });
  const type = recording.blob.type || "audio/webm";
  const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
  const file = new File([recording.blob], `voice-note.${extension}`, { type });
  const uploaded = await uploadToCloudinary(file, signature);
  return apiFetch<VoiceNote>(`${base(businessId)}/voice`, {
    method: "POST",
    body: { audioUrl: uploaded.secureUrl, mimeType: type.slice(0, 60), durationSeconds: Math.max(1, Math.min(300, Math.round(recording.durationSeconds))), caption: recording.caption || undefined, transcript: recording.transcript || undefined },
  });
}

/** Where to download from, with the filters that are on screen. */
export const entriesExportPath = (businessId: string) => `${base(businessId)}/entries/export`;
export const reportExportPath = (businessId: string) => `${base(businessId)}/reports/export`;
