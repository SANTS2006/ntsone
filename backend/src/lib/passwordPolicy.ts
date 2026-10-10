import { z } from "zod";

// Passwords people actually choose, and that attackers try first. Not a complete list, but it stops the worst ones.
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "123456789", "1234567890", "12345678910", "qwertyuiop", "qwerty123",
  "iloveyou123", "letmein123", "welcome123", "admin12345", "administrator", "abc123456", "11111111111", "00000000000",
  "sierraleone", "freetown123", "changeme123", "p@ssw0rd123",
]);

/** A new password: at least 10 characters, with a letter and a number, and not one of the commonest passwords. */
export const strongPassword = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use at least one letter and one number")
  .refine((v) => !COMMON.has(v.toLowerCase()), "That password is too common. Choose another")
  .refine((v) => !/^(.)\1+$/.test(v), "Don't repeat one character");
