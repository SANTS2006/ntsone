import type { FastifyReply, FastifyRequest } from "fastify";
import { env, isProduction } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { recordAudit } from "../audit/recorder.js";
import { createUploadSignature } from "../uploads/service.js";
import * as authService from "./service.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  requestEmailChangeSchema,
  resetPasswordSchema,
  updateOrganizationSchema,
  updateProfileSchema,
  verificationCodeSchema,
} from "./schemas.js";

const REFRESH_COOKIE = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/auth";

function setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  });
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = loginSchema.parse(request.body);
  const result = await authService.login(input, {
    userAgent: request.headers["user-agent"],
    ipAddress: request.ip,
  });
  setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt);
  await recordAudit({
    actorUserId: result.user.id,
    action: "login",
    entityType: "user",
    entityId: result.user.id,
    ipAddress: request.ip,
  });
  return sendSuccess(reply, { accessToken: result.accessToken, user: result.user }, "Logged in successfully");
}

export async function registerHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = registerSchema.parse(request.body);
  const result = await authService.register(input, {
    userAgent: request.headers["user-agent"],
    ipAddress: request.ip,
  });
  setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt);
  await recordAudit({
    actorUserId: result.user.id,
    action: "user.register",
    entityType: "user",
    entityId: result.user.id,
    ipAddress: request.ip,
  });
  return sendSuccess(reply, { accessToken: result.accessToken, user: result.user }, "Account created", 201);
}

export async function refreshHandler(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[REFRESH_COOKIE];
  if (!token) throw AppError.unauthorized("No refresh token provided");

  const result = await authService.refresh(token, {
    userAgent: request.headers["user-agent"],
    ipAddress: request.ip,
  });
  setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt);
  return sendSuccess(reply, { accessToken: result.accessToken, user: result.user }, "Session refreshed");
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[REFRESH_COOKIE];
  await authService.logout(token);
  clearRefreshCookie(reply);
  if (request.user) {
    await recordAudit({ actorUserId: request.user.id, action: "logout", entityType: "user", entityId: request.user.id });
  }
  return sendSuccess(reply, null, "Logged out successfully");
}

export async function forgotPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = forgotPasswordSchema.parse(request.body);
  await authService.forgotPassword(input, env.APP_URL);
  return sendSuccess(reply, null, "If an account exists for that email, a reset link has been sent.");
}

export async function resetPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = resetPasswordSchema.parse(request.body);
  await authService.resetPassword(input);
  return sendSuccess(reply, null, "Password has been reset. Please log in.");
}

export async function meHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  return sendSuccess(reply, request.user, "Current user");
}

export async function getOrganizationHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  return sendSuccess(reply, await authService.getOrganization(request.user.id));
}

export async function updateOrganizationHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { name } = updateOrganizationSchema.parse(request.body);
  const result = await authService.updateOrganization(request.user.id, name);
  await recordAudit({
    actorUserId: request.user.id,
    action: "organization.rename",
    entityType: "tenant",
    entityId: request.user.tenantId ?? undefined,
    ipAddress: request.ip,
  });
  return sendSuccess(reply, result);
}

export async function updateProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const input = updateProfileSchema.parse(request.body);
  const user = await authService.updateProfile(request.user.id, input);
  await recordAudit({
    actorUserId: request.user.id,
    action: "user.update_profile",
    entityType: "user",
    entityId: request.user.id,
    ipAddress: request.ip,
  });
  return sendSuccess(reply, user, "Profile updated");
}

export async function changePasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const input = changePasswordSchema.parse(request.body);
  await authService.changePassword(request.user.id, input);
  clearRefreshCookie(reply);
  await recordAudit({
    actorUserId: request.user.id,
    action: "user.change_password",
    entityType: "user",
    entityId: request.user.id,
    ipAddress: request.ip,
  });
  return sendSuccess(reply, null, "Password changed. Please log in again.");
}

export async function verifyEmailHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { code } = verificationCodeSchema.parse(request.body);
  const user = await authService.verifyEmail(request.user.id, code);
  await recordAudit({
    actorUserId: user.id,
    action: "user.verify_email",
    entityType: "user",
    entityId: user.id,
    ipAddress: request.ip,
  });
  return sendSuccess(reply, user, "Email verified");
}

export async function resendVerificationHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  await authService.resendVerificationCode(request.user.id);
  return sendSuccess(reply, null, "A new verification code has been sent");
}

export async function requestEmailChangeHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { email } = requestEmailChangeSchema.parse(request.body);
  await authService.requestEmailChange(request.user.id, email);
  return sendSuccess(reply, null, "We've sent a verification code to your new email address");
}

export async function confirmEmailChangeHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const { code } = verificationCodeSchema.parse(request.body);
  const previousEmail = request.user.email;
  const user = await authService.confirmEmailChange(request.user.id, code);
  await recordAudit({
    actorUserId: user.id,
    action: "user.change_email",
    entityType: "user",
    entityId: user.id,
    metadata: { from: previousEmail, to: user.email },
    ipAddress: request.ip,
  });
  return sendSuccess(reply, user, "Email address updated");
}

export async function avatarUploadSignatureHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const signature = createUploadSignature(`users/${request.user.id}`);
  return sendSuccess(reply, signature);
}

export async function createOwnSpaceHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) throw AppError.unauthorized();
  const user = await authService.createOwnSpace(request.user.id);
  await recordAudit({ actorUserId: user.id, action: "account.own_space_created", entityType: "tenant", entityId: user.tenantId, ipAddress: request.ip });
  return sendSuccess(reply, { user }, "Your own space is ready");
}
