import slugify from "slugify";
import { env, isProduction } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { signAccessToken } from "../../lib/jwt.js";
import { clearLoginFailures, recordLoginFailure, assertLoginAllowed } from "../../lib/loginThrottle.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../../lib/password.js";
import { addDuration, generateOpaqueToken, generateVerificationCode, hashToken } from "../../lib/tokens.js";
import { sendEmail } from "../email/service.js";
import {
  passwordChangedEmail,
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetEmail,
  VERIFICATION_CODE_TTL_MINUTES,
  verificationCodeEmail,
} from "../email/templates.js";
import type { AuthenticatedUser } from "../users/types.js";
import * as authRepo from "./repository.js";
import * as usersRepo from "../users/repository.js";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from "./schemas.js";

const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function toAuthenticatedUser(user: Awaited<ReturnType<typeof authRepo.findUserByEmail>>): AuthenticatedUser {
  if (!user) throw AppError.unauthorized();
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    tenantId: user.tenantId,
    emailVerified: !!user.emailVerifiedAt,
  };
}

async function issueVerificationCode(
  user: { id: string; name: string },
  email: string,
  purpose: authRepo.VerificationPurpose,
  options: { enforceCooldown: boolean },
): Promise<void> {
  if (options.enforceCooldown) {
    const latest = await authRepo.findLatestVerificationCode(user.id, purpose);
    const secondsSince = latest ? (Date.now() - latest.createdAt.getTime()) / 1000 : Infinity;
    if (secondsSince < RESEND_COOLDOWN_SECONDS) {
      throw AppError.validation(
        `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSince)} seconds before requesting another code`,
      );
    }
  }

  const code = generateVerificationCode();
  await authRepo.replaceVerificationCode({
    userId: user.id,
    email,
    purpose,
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60_000),
  });

  // Lets the flow be exercised locally without a working email sender.
  if (!isProduction) console.log(`[verification-code] ${purpose} for ${email}: ${code}`);

  const message = verificationCodeEmail({ name: user.name, code, purpose });
  await sendEmail({ to: email, toName: user.name, subject: message.subject, html: message.html });
}

/** Checks a submitted code against the user's active one, counting failed attempts. */
async function consumeValidCode(userId: string, purpose: authRepo.VerificationPurpose, submitted: string) {
  const active = await authRepo.findActiveVerificationCode(userId, purpose);
  if (!active) throw AppError.validation("This code has expired. Please request a new one.");
  if (active.attempts >= MAX_CODE_ATTEMPTS) {
    throw AppError.validation("Too many incorrect attempts. Please request a new code.");
  }

  const normalized = submitted.replace(/\s+/g, "").toUpperCase();
  if (hashToken(normalized) !== active.codeHash) {
    const attempts = active.attempts + 1;
    await authRepo.incrementVerificationAttempts(active.id, attempts);
    const remaining = MAX_CODE_ATTEMPTS - attempts;
    throw AppError.validation(
      remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        : "Too many incorrect attempts. Please request a new code.",
    );
  }

  await authRepo.consumeVerificationCode(active.id);
  return active;
}

export async function generateUniqueTenantSlug(name: string): Promise<string> {
  const base = slugify(name, { lower: true, strict: true }).slice(0, 180) || "account";
  let candidate = base;
  let suffix = 2;
  while (await authRepo.tenantSlugExists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthenticatedUser;
}

export async function login(input: LoginInput, context: { userAgent?: string; ipAddress?: string }): Promise<LoginResult> {
  assertLoginAllowed(input.email);
  const user = await authRepo.findUserByEmail(input.email);
  if (!user) {
    // Same work and same answer as a wrong password, so this can't be used to find registered emails.
    await burnPasswordCheck(input.password);
    recordLoginFailure(input.email);
    throw AppError.unauthorized("Invalid email or password");
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    recordLoginFailure(input.email);
    throw AppError.unauthorized("Invalid email or password");
  }
  clearLoginFailures(input.email);

  if (user.status !== "active") throw AppError.forbidden("This account has been suspended");

  // Invited people (team members, and anyone given access to a program, poll, or business) receive
  // their temporary password solely in the invitation email, so signing in with it proves they
  // control the address -- that's the invite's confirm step. They are the accounts that never
  // agreed to the terms at sign-up (termsAcceptedAt is empty), plus legacy invited team members.
  const invited = user.role === "program_admin" || user.role === "viewer" || !user.termsAcceptedAt;
  const signedInUser = !user.emailVerifiedAt && invited ? await authRepo.markEmailVerified(user.id) : user;

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId });
  const refreshToken = generateOpaqueToken();
  const refreshTokenExpiresAt = addDuration(new Date(), env.JWT_REFRESH_TTL);

  await authRepo.storeRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });
  await authRepo.touchLastLogin(user.id);

  return { accessToken, refreshToken, refreshTokenExpiresAt, user: toAuthenticatedUser(signedInUser) };
}

export async function register(
  input: RegisterInput,
  context: { userAgent?: string; ipAddress?: string },
): Promise<LoginResult> {
  const existing = await authRepo.findUserByEmail(input.email);
  if (existing) throw AppError.conflict("An account with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const slug = await generateUniqueTenantSlug(input.organizationName);

  const { user } = await authRepo.createTenantAndAdmin({
    organizationName: input.organizationName,
    slug,
    name: input.name,
    email: input.email,
    passwordHash,
  });

  await issueVerificationCode(user, user.email, "signup", { enforceCooldown: false });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId });
  const refreshToken = generateOpaqueToken();
  const refreshTokenExpiresAt = addDuration(new Date(), env.JWT_REFRESH_TTL);

  await authRepo.storeRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });
  await authRepo.touchLastLogin(user.id);

  return { accessToken, refreshToken, refreshTokenExpiresAt, user: toAuthenticatedUser(user) };
}

export async function verifyEmail(userId: string, code: string): Promise<AuthenticatedUser> {
  const user = await authRepo.findUserById(userId);
  if (!user) throw AppError.unauthorized();
  if (user.emailVerifiedAt) return toAuthenticatedUser(user);

  await consumeValidCode(userId, "signup", code);
  return toAuthenticatedUser(await authRepo.markEmailVerified(userId));
}

export async function resendVerificationCode(userId: string): Promise<void> {
  const user = await authRepo.findUserById(userId);
  if (!user) throw AppError.unauthorized();
  if (user.emailVerifiedAt) throw AppError.conflict("Your email address is already verified");
  await issueVerificationCode(user, user.email, "signup", { enforceCooldown: true });
}

export async function requestEmailChange(userId: string, newEmail: string): Promise<void> {
  const user = await authRepo.findUserById(userId);
  if (!user) throw AppError.unauthorized();

  const email = newEmail.trim().toLowerCase();
  if (email === user.email) throw AppError.validation("That's already your current email address");

  const taken = await authRepo.findUserByEmail(email);
  if (taken) throw AppError.conflict("That email address is already in use");

  // The code goes to the NEW address; users.email only changes once it's confirmed.
  await issueVerificationCode(user, email, "email_change", { enforceCooldown: true });
}

export async function confirmEmailChange(userId: string, code: string): Promise<AuthenticatedUser> {
  const pending = await consumeValidCode(userId, "email_change", code);

  // Re-check: the address could have been claimed by someone else since the code was sent.
  const taken = await authRepo.findUserByEmail(pending.email);
  if (taken && taken.id !== userId) throw AppError.conflict("That email address is already in use");

  return toAuthenticatedUser(await authRepo.updateUserEmail(userId, pending.email));
}

export async function refresh(
  refreshToken: string,
  context: { userAgent?: string; ipAddress?: string },
): Promise<LoginResult> {
  const tokenHash = hashToken(refreshToken);
  const existing = await authRepo.findActiveRefreshToken(tokenHash);
  if (!existing) throw AppError.unauthorized("Invalid or expired refresh token");

  const user = await authRepo.findUserById(existing.userId);
  if (!user || user.status !== "active") throw AppError.unauthorized("Account is not active");

  await authRepo.revokeRefreshToken(tokenHash);

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId });
  const newRefreshToken = generateOpaqueToken();
  const refreshTokenExpiresAt = addDuration(new Date(), env.JWT_REFRESH_TTL);

  await authRepo.storeRefreshToken({
    userId: user.id,
    tokenHash: hashToken(newRefreshToken),
    expiresAt: refreshTokenExpiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  return { accessToken, refreshToken: newRefreshToken, refreshTokenExpiresAt, user: toAuthenticatedUser(user) };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await authRepo.revokeRefreshToken(hashToken(refreshToken));
}

export async function forgotPassword(input: ForgotPasswordInput, appUrl: string): Promise<void> {
  const user = await authRepo.findUserByEmail(input.email);
  // Always behave the same whether or not the account exists, to avoid leaking which emails are registered.
  if (!user) return;

  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);

  await authRepo.storePasswordResetToken({ userId: user.id, tokenHash: hashToken(token), expiresAt });

  const resetUrl = `${appUrl}/reset-password?token=${token}`;
  const message = passwordResetEmail(resetUrl);
  await sendEmail({ to: user.email, toName: user.name, subject: message.subject, html: message.html });
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = hashToken(input.token);
  const record = await authRepo.findActivePasswordResetToken(tokenHash);
  if (!record) throw AppError.validation("This reset link is invalid or has expired");

  const passwordHash = await hashPassword(input.password);
  await authRepo.updateUserPassword(record.userId, passwordHash);
  await authRepo.markPasswordResetTokenUsed(record.id);
  await authRepo.revokeAllRefreshTokensForUser(record.userId);

  const user = await authRepo.findUserById(record.userId);
  if (!user) return;
  // The reset link could only be opened from this inbox, so it also proves the address.
  if (!user.emailVerifiedAt) await authRepo.markEmailVerified(user.id);
  const message = passwordChangedEmail({ name: user.name, loginUrl: `${env.APP_URL}/login` });
  await sendEmail({ to: user.email, toName: user.name, subject: message.subject, html: message.html });
}

export async function getCurrentUser(userId: string): Promise<AuthenticatedUser> {
  const user = await authRepo.findUserById(userId);
  return toAuthenticatedUser(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthenticatedUser> {
  const updated = await authRepo.updateUserProfile(userId, input);
  return toAuthenticatedUser(updated);
}

export async function getOrganization(userId: string): Promise<{ name: string; canEdit: boolean }> {
  const user = await authRepo.findUserById(userId);
  if (!user || !user.tenantId) throw AppError.notFound("Organization not found");
  const tenant = await authRepo.findTenantById(user.tenantId);
  if (!tenant) throw AppError.notFound("Organization not found");
  return { name: tenant.name, canEdit: user.role === "admin" };
}

/** Only an admin of the organization can rename it. The web address (slug) stays the same so shared links keep working. */
export async function updateOrganization(userId: string, name: string): Promise<{ name: string; canEdit: boolean }> {
  const user = await authRepo.findUserById(userId);
  if (!user || !user.tenantId) throw AppError.notFound("Organization not found");
  if (user.role !== "admin") throw AppError.forbidden();
  const tenant = await authRepo.updateTenantName(user.tenantId, name);
  if (!tenant) throw AppError.notFound("Organization not found");
  return { name: tenant.name, canEdit: true };
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await authRepo.findUserById(userId);
  if (!user) throw AppError.unauthorized();

  const currentOk = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!currentOk) throw AppError.validation("Current password is incorrect");

  const passwordHash = await hashPassword(input.newPassword);
  await authRepo.updateUserPassword(userId, passwordHash);
  await authRepo.revokeAllRefreshTokensForUser(userId);
}

/**
 * For someone who was invited to another account as a team member: opens their own space, where
 * they are the admin and can make their own programs, polls and businesses and invite others. The
 * access they were given elsewhere stays exactly as it was.
 */
export async function createOwnSpace(userId: string): Promise<AuthenticatedUser> {
  const user = await authRepo.findUserById(userId);
  if (!user) throw AppError.unauthorized();
  if (user.role === "super_admin") throw AppError.forbidden();
  if (user.role === "admin") throw AppError.conflict("You already have your own space");
  const firstName = user.name.trim().split(/\s+/)[0] || "My";
  const name = `${firstName}'s space`;
  const previousTenantId = user.tenantId;
  const previousRole = user.role;
  const { user: moved } = await authRepo.moveUserToNewTenant(user.id, { name, slug: await generateUniqueTenantSlug(name) });
  // They stay on the team they were invited to, under the same role, so its admin still sees them.
  if (previousTenantId && (previousRole === "program_admin" || previousRole === "viewer")) {
    await usersRepo.ensureTeamLink(previousTenantId, user.id, previousRole);
  }
  return toAuthenticatedUser(moved);
}
