import * as React from "react";
import { useLocation } from "react-router-dom";

export const SITE_NAME = "NTSOne";
const DEFAULT_TITLE = `${SITE_NAME} | Registrations, voting polls, orders and invoices`;
const DEFAULT_DESCRIPTION =
  "Build registration forms, run voting polls, take orders, send invoices and receipts, and issue ID cards and tickets from one secure platform.";

export interface PageMeta {
  /** The page's own title; the site name is added after it. */
  title?: string;
  description?: string;
  /** Lets search engines list the page. Signed-in and personal pages stay unlisted. */
  index?: boolean;
}

function setMeta(id: string, attribute: "content" | "href", value: string) {
  document.getElementById(id)?.setAttribute(attribute, value);
}

function apply({ title, description, index }: PageMeta, path: string) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const text = description?.trim() || DEFAULT_DESCRIPTION;
  const url = `${window.location.origin}${path}`;
  document.title = fullTitle;
  setMeta("description-meta", "content", text);
  setMeta("robots-meta", "content", index ? "index, follow" : "noindex, nofollow");
  setMeta("canonical-link", "href", url);
  setMeta("og-title", "content", title ?? SITE_NAME);
  setMeta("og-description", "content", text);
  setMeta("og-url", "content", url);
  setMeta("twitter-title", "content", title ?? SITE_NAME);
  setMeta("twitter-description", "content", text);
}

/**
 * Sets the page's title, description, canonical link, link-preview tags, and whether search
 * engines may list it. Leaving the page puts back the defaults (unlisted).
 */
export function usePageMeta(meta: PageMeta) {
  const { pathname } = useLocation();
  const { title, description, index } = meta;
  React.useEffect(() => {
    apply({ title, description, index }, pathname);
    return () => apply({}, pathname);
  }, [title, description, index, pathname]);
}
