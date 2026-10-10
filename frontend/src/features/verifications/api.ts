import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { PaginatedResult, RegistrationStatus } from "@/types/api";

export type VerificationDocument = "id_card" | "ticket" | "link";

export interface Verification {
  id: string;
  registrationId: string;
  documentType: VerificationDocument;
  valid: boolean;
  registrationStatus: RegistrationStatus;
  currentStatus: RegistrationStatus;
  createdAt: string;
  registrationNumber: string;
  applicantName: string | null;
  applicantEmail: string | null;
  verifiedByName: string | null;
}

export interface VerificationSummary {
  total: number;
  registrationsVerified: number;
  today: number;
  idCards: number;
  tickets: number;
  invalid: number;
}

export interface ListVerificationsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  documentType?: VerificationDocument;
  result?: "valid" | "invalid";
  registrationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const DOCUMENT_LABELS: Record<VerificationDocument, string> = {
  id_card: "ID card",
  ticket: "Ticket",
  link: "Verification link",
};

export function listVerifications(programId: string, params: ListVerificationsParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return apiFetch<PaginatedResult<Verification> & { summary: VerificationSummary }>(
    `/programs/${programId}/verifications${qs ? `?${qs}` : ""}`,
  );
}

export function useVerifications(programId: string, params: ListVerificationsParams) {
  return useQuery({
    queryKey: ["verifications", programId, params],
    queryFn: () => listVerifications(programId, params),
    placeholderData: (previous) => previous,
    // Scans arrive while a program is running, so keep the list fresh.
    refetchInterval: 30_000,
  });
}
