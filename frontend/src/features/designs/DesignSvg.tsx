import * as React from "react";
import { cn } from "@/lib/utils";

const SAFE_URL = /^(https:\/\/|data:image\/(png|jpe?g|gif|webp);base64,|#)/i;
const BLOCKED_ELEMENTS = /<(script|foreignObject|iframe|object|embed)[\s\S]*?<\/\1>/gi;
const EVENT_ATTRIBUTES = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_LINKS = /(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi;

/**
 * Removes anything in a piece of SVG that could run code or load something unexpected: scripts, embedded pages and
 * objects, event handlers (onclick...), and links that are not https pictures, in-page references or inline images.
 * The shared renderer already escapes every value it draws; this is a second lock on the same door.
 */
export function sanitizeSvg(svg: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  // Markup the strict parser cannot read is cleaned by pattern instead, so a design still shows.
  if (doc.querySelector("parsererror")) return svg.replace(BLOCKED_ELEMENTS, "").replace(EVENT_ATTRIBUTES, "").replace(SCRIPT_LINKS, "");
  doc.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name === "xlink:href" || name === "src") && !SAFE_URL.test(attr.value.trim())) el.removeAttribute(attr.name);
    }
  });
  return new XMLSerializer().serializeToString(doc.documentElement);
}

/**
 * Shows markup from the shared design renderer, which escapes every value it draws,
 * so the same SVG that becomes the PDF can be previewed inline.
 */
export function DesignSvg({ svg, label, className }: { svg: string; label: string; className?: string }) {
  const clean = React.useMemo(() => sanitizeSvg(svg), [svg]);
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("overflow-hidden [&>svg]:block [&>svg]:h-auto [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
