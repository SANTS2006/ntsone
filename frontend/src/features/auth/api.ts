import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/types/api";

export function verifyEmail(code: string) {
  return apiFetch<AuthUser>("/auth/verify-email", { method: "POST", body: { code } });
}

export function resendVerificationCode() {
  return apiFetch<null>("/auth/verify-email/resend", { method: "POST" });
}

export function requestEmailChange(email: string) {
  return apiFetch<null>("/auth/me/email", { method: "POST", body: { email } });
}

export function requestPasswordReset(email: string) {
  return apiFetch<null>("/auth/forgot-password", { method: "POST", body: { email }, skipAuthRetry: true });
}

export function resetPassword(token: string, password: string) {
  return apiFetch<null>("/auth/reset-password", { method: "POST", body: { token, password }, skipAuthRetry: true });
}

export function confirmEmailChange(code: string) {
  return apiFetch<AuthUser>("/auth/me/email/confirm", { method: "POST", body: { code } });
}
