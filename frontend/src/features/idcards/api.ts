import { apiFetch } from "@/lib/api";
import { getProgramUploadSignature, uploadToCloudinary } from "../programs/api";

export interface IdCardConfig {
  template: string;
  primaryColor: string;
  secondaryColor: string;
  roleText: string;
  roleFieldKey?: string;
  visibleFields: string[];
  showQrCode: boolean;
  photoFieldKey?: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  terms?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactWebsite?: string;
  contactAddress?: string;
  signatureLabel: string;
  showOnConfirmation: boolean;
  /** Where the photo comes from: each registrant's upload, one event flyer, or no photo. */
  photoSource: "field" | "flyer" | "none";
  flyerUrl?: string;
  roleOptions?: string[];
  showRegistrationNumber: boolean;
  showRole: boolean;
  showDates: boolean;
  showTerms: boolean;
  showContact: boolean;
  showSignature: boolean;
  showBarcode: boolean;
}

/** One registrant's ID card changes, set from their registration page. */
export interface DocumentOverrides {
  role?: string;
  photoUrl?: string;
}

export function updateDocumentOverrides(
  programId: string,
  registrationId: string,
  input: { role?: string | null; photoUrl?: string | null },
) {
  return apiFetch<DocumentOverrides>(`/programs/${programId}/registrations/${registrationId}/document-overrides`, {
    method: "PATCH",
    body: input,
  });
}

export interface IdCardConfigResponse {
  idCardEnabled: boolean;
  config: IdCardConfig;
  organizationName: string;
}

export function getIdCardConfig(programId: string) {
  return apiFetch<IdCardConfigResponse>(`/programs/${programId}/id-card/config`);
}

export function updateIdCardConfig(programId: string, config: IdCardConfig) {
  return apiFetch<IdCardConfig>(`/programs/${programId}/id-card/config`, {
    method: "PATCH",
    body: config,
  });
}

/** Uploads a logo or design image for cards and tickets, returning its URL. */
export async function uploadIdCardBackground(programId: string, file: File): Promise<string> {
  const signature = await getProgramUploadSignature(programId);
  const { secureUrl } = await uploadToCloudinary(file, signature);
  return secureUrl;
}
