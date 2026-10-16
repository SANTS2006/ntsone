// The temporary password a teammate is given when invited: the first letters of the organization's name, then "@" and the
// current year (for example "NTS Digital Solutions" in 2026 gives "NDS@2026"). It is only good for a few days and must be
// replaced with a password the person chooses before they can do anything else.

/** How many days an invited person has to use their temporary password. */
export const TEMPORARY_PASSWORD_DAYS = 7;

const asciiWords = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

/** The first letters of each word of the name (up to six), in capitals. A one-word name uses its first four letters instead. */
export function organizationPrefix(organizationName: string): string {
  const words = asciiWords(organizationName);
  const initials = words
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 6);
  if (initials.length >= 3) return initials;
  const firstWord = words[0];
  if (!firstWord) return "Welcome";
  const letters = firstWord.slice(0, 4);
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
}

export function defaultTemporaryPassword(organizationName: string, now = new Date()): string {
  return `${organizationPrefix(organizationName)}@${now.getUTCFullYear()}`;
}

export const temporaryPasswordExpiry = (now = new Date()) => new Date(now.getTime() + TEMPORARY_PASSWORD_DAYS * 86_400_000);
