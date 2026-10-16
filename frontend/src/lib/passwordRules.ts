// The same rules the server applies to a new password (backend/src/lib/passwordPolicy.ts), so a form can say what is
// wrong BEFORE it sends anything. If these two ever differ, the server answers with the rule it enforces.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`;

// Passwords people actually choose, and that attackers try first.
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "123456789", "1234567890", "12345678910", "qwertyuiop", "qwerty123",
  "iloveyou123", "letmein123", "welcome123", "admin12345", "administrator", "abc123456", "11111111111", "00000000000",
  "sierraleone", "freetown123", "changeme123", "p@ssw0rd123",
]);

/** What is wrong with a new password, in plain words, or an empty string when it is fine. */
export function passwordProblem(password: string): string {
  if (!password) return "Please enter a new password";
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > 128) return "Use at most 128 characters";
  if (!/[A-Za-z]/.test(password)) return "Include at least one letter";
  if (!/\d/.test(password)) return "Include at least one number";
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Choose another";
  if (/^(.)\1+$/.test(password)) return "Don't repeat one character";
  return "";
}
