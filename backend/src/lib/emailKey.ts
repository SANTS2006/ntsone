/** The one address behind an email, so "a.b+vote2@gmail.com" and "ab@gmail.com" count as the same person. */
export function canonicalEmail(email: string): string {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  let local = rawLocal.split("+")[0]!;
  let domain = rawDomain;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}
