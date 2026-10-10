import { apiFetch } from "@/lib/api";
import type { FormWithContent } from "@/types/api";
import type { EditableFormPayload } from "./types";

export function getAdminForm(programId: string) {
  return apiFetch<FormWithContent>(`/programs/${programId}/form`);
}

export function saveFormDraft(programId: string, payload: EditableFormPayload) {
  return apiFetch<FormWithContent>(`/programs/${programId}/form`, { method: "POST", body: payload });
}

export function publishForm(programId: string) {
  return apiFetch<{ id: string; version: number }>(`/programs/${programId}/form/publish`, { method: "POST" });
}

export interface FormShareInfo {
  published: boolean;
  publicUrl: string;
  qrCodeDataUrl: string | null;
}

export function getFormShareInfo(programId: string) {
  return apiFetch<FormShareInfo>(`/programs/${programId}/form/share`);
}
