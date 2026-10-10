/** Company and contact details shown on the website, legal pages, and forms. */
export const COMPANY_NAME = "NTS Digital Solutions";
export const PRODUCT_NAME = "NTSOne";
export const SUPPORT_EMAIL = "hello@ntsdigitalsolutions.com";
export const SUPPORT_PHONE = "+232 31 034 604";
export const SUPPORT_PHONE_LINK = "tel:+23231034604";
export const COMPANY_WEBSITE = "https://ntsdigitalsolutions.com";
export const COUNTRY = "Sierra Leone";

/** Shown as "Last updated" on the legal pages; change it whenever their text changes. */
export const LEGAL_LAST_UPDATED = "26 September 2026";

export const LEGAL_LINKS = [
  { to: "/terms", label: "Terms of Service" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/cookies", label: "Cookie Policy" },
  { to: "/acceptable-use", label: "Acceptable Use Policy" },
] as const;
