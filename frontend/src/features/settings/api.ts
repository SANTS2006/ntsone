import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/types/api";

export function updateProfile(input: { name?: string; avatarUrl?: string }) {
  return apiFetch<AuthUser>("/auth/me", { method: "PATCH", body: input });
}

export interface Organization {
  name: string;
  canEdit: boolean;
}

export function getOrganization() {
  return apiFetch<Organization>("/auth/me/organization");
}

export function updateOrganization(name: string) {
  return apiFetch<Organization>("/auth/me/organization", { method: "PATCH", body: { name } });
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return apiFetch<null>("/auth/me/change-password", { method: "POST", body: input });
}

interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
}

export async function uploadAvatar(file: File): Promise<string> {
  const signature = await apiFetch<UploadSignature>("/auth/me/avatar-upload-signature", { method: "POST" });

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
  if (!response.ok) throw new Error("Avatar upload failed");
  const json = await response.json();
  return json.secure_url as string;
}
