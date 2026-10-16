import { z } from "zod";
import { ownImageUrl } from "../../lib/cloudinaryUrl.js";
import { strongPassword } from "../../lib/passwordPolicy.js";

export const loginSchema = z.object({
  email: z.string().email().max(254),
  // A cap keeps someone from making the server hash a megabyte-long "password".
  password: z.string().min(1).max(128),
});

export const registerSchema = z.object({
  organizationName: z.string().min(2).max(200),
  name: z.string().min(2).max(200),
  email: z.string().email(),
  password: strongPassword,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the Terms of Service and Privacy Policy to create an account" }),
  }),
});

export const verificationCodeSchema = z.object({
  code: z.string().trim().min(6).max(12),
});

export const requestEmailChangeSchema = z.object({
  email: z.string().email(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: strongPassword,
});

/** Accepting an invitation: the email, the temporary password from the invitation email, and the password they choose. */
export const acceptInvitationSchema = z.object({
  email: z.string().trim().email(),
  temporaryPassword: z.string().min(1, "Enter the temporary password from your email").max(128),
  newPassword: strongPassword,
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  avatarUrl: ownImageUrl.optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Organization name is required").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
