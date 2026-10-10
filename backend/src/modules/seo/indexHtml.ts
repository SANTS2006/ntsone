import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { businesses } from "../../db/schema/index.js";
import * as pollsRepo from "../polls/repository.js";
import * as programsRepo from "../programs/repository.js";

let template: string | null = null;

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Replaces the value of the attribute `attr` on the tag carrying `id` in index.html. */
function setById(html: string, id: string, attr: "content" | "href", value: string) {
  return html.replace(new RegExp(`(id="${id}"[^>]*?${attr}=")[^"]*(")`), `$1${escapeAttr(value)}$2`);
}

function setByProperty(html: string, property: string, value: string) {
  return html.replace(new RegExp(`(property="${property}"[^>]*?content=")[^"]*(")`), `$1${escapeAttr(value)}$2`);
}

const PROGRAM_PAGE = /^\/programs\/([^/?#]+)(\/register)?\/?(?:[?#].*)?$/;
const POLL_PAGE = /^\/vote\/([^/?#]+)(?:\/[^?#]*)?(?:[?#].*)?$/;
const ORDER_PAGE = /^\/order\/([^/?#]+)\/?(?:[?#].*)?$/;

const trimUrl = (siteUrl: string) => siteUrl.replace(/\/+$/, "");

/**
 * index.html for a client-side route. Shared program and poll links get their own title,
 * description, and picture in the page itself, because WhatsApp, Facebook, and other link
 * previews don't run JavaScript.
 */
export async function indexHtmlFor(distDir: string, url: string, siteUrl: string): Promise<string | null> {
  const programMatch = PROGRAM_PAGE.exec(url);
  const pollMatch = programMatch ? null : POLL_PAGE.exec(url);
  const orderMatch = programMatch || pollMatch ? null : ORDER_PAGE.exec(url);
  if (!programMatch && !pollMatch && !orderMatch) return null;
  template ??= readFileSync(path.join(distDir, "index.html"), "utf8");

  if (orderMatch) {
    const form = await programsRepo.findProgramBySlug(decodeURIComponent(orderMatch[1]!)).catch(() => null);
    if (!form || form.kind !== "order_form" || form.status !== "published" || !form.businessId) return null;
    const [business] = await db.select().from(businesses).where(eq(businesses.id, form.businessId)).limit(1);
    if (!business) return null;
    return pageIndexHtml(template, {
      title: `Order from ${business.name}`,
      description: (business.description ?? `Place your order with ${business.name} online.`).replace(/\s+/g, " ").slice(0, 200),
      url: `${trimUrl(siteUrl)}/order/${encodeURIComponent(form.slug)}`,
      image: business.logoUrl,
      imageAlt: business.name,
      index: true,
    });
  }

  if (programMatch) {
    const program = await programsRepo.findProgramBySlug(decodeURIComponent(programMatch[1]!)).catch(() => null);
    if (!program || program.status !== "published") return null;
    return programIndexHtml(template, program, siteUrl, !!programMatch[2]);
  }

  const poll = await pollsRepo.findPollBySlug(decodeURIComponent(pollMatch![1]!)).catch(() => null);
  if (!poll) return null;
  return pageIndexHtml(template, {
    title: `Vote: ${poll.name}`,
    description: (poll.description ?? `Cast your vote in ${poll.name}.`).replace(/\s+/g, " ").slice(0, 200),
    url: `${trimUrl(siteUrl)}/vote/${encodeURIComponent(poll.slug)}`,
    image: poll.imageUrl,
    imageAlt: poll.name,
    // Polls are shared with their own voters, not listed in search results.
    index: false,
  });
}

type ProgramMeta = Pick<programsRepo.ProgramRow, "name" | "slug" | "shortDescription" | "description" | "thumbnailUrl">;

export function programIndexHtml(template: string, program: ProgramMeta, siteUrl: string, register: boolean): string {
  return pageIndexHtml(template, {
    title: register ? `Register for ${program.name}` : program.name,
    description: (program.shortDescription ?? program.description ?? `Register for ${program.name} online.`).replace(/\s+/g, " ").slice(0, 200),
    url: `${trimUrl(siteUrl)}/programs/${encodeURIComponent(program.slug)}${register ? "/register" : ""}`,
    image: program.thumbnailUrl,
    imageAlt: program.name,
    index: true,
  });
}

interface PageMeta {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  imageAlt: string;
  index: boolean;
}

function pageIndexHtml(template: string, page: PageMeta): string {
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(`${page.title} | NTSOne`)}</title>`);
  html = setById(html, "robots-meta", "content", page.index ? "index, follow" : "noindex, nofollow");
  html = setById(html, "description-meta", "content", page.description);
  html = setById(html, "canonical-link", "href", page.url);
  html = setById(html, "og-title", "content", page.title);
  html = setById(html, "og-description", "content", page.description);
  html = setById(html, "og-url", "content", page.url);
  html = setById(html, "twitter-title", "content", page.title);
  html = setById(html, "twitter-description", "content", page.description);
  if (page.image) {
    html = setByProperty(html, "og:image", page.image);
    html = setByProperty(html, "og:image:alt", page.imageAlt);
    html = html.replace(/(name="twitter:image"[^>]*?content=")[^"]*(")/, `$1${escapeAttr(page.image)}$2`);
    // The site's own picture sizes no longer apply.
    html = html.replace(/\s*<meta property="og:image:(width|height)"[^>]*>/g, "");
  }
  return html;
}
