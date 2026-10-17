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

/** The ID token Google gives the browser after "Continue with Google". */
export const googleSignInSchema = z.object({
  credential: z.string().min(20, "Google did not send a sign-in. Please try again.").max(5000),
});

/** The step after signing up with Google: name the organization and agree to the terms. */
export const completeSetupSchema = z.object({
  organizationName: z.string().trim().min(2, "Enter your organization's name (at least 2 characters)").max(200, "The organization's name is too long (200 characters at most)"),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the Terms of Service and Privacy Policy to continue" }),
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

/** Accepting an invitation: the private token from the invitation email, and the password the person chooses. */
export const acceptInvitationSchema = z.object({
  token: z.string().min(10, "This invitation link is not complete. Open it again from your email").max(200),
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
