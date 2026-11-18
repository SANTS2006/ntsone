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

export interface MyOrganization {
  id: string;
  name: string;
}

/** The other organizations the signed-in person belongs to. */
export function listMyOrganizations() {
  return apiFetch<MyOrganization[]>("/auth/me/organizations");
}

/** Leaves an organization the person was added to. */
export function leaveOrganization(tenantId: string) {
  return apiFetch<{ user: import("@/types/api").AuthUser }>(`/auth/me/organizations/${encodeURIComponent(tenantId)}/leave`, { method: "POST" });
}

/** Deletes the signed-in person's own account for good. Needs their password and the word DELETE. */
export function deleteOwnAccount(input: { password: string }) {
  return apiFetch<null>("/auth/me/delete-account", { method: "POST", body: { password: input.password, confirm: "DELETE" } });
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
