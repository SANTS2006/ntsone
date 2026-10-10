import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/authenticate.js";
import {
  avatarUploadSignatureHandler,
  changePasswordHandler,
  confirmEmailChangeHandler,
  createOwnSpaceHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  getOrganizationHandler,
  updateOrganizationHandler,
  refreshHandler,
  registerHandler,
  requestEmailChangeHandler,
  resendVerificationHandler,
  resetPasswordHandler,
  updateProfileHandler,
  verifyEmailHandler,
} from "./controller.js";

const strictAuthRateLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", { config: strictAuthRateLimit }, loginHandler);
  app.post("/register", { config: strictAuthRateLimit }, registerHandler);
  app.post("/refresh", refreshHandler);
  app.post("/logout", logoutHandler);
  app.post("/forgot-password", { config: strictAuthRateLimit }, forgotPasswordHandler);
  app.post("/reset-password", { config: strictAuthRateLimit }, resetPasswordHandler);
  app.get("/me", { preHandler: authenticate }, meHandler);
  app.get("/me/organization", { preHandler: authenticate }, getOrganizationHandler);
  app.patch("/me/organization", { preHandler: authenticate }, updateOrganizationHandler);
  app.patch("/me", { preHandler: authenticate }, updateProfileHandler);
  app.post("/me/own-space", { preHandler: authenticate, config: strictAuthRateLimit }, createOwnSpaceHandler);
  app.post("/me/change-password", { preHandler: authenticate, config: strictAuthRateLimit }, changePasswordHandler);
  app.post("/me/avatar-upload-signature", { preHandler: authenticate }, avatarUploadSignatureHandler);

  app.post("/verify-email", { preHandler: authenticate, config: strictAuthRateLimit }, verifyEmailHandler);
  app.post("/verify-email/resend", { preHandler: authenticate, config: strictAuthRateLimit }, resendVerificationHandler);
  app.post("/me/email", { preHandler: authenticate, config: strictAuthRateLimit }, requestEmailChangeHandler);
  app.post("/me/email/confirm", { preHandler: authenticate, config: strictAuthRateLimit }, confirmEmailChangeHandler);
}
