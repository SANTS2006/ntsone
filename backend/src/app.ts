import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { env, isProduction } from "./config/env.js";
import { pool } from "./db/client.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authenticate } from "./middleware/authenticate.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./modules/auth/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import { programRoutes } from "./modules/programs/routes.js";
import { formRoutes } from "./modules/forms/routes.js";
import { registrationRoutes } from "./modules/registrations/routes.js";
import { publicRoutes } from "./modules/public/routes.js";
import { feedbackRoutes, supportRoutes } from "./modules/support/routes.js";
import { seoRoutes } from "./modules/seo/routes.js";
import { pollRoutes } from "./modules/polls/routes.js";
import { maskSecretsInUrl } from "./lib/logRedact.js";
import { sharedWishlistRoutes, wishlistRoutes } from "./modules/wishlists/routes.js";
import { businessRoutes } from "./modules/businesses/routes.js";
import { accessRoutes } from "./modules/access/members.js";
import { voterRoutes } from "./modules/voters/routes.js";
import { indexHtmlFor } from "./modules/seo/indexHtml.js";
import { verificationRoutes } from "./modules/verifications/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { idCardRoutes } from "./modules/idcards/routes.js";
import { publicIdCardRoutes } from "./modules/idcards/publicRoutes.js";
import { analyticsRoutes } from "./modules/analytics/routes.js";
import { platformRoutes } from "./modules/platform/routes.js";
import { publicTicketRoutes, ticketRoutes } from "./modules/tickets/routes.js";
import { registerRequestAudit } from "./modules/audit/requestAudit.js";
import { fundsRoutes, programPaymentRoutes, publicPaymentRoutes, webhookRoutes } from "./modules/payments/routes.js";
import { pollPaymentRoutes } from "./modules/payments/pollPaymentRoutes.js";
import { bookkeepingRoutes } from "./modules/bookkeeping/routes.js";
import { diagnosticsRoutes } from "./modules/diagnostics/routes.js";
import { publicMaintenanceRoutes } from "./modules/maintenance/routes.js";


// Resolves to <repo>/frontend/dist from both src/ (tsx) and dist/ (built bundle).
const FRONTEND_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");

export function buildApp() {
  const app = Fastify({
    logger: isProduction
      ? {
          level: "info",
          // Never write credentials or session cookies to the logs.
          redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
          // Private links carry a token in the address; log the address without it.
          serializers: {
            req: (req) => ({ method: req.method, url: maskSecretsInUrl(req.url ?? ""), host: req.host, remoteAddress: req.ip, remotePort: req.socket?.remotePort }),
          },
        }
      : { level: "debug", transport: { target: "pino-pretty", options: { colorize: true } } },
    trustProxy: true,
    // Render's load balancer closes idle connections after 60s; keeping ours open a little longer
    // avoids 502s on reused connections.
    keepAliveTimeout: 65_000,
    connectionTimeout: 30_000,
    requestTimeout: 60_000,
    // JSON bodies are small; file uploads go straight to Cloudinary.
    bodyLimit: 1_048_576,
    // Reuse a well-formed id from the load balancer so one request can be followed across systems.
    requestIdHeader: false,
    genReqId: (request) => {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    },
    // The private links on success pages carry a signed token of about 200 characters; the default
    // limit of 100 makes such routes answer 404.
    routerOptions: { maxParamLength: 1000 },
  });

  // Every action in the system is written to the audit log (see modules/audit).
  registerRequestAudit(app);

  app.register(helmet, {
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Google's sign-in window reports back to this page; the default "same-origin" would cut that link.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    // The same server also serves the web app in production, so the CSP must
    // allow what the frontend loads: Cloudinary-hosted images and direct
    // browser-to-Cloudinary uploads.
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.googleusercontent.com"],
        connectSrc: ["'self'", "https://api.cloudinary.com", "https://accounts.google.com/gsi/"],
        // "Sign in with Google" on the voting pages loads Google's script, button frame, and styles.
        scriptSrc: ["'self'", "https://accounts.google.com/gsi/client"],
        frameSrc: ["'self'", "https://accounts.google.com/gsi/"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style", "https://fonts.googleapis.com"],
      },
    },
  });
  app.register(cors, { origin: env.APP_URL, credentials: true });
  app.register(cookie);
  app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // Page assets aren't worth rate limiting and would eat into the API budget.
    allowList: (request) => !request.url.startsWith("/api/"),
  });

  if (isProduction && existsSync(FRONTEND_DIST)) {
    app.register(fastifyStatic, {
      root: FRONTEND_DIST,
      wildcard: false,
      // The build writes .br/.gz copies of text files; send those to browsers that accept them.
      preCompressed: true,
      // Off so the plugin's default "max-age=0" doesn't override setHeaders below.
      cacheControl: false,
      setHeaders: (res, filePath) => {
        // Vite fingerprints everything under assets/, so it can be cached forever;
        // index.html must always be revalidated so new deploys are picked up.
        res.header(
          "Cache-Control",
          filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    });
    // Where Monime sends people back after they pay: /payment/<link>. Whatever way the browser arrives (a normal
    // page open, or a form post), it ends on the payment page. Declared as real routes so nothing can answer first.
    app.route({
      method: ["GET", "HEAD"],
      url: "/payment/*",
      handler: async (_request, reply) => reply.header("Cache-Control", "no-cache").sendFile("index.html"),
    });
    app.route({
      method: ["POST", "PUT", "PATCH", "DELETE"],
      url: "/payment/*",
      handler: async (request, reply) => reply.redirect(request.url, 303),
    });

    // A browser coming back from Monime may post a form; its contents are not needed, so accept it for this page only.
    app.addContentTypeParser("*", (request, payload, done) => {
      if (request.url.startsWith("/payment/")) {
        payload.resume();
        return done(null, undefined);
      }
      done(Object.assign(new Error("Unsupported media type"), { statusCode: 415 }));
    });

    // Client-side routes (/admin, /programs/:slug, ...) all boot from index.html.
    app.setNotFoundHandler(async (request, reply) => {
      // Some payment pages send people back with a POST. A page can only be opened with a GET, so turn it into one
      // (303 always becomes a GET) instead of showing a "route not found" message to someone who has just paid.
      if (request.method === "POST" && request.url.startsWith("/payment/")) return reply.redirect(request.url, 303);
      // A missing built file (an old page piece after a new version went live) must be a real 404. Answering with the
      // home page here made the browser fail with a confusing script-type error and left a blank screen.
      if (!request.url.startsWith("/api/") && (/^\/assets\//.test(request.url) || /\.(?:js|mjs|css|map|woff2?|png|jpe?g|webp|svg|ico|json|txt|xml)(?:\?|$)/i.test(request.url))) {
        return reply.status(404).header("Cache-Control", "no-store").type("text/plain").send("Not found");
      }
      if ((request.method === "GET" || request.method === "HEAD") && !request.url.startsWith("/api/")) {
        const html = await indexHtmlFor(FRONTEND_DIST, request.url, env.APP_URL);
        if (html) return reply.header("Cache-Control", "no-cache").type("text/html; charset=utf-8").send(html);
        return reply.sendFile("index.html");
      }
      // Kept in the server log so an unexpected address (or method) can be found quickly.
      request.log.warn({ method: request.method, url: request.url.split("?")[0]?.slice(0, 120) }, "Route not found");
      return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
    });
  }

  app.setErrorHandler(errorHandler);

  // Defence in depth against cross-site requests: in production a browser request that changes anything must come
  // from this app's own address. Requests with no Origin (Monime's notifications, health checks) are not browsers.
  const allowedOrigins = new Set([env.APP_URL, env.API_URL].map((u) => u.replace(/\/$/, "")));
  app.addHook("onRequest", async (request) => {
    // The payment page is opened by people coming back from Monime's own site, so it is not a cross-site risk.
    if (!isProduction || request.url.startsWith("/payment/") || request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin.replace(/\/$/, ""))) throw AppError.forbidden("This request came from another site.");
  });

  // Every response carries the request id, and a few extra browser protections.
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
    reply.header("permissions-policy", "camera=(self), microphone=(self), geolocation=(), payment=()");
    // Account and money data is never kept by a browser or a shared cache.
    if (request.url.startsWith("/api/") && !reply.getHeader("cache-control")) reply.header("cache-control", "no-store");
  });

  // Liveness: the process is up (the load balancer restarts it if this stops answering).
  app.get("/health", async () => ({ success: true, data: { status: "ok" } }));
  // Readiness: it can reach the database. Use this to decide whether to send traffic, not to restart.
  app.get("/ready", async (_request, reply) => {
    try {
      await Promise.race([
        pool.query("select 1"),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error("database timeout")), 3_000)),
      ]);
      return { success: true, data: { status: "ready" } };
    } catch {
      return reply.status(503).send({ success: false, error: { code: "NOT_READY", message: "Database unavailable" } });
    }
  });
  app.register(seoRoutes);

  // Every non-public, non-auth route requires a valid access token.
  app.register(
    async (protectedApp) => {
      protectedApp.addHook("preHandler", authenticate);
      // Unverified accounts can only reach /api/auth/* (registered outside this
      // block) until they confirm their email address.
      protectedApp.addHook("preHandler", async (request) => {
        if (request.user && !request.user.emailVerified) throw AppError.emailNotVerified();
      });
      protectedApp.register(userRoutes, { prefix: "/users" });
      protectedApp.register(programRoutes, { prefix: "/programs" });
      protectedApp.register(pollRoutes, { prefix: "/polls" });
      protectedApp.register(pollPaymentRoutes, { prefix: "/polls" });
      protectedApp.register(bookkeepingRoutes, { prefix: "/businesses" });
      protectedApp.register(businessRoutes, { prefix: "/businesses" });
      // Who has access to a program, poll or business, and giving access to others.
      protectedApp.register(wishlistRoutes, { prefix: "/wishlists" });
      protectedApp.register(accessRoutes);
      protectedApp.register(formRoutes, { prefix: "/programs" });
      protectedApp.register(registrationRoutes, { prefix: "/programs" });
      protectedApp.register(idCardRoutes, { prefix: "/programs" });
      protectedApp.register(ticketRoutes, { prefix: "/programs" });
      protectedApp.register(verificationRoutes, { prefix: "/programs" });
      protectedApp.register(feedbackRoutes, { prefix: "/support" });
      protectedApp.register(analyticsRoutes, { prefix: "/programs" });
      protectedApp.register(dashboardRoutes, { prefix: "/dashboard" });
      protectedApp.register(auditRoutes, { prefix: "/audit-logs" });
      protectedApp.register(platformRoutes, { prefix: "/platform" });
      protectedApp.register(programPaymentRoutes, { prefix: "/programs" });
      protectedApp.register(fundsRoutes, { prefix: "/funds" });
    },
    { prefix: "/api" },
  );

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(publicRoutes, { prefix: "/api/public" });
  app.register(publicIdCardRoutes, { prefix: "/api/public" });
  app.register(publicTicketRoutes, { prefix: "/api/public" });
  app.register(supportRoutes, { prefix: "/api/public" });
  app.register(publicPaymentRoutes, { prefix: "/api/public" });
  app.register(publicMaintenanceRoutes, { prefix: "/api/public" });
  app.register(diagnosticsRoutes, { prefix: "/api/public" });
  // Shared wish lists: no account, the private link is the only credential.
  app.register(sharedWishlistRoutes, { prefix: "/api/public/wish" });
  // Monime's payment notifications: no login, protected by signature checks and by always confirming with Monime.
  app.register(webhookRoutes, { prefix: "/api/webhooks" });
  // Voters have their own sign-in, separate from staff accounts.
  app.register(voterRoutes, { prefix: "/api/voter" });

  return app;
}
