import { AppError } from "../../lib/errors.js";

/**
 * ID cards and tickets are only given out once what they cost has been paid. Registrations that never needed
 * a payment (status "none"), or were let through by an administrator ("waived"), are not held back.
 */
export function assertDocumentsUnlocked(registration: { paymentStatus: string; documentsInPerson?: boolean }) {
  if (registration.documentsInPerson) {
    throw AppError.paymentRequired("You chose to buy this in person. You can collect it at the program.");
  }
  if (registration.paymentStatus === "pending" || registration.paymentStatus === "review" || registration.paymentStatus === "refunded") {
    throw AppError.paymentRequired("This becomes available once the payment is complete.");
  }
}
