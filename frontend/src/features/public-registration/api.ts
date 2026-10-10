import { apiFetch } from "@/lib/api";
import type { FormWithContent, PublicProgram } from "@/types/api";
import type { UploadedFileInfo } from "./DynamicForm";

export function getPublicProgram(slug: string) {
  return apiFetch<PublicProgram>(`/public/programs/${slug}`);
}

export function getPublicForm(slug: string) {
  return apiFetch<FormWithContent>(`/public/programs/${slug}/form`);
}

export interface SubmitRegistrationResult {
  registrationNumber: string;
  status: string;
  confirmationMessage: string | null;
  showRegistrationNumber: boolean;
  idCardAvailable: boolean;
  ticketAvailable: boolean;
  /** Private link token for viewing and downloading the submitted answers. */
  receiptToken?: string;
  /** When the registration or order has to be paid for. */
  payment?: { token: string; status: "pending" | "failed"; redirectUrl: string | null; amountMinor: number; currency: string };
}

export function submitRegistration(
  slug: string,
  responses: Record<string, unknown>,
  files: UploadedFileInfo[],
  consentAccepted: boolean,
  idempotencyKey?: string,
  items?: { itemId: string; quantity: number }[],
) {
  return apiFetch<SubmitRegistrationResult>(`/public/programs/${slug}/registrations`, {
    method: "POST",
    // The same key on a retry makes the server return the first result instead of registering twice.
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: { responses, files, consentAccepted, items },
  });
}

export interface VerificationResult {
  registrationNumber: string;
  programName: string;
  applicantName: string | null;
  status: string;
  valid: boolean;
  documentType: "id_card" | "ticket" | "link";
  verifiedAt: string;
  scannedByTeamMember: boolean;
  /** The details printed on the scanned card or ticket. */
  details: { label: string; value: string }[];
  submittedAt: string;
  /** Scanned before: only the first scan of each document is logged. */
  alreadyVerified: boolean;
  firstVerifiedAt: string;
}

export function verifyRegistration(slug: string, registrationNumber: string, doc?: string | null) {
  const query = doc ? `?doc=${encodeURIComponent(doc)}` : "";
  return apiFetch<VerificationResult>(
    `/public/verify/${encodeURIComponent(slug)}/${encodeURIComponent(registrationNumber)}${query}`,
  );
}

interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
}

export async function uploadPublicFile(slug: string, fieldKey: string, file: File): Promise<UploadedFileInfo> {
  const signature = await apiFetch<UploadSignature>(`/public/uploads/signature?slug=${encodeURIComponent(slug)}`, {
    method: "POST",
  });

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
  if (!response.ok) throw new Error("File upload failed");
  const json = await response.json();

  return {
    fieldKey,
    url: json.secure_url,
    publicId: json.public_id,
    filename: file.name,
    // Browsers leave the type empty for some files (e.g. certain .docx on Windows).
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
}
