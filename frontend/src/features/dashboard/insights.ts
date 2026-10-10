import { apiFetch } from "@/lib/api";
import type { ProgramStatus, RegistrationStatus } from "@/types/api";
import type { TrendPoint } from "../analytics/api";
import type { VerificationDocument } from "../verifications/api";

export interface DashboardInsights {
  documents: { idCardPrograms: number; ticketPrograms: number };
  verification: {
    totalScans: number;
    scansToday: number;
    scansThisWeek: number;
    peopleVerified: number;
    invalidScans: number;
    idCardScans: number;
    ticketScans: number;
    /** Registrations in programs with ID cards or tickets turned on. */
    eligibleRegistrations: number;
    /** Share of those registrations whose card or ticket has been scanned, 0-100. */
    checkInRate: number;
  };
  review: { pending: number; approvalRate: number };
  scanTrend: TrendPoint[];
  programs: {
    id: string;
    name: string;
    status: ProgramStatus;
    documentsEnabled: boolean;
    registrations: number;
    registrationsThisWeek: number;
    approved: number;
    scans: number;
    peopleVerified: number;
  }[];
  recentScans: {
    id: string;
    programId: string;
    programName: string;
    registrationId: string;
    applicantName: string | null;
    registrationNumber: string;
    documentType: VerificationDocument;
    valid: boolean;
    createdAt: string;
    verifiedByName: string | null;
  }[];
  recentRegistrations: {
    id: string;
    programId: string;
    programName: string;
    applicantName: string | null;
    registrationNumber: string;
    status: RegistrationStatus;
    submittedAt: string;
  }[];
}

export function getDashboardInsights() {
  return apiFetch<DashboardInsights>("/dashboard/insights");
}
