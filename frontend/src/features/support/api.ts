import { apiFetch } from "@/lib/api";
import type { PaginatedResult } from "@/types/api";

export type FeedbackCategory = "improvement" | "bug" | "feature" | "other";
export type MessageKind = "feedback" | "contact" | "report";
export type MessageStatus = "new" | "read" | "resolved";

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  improvement: "Improvement",
  bug: "Bug or problem",
  feature: "New feature request",
  other: "Something else",
};

export function sendFeedback(input: { category: FeedbackCategory; subject: string; message: string; programId?: string }) {
  return apiFetch<{ received: boolean }>("/support/feedback", { method: "POST", body: input });
}

export interface SupportMessage {
  id: string;
  kind: MessageKind;
  status: MessageStatus;
  category: string | null;
  subject: string | null;
  message: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  link: string | null;
  ipAddress: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  organizationName: string | null;
  programId: string | null;
  programName: string | null;
}

export function listMessages(params: { kind: MessageKind; status?: MessageStatus; search?: string; page: number; dateFrom?: string; dateTo?: string }) {
  const query = new URLSearchParams({ kind: params.kind, page: String(params.page), pageSize: "20" });
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  return apiFetch<PaginatedResult<SupportMessage> & { newCounts: Record<MessageKind, number> }>(
    `/platform/messages?${query.toString()}`,
  );
}

export function getMessage(id: string) {
  return apiFetch<SupportMessage>(`/platform/messages/${id}`);
}

export function updateMessageStatus(id: string, status: MessageStatus) {
  return apiFetch<SupportMessage>(`/platform/messages/${id}`, { method: "PATCH", body: { status } });
}
