import type { QueryKey } from "@tanstack/react-query";

/** How often lists and tables quietly check for new data while the page is open and visible. */
export const LIVE_REFRESH_MS = 20_000;

// Lists, tables and numbers that change while people use the system (new registrations, votes, orders, messages...).
const LIVE_ROOTS = new Set([
  "registrations",
  "audit",
  "books",
  "platform-fund",
  "funds",
  "verifications",
  "dashboard-overview",
  "dashboard-analytics-trend",
  "dashboard-insights",
  "dashboard-modules",
  "inbox",
  "users",
  "businesses",
  "business-cards",
  "business-docs",
  "business-analytics",
  "platform-tenants",
  "polls",
  "programs",
  "analytics",
  "payments",
  "funds",
  "platform-payments",
  "platform-backups",
  "wishlists",
  "contributions",
]);

// Single items someone may be editing, and one-off lookups, are never refreshed behind their back.
const NOT_LIVE_PARTS = new Set(["detail", "memberships", "ballot", "share", "all-for-select"]);

/** True for queries that feed a table or list and should pick up new data on their own. */
export function isLiveQuery(key: QueryKey): boolean {
  return typeof key[0] === "string" && LIVE_ROOTS.has(key[0]) && !key.some((part) => typeof part === "string" && NOT_LIVE_PARTS.has(part));
}
