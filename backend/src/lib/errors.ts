export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "EMAIL_NOT_VERIFIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static validation(message: string, details?: unknown) {
    return new AppError("VALIDATION_ERROR", message, 400, details);
  }

  static unauthorized(message = "Authentication required") {
    return new AppError("UNAUTHORIZED", message, 401);
  }

  static forbidden(message = "You do not have access to this resource") {
    return new AppError("FORBIDDEN", message, 403);
  }

  static emailNotVerified() {
    return new AppError("EMAIL_NOT_VERIFIED", "Please verify your email address to continue", 403);
  }

  static notFound(message = "Resource not found") {
    return new AppError("NOT_FOUND", message, 404);
  }

  /** The thing asked for needs a payment first (e.g. an ID card that hasn't been paid for). */
  static paymentRequired(message: string) {
    return new AppError("PAYMENT_REQUIRED", message, 402);
  }

  /** The payment service can't be reached or isn't set up; nothing was charged. */
  static paymentUnavailable(message = "Payments are not available right now. Please try again in a moment.") {
    return new AppError("PAYMENT_UNAVAILABLE", message, 503);
  }

  static conflict(message: string, details?: unknown) {
    return new AppError("CONFLICT", message, 409, details);
  }
}
