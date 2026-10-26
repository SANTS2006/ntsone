import { apiFetch } from "@/lib/api";

export type ContributionKind = "one_time" | "recurring";
export type CellStatus = "paid" | "partial" | "unpaid" | "upcoming" | "na";

export interface Contribution {
  id: string;
  name: string;
  purpose: string;
  kind: ContributionKind;
  status: "active" | "closed";
  startYear: number | null;
  startMonth: number | null;
  expectedMonthlyMinor: number | null;
  collectedMinor: number;
  takenMinor: number;
  balanceMinor: number;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: string;
  label: string;
  orderIndex: number;
}

export interface ContributionDetail extends Contribution {
  fields: Column[];
}

export interface RecordRow {
  id: string;
  values: Record<string, string>;
  /** One-time: the amount given. Recurring: all paid so far. */
  amountMinor: number | null;
  startYear: number | null;
  startMonth: number | null;
  monthsPaid: number;
  monthsDue: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordsResult {
  items: RecordRow[];
  totalMinor: number;
  fields: Column[];
}

export interface TrackerCell {
  month: number;
  status: CellStatus;
  /** A payment is recorded and its month has passed: it can no longer be changed or removed. */
  locked: boolean;
  amountMinor: number | null;
  recordedAt: string | null;
  updatedAt: string | null;
}

export interface TrackerMember {
  id: string;
  values: Record<string, string>;
  startYear: number;
  startMonth: number;
  cells: TrackerCell[];
  paidMonths: number;
  unpaidMonths: number;
  totalMinor: number;
}

export interface Tracker {
  year: number;
  years: number[];
  expectedMonthlyMinor: number | null;
  fields: Column[];
  members: TrackerMember[];
  monthTotals: { month: number; collectedMinor: number; paidCount: number; unpaidCount: number; partialCount: number; expectedMinor: number }[];
  yearTotalMinor: number;
  unpaidCount: number;
  currentMonth: { year: number; month: number };
}

export interface Summary extends Contribution {
  years: { year: number; collectedMinor: number; payments: number; contributors: number }[];
  behind: { id: string; values: Record<string, string>; missingMonths: number }[];
  bestMonth: { year: number; month: number; collectedMinor: number } | null;
}

export interface Withdrawal {
  id: string;
  amountMinor: number;
  note: string;
  takenAt: string;
  cumulativeMinor: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export const contributionKeys = {
  all: ["contributions"] as const,
  list: () => ["contributions", "list"] as const,
  one: (id: string) => ["contributions", id] as const,
  records: (id: string) => ["contributions", id, "records"] as const,
  tracker: (id: string, year?: number) => ["contributions", id, "tracker", year ?? "current"] as const,
  summary: (id: string) => ["contributions", id, "summary"] as const,
  withdrawals: (id: string) => ["contributions", id, "withdrawals"] as const,
  activity: (id: string) => ["contributions", id, "activity"] as const,
};

const base = "/contributions";

export const listContributions = () =>
  apiFetch<{ items: Contribution[]; totals: { collectedMinor: number; takenMinor: number; balanceMinor: number } }>(base);
export const createContribution = (input: {
  name: string;
  purpose: string;
  kind: ContributionKind;
  fields: string[];
  startYear?: number;
  startMonth?: number;
  expectedMonthlyMinor?: number | null;
}) => apiFetch<Contribution>(base, { method: "POST", body: input });
export const getContribution = (id: string) => apiFetch<ContributionDetail>(`${base}/${id}`);
export const updateContribution = (id: string, input: { name?: string; purpose?: string; status?: "active" | "closed"; expectedMonthlyMinor?: number | null }) =>
  apiFetch<Contribution>(`${base}/${id}`, { method: "PATCH", body: input });
export const removeContribution = (id: string) => apiFetch<null>(`${base}/${id}`, { method: "DELETE" });

export const addColumn = (id: string, label: string) => apiFetch<Column>(`${base}/${id}/fields`, { method: "POST", body: { label } });
export const renameColumn = (id: string, fieldId: string, label: string) => apiFetch<Column>(`${base}/${id}/fields/${fieldId}`, { method: "PATCH", body: { label } });
export const removeColumn = (id: string, fieldId: string) => apiFetch<null>(`${base}/${id}/fields/${fieldId}`, { method: "DELETE" });

export const listRecords = (id: string) => apiFetch<RecordsResult>(`${base}/${id}/records`);
export const addRecord = (id: string, input: { values: Record<string, string>; amountMinor?: number; startYear?: number; startMonth?: number }) =>
  apiFetch<RecordRow>(`${base}/${id}/records`, { method: "POST", body: input });
export const updateRecord = (id: string, recordId: string, input: { values?: Record<string, string>; amountMinor?: number; startYear?: number; startMonth?: number }) =>
  apiFetch<RecordRow>(`${base}/${id}/records/${recordId}`, { method: "PATCH", body: input });
export const removeRecord = (id: string, recordId: string) => apiFetch<null>(`${base}/${id}/records/${recordId}`, { method: "DELETE" });

export const setPayment = (id: string, recordId: string, input: { year: number; month: number; amountMinor: number }) =>
  apiFetch<unknown>(`${base}/${id}/records/${recordId}/payments`, { method: "PUT", body: input });
export const removePayment = (id: string, recordId: string, year: number, month: number) =>
  apiFetch<null>(`${base}/${id}/records/${recordId}/payments/${year}/${month}`, { method: "DELETE" });
export const getTracker = (id: string, year?: number) => apiFetch<Tracker>(`${base}/${id}/tracker${year ? `?year=${year}` : ""}`);
export const getSummary = (id: string) => apiFetch<Summary>(`${base}/${id}/summary`);

export const listWithdrawals = (id: string) => apiFetch<{ items: Withdrawal[]; totalTakenMinor: number }>(`${base}/${id}/withdrawals`);
export const addWithdrawal = (id: string, input: { amountMinor: number; note: string; takenAt?: string }) =>
  apiFetch<{ balanceMinor: number }>(`${base}/${id}/withdrawals`, { method: "POST", body: input });
export const updateWithdrawal = (id: string, withdrawalId: string, input: { amountMinor?: number; note?: string; takenAt?: string }) =>
  apiFetch<unknown>(`${base}/${id}/withdrawals/${withdrawalId}`, { method: "PATCH", body: input });
export const removeWithdrawal = (id: string, withdrawalId: string) => apiFetch<null>(`${base}/${id}/withdrawals/${withdrawalId}`, { method: "DELETE" });

export const getActivity = (id: string) => apiFetch<ActivityEvent[]>(`${base}/${id}/activity`);

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

/** "12 Mar 2026, 14:05" */
export const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
