# Security and scalability audit

Honest scope: nothing here claims the system is "100% secure" or sized for a million users. The live database was never touched. A real database load test has NOT been run; run `loadtest/k6/public-flow.js` against a staging copy.

## Verified by testing (no database involved)
- 183 unit tests pass (`npm run test:unit` in `backend`): cache stampede protection, concurrency limiter, login throttle, one-person-one-vote email rule, document math/escaping, and a sweep of every protected API route proving anonymous and forged-token requests get 401.
- Request-id sanitising, security headers, no internal details leaked in errors, oversized bodies refused with 413, `/health` and `/ready` behaviour.
- Local HTTP-layer benchmark (`loadtest/local-bench.ts`): HTTP stack, static assets, PDF engine only.

## Architecturally capable (not load-tested)
- Stateless web instances behind Render's balancer; Postgres is the single source of truth.
- Email outbox with SKIP LOCKED safe for several instances; idempotency keys; DB-enforced unique registration per email.
- Per-instance in-memory rate limit, login throttle and caches: with more than one instance, limits apply per instance (move to a shared store only if that becomes a real problem).

## Findings and fixes
| Severity | Problem | Fix |
|---|---|---|
| HIGH | Duplicate registrations possible under simultaneous submits | Partial unique index + idempotency key on submit |
| HIGH | Emails sent inline; provider outage slowed or lost mail | Durable Postgres outbox with retry/backoff |
| HIGH | Password guessing per account | Per-account throttle, constant-time dummy hash |
| HIGH | Arbitrary image URLs accepted (SSRF/tracking risk) | Only our own Cloudinary URLs accepted |
| MEDIUM | Uploads unrestricted by format | Signed `allowed_formats` |
| MEDIUM | Unbounded PDF/Excel generation | Concurrency limiter with queue cap |
| MEDIUM | Missing indexes (token hashes, email lookup, audit) | Migration 0019 |
| MEDIUM | Malformed `x-request-id` echoed; malformed bodies gave 500 | Validated ids; 4xx/413 mapped properly |
| MEDIUM | No graceful shutdown / readiness | SIGTERM drain, `/ready`, pool limits and timeouts |
| LOW | Expired tokens/codes never purged | Maintenance job every 6h |
| LOW | Secrets could reach logs | Authorization/cookie headers redacted |
Remaining dependency advisories: exceljs/uuid (moderate), not fixed.

## Deployment
Migration 0019 is additive and runs on Render deploy. New env var: `DB_POOL_MAX` (default 10). Set Brevo, Cloudinary and JWT secrets only in Render. Enable Neon point-in-time restore and test a restore periodically. Put Cloudflare in front for WAF/bot protection if abuse appears.

## Remaining risks
Free-tier Render sleeps and has one instance; Brevo free plan ~300 emails/day; no real-DB load numbers yet; rate-limit state is per instance.
