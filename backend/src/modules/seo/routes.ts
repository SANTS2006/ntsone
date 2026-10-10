import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import * as programsRepo from "../programs/repository.js";

const STATIC_PAGES = ["/", "/register", "/login", "/contact", "/report", "/terms", "/privacy", "/cookies", "/acceptable-use"];

function siteUrl(path: string) {
  return `${env.APP_URL.replace(/\/+$/, "")}${path}`;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** robots.txt and sitemap.xml for search engines, built from the site's own address. */
export async function seoRoutes(app: FastifyInstance) {
  app.get("/robots.txt", async (_request, reply) => {
    const body = [
      "User-agent: *",
      "Allow: /",
      // Signed-in areas, personal confirmation pages, and the API aren't for search results.
      "Disallow: /admin",
      "Disallow: /api/",
      "Disallow: /verify/",
      "Disallow: /verify-email",
      "Disallow: /reset-password",
      "Disallow: /programs/*/confirmation",
      "Disallow: /vote/",
      "Disallow: /wish/",
      "",
      `Sitemap: ${siteUrl("/sitemap.xml")}`,
      "",
    ].join("\n");
    return reply.header("Content-Type", "text/plain; charset=utf-8").header("Cache-Control", "public, max-age=3600").send(body);
  });

  app.get("/sitemap.xml", async (request, reply) => {
    let programs: { slug: string; updatedAt: Date; kind: string }[] = [];
    try {
      programs = await programsRepo.listPublishedProgramSlugs();
    } catch (err) {
      // The static pages are still worth listing if the database is briefly unavailable.
      request.log.warn({ err }, "sitemap: could not list programs");
    }
    const urls = [
      ...STATIC_PAGES.map((path) => ({ loc: siteUrl(path), lastmod: undefined as string | undefined, priority: path === "/" ? "1.0" : "0.5" })),
      ...programs.filter((p) => p.kind === "order_form").map((p) => ({
        loc: siteUrl(`/order/${encodeURIComponent(p.slug)}`),
        lastmod: p.updatedAt.toISOString(),
        priority: "0.7",
      })),
      ...programs.filter((p) => p.kind !== "order_form").flatMap((p) => [
        { loc: siteUrl(`/programs/${encodeURIComponent(p.slug)}`), lastmod: p.updatedAt.toISOString(), priority: "0.8" },
        { loc: siteUrl(`/programs/${encodeURIComponent(p.slug)}/register`), lastmod: p.updatedAt.toISOString(), priority: "0.7" },
      ]),
    ];
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`,
        )
        .join("\n") +
      `\n</urlset>\n`;
    return reply.header("Content-Type", "application/xml; charset=utf-8").header("Cache-Control", "public, max-age=3600").send(body);
  });
}
