import { apiFetch } from "@/lib/api";
import type { PaginatedResult, Program, RegistrationNumberConfig } from "@/types/api";

export interface ListProgramsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

function toQuery(params: object) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const str = query.toString();
  return str ? `?${str}` : "";
}

export function listPrograms(params: ListProgramsParams) {
  return apiFetch<PaginatedResult<Program>>(`/programs${toQuery(params)}`);
}

export function getProgram(programId: string) {
  return apiFetch<Program>(`/programs/${programId}`);
}

export interface CreateProgramInput {
  name: string;
  description?: string;
  shortDescription?: string;
  startDate?: string;
  endDate?: string;
  registrationStartDate?: string;
  registrationEndDate?: string;
  /** Platform super admin only: the account the program belongs to. */
  tenantId?: string;
}

export function createProgram(input: CreateProgramInput) {
  return apiFetch<Program>("/programs", { method: "POST", body: input });
}

export function updateProgram(
  programId: string,
  input: Partial<CreateProgramInput> & {
    registrationEnabled?: boolean;
    idCardEnabled?: boolean;
    ticketEnabled?: boolean;
    oneRegistrationPerEmail?: boolean;
    notifyOnRegistration?: boolean;
    allowSubmissionCopy?: boolean;
    notifyOnVerification?: boolean;
    thumbnailUrl?: string;
    registrationNumberConfig?: RegistrationNumberConfig;
  },
) {
  return apiFetch<Program>(`/programs/${programId}`, { method: "PATCH", body: input });
}

export function deleteProgram(programId: string) {
  return apiFetch<null>(`/programs/${programId}`, { method: "DELETE" });
}

export function publishProgram(programId: string) {
  return apiFetch<Program>(`/programs/${programId}/publish`, { method: "POST" });
}

export function unpublishProgram(programId: string) {
  return apiFetch<Program>(`/programs/${programId}/unpublish`, { method: "POST" });
}

export function closeRegistration(programId: string) {
  return apiFetch<Program>(`/programs/${programId}/registration/close`, { method: "POST" });
}

export function reopenRegistration(programId: string) {
  return apiFetch<Program>(`/programs/${programId}/registration/reopen`, { method: "POST" });
}

export function archiveProgram(programId: string) {
  return apiFetch<Program>(`/programs/${programId}/archive`, { method: "POST" });
}

export function duplicateProgram(programId: string) {
  return apiFetch<Program>(`/programs/${programId}/duplicate`, { method: "POST" });
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
}

export function getProgramUploadSignature(programId: string) {
  return apiFetch<UploadSignature>(`/programs/${programId}/uploads/signature`, { method: "POST" });
}

export function setProgramThumbnail(programId: string, thumbnailUrl: string) {
  return apiFetch<Program>(`/programs/${programId}/thumbnail`, { method: "POST", body: { thumbnailUrl } });
}

export async function uploadToCloudinary(file: File, signature: UploadSignature): Promise<{ secureUrl: string; publicId: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("signature", signature.signature);
  formData.append("folder", signature.folder);
  // Part of what the signature covers: only pictures and documents are accepted.
  formData.append("allowed_formats", signature.allowedFormats);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("File upload failed");
  }

  const json = await response.json();
  return { secureUrl: json.secure_url, publicId: json.public_id };
}
