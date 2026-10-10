# Reliability, scaling and the blank-page fix

## 1. The blank-page problem: root cause and fix

### What was happening
Pages went blank until the browser was refreshed. There was **no safety net anywhere in the web app**: no error boundary, so any error while a page loaded or drew **removed the whole screen** (React unmounts everything when an error is not caught). Three real triggers fed it:

| # | Trigger | Why it blanked | Where |
|---|---|---|---|
| 1 | **A new version was deployed while a tab was open.** The open tab still asked for page files (`/assets/Page-abc123.js`) that no longer existed. The server answered those missing files with the **home page and status 200** (the single-page-app fallback), so the browser tried to run HTML as a script, the lazy import failed, and the uncaught error blanked the screen. A refresh loaded the new `index.html` and the new file names, so it "fixed itself". | `backend/src/app.ts` not-found handler; all 60+ lazy pages in `frontend/src/app/AppRoutes.tsx` |
| 2 | **A page crashed on data it did not expect** (an API answered with an error or an unexpected shape and the page read `.length` of something missing). I reproduced it: with the programs API returning an unexpected body, the Programs page threw and the whole app went white. | any page; no boundary |
| 3 | **Session check during start-up.** If the server was waking up or briefly unreachable (Render's free plan sleeps), the check "am I signed in?" failed and the app treated it as "signed out", sending a signed-in person to the sign-in page, or showing a half-initialised screen. A refresh after the server woke up "fixed" it. Also the app start-up and the API client each used the rotating refresh cookie separately, so two refreshes could race. | `frontend/src/app/AuthContext.tsx`, `lib/api.ts` |

Hosting rewrites were **not** the cause: the server already serves the app for every page address, and `index.html` is `no-cache` while built files are cached for a year (correct). Direct visits, refreshes and new tabs work (checked by an automated test, section 6).

### What was changed
- **Error boundaries.** One around the whole app, and one around the page area of every layout (admin, public, bare, business, bookkeeping, poll...). A crash now shows *"Something went wrong while loading this page"* with **Try again**, keeps the menu on screen, clears itself when the person opens another page, and never shows technical details. (`components/ErrorBoundary.tsx`, `components/PageLoading.tsx`)
- **Stale-version recovery.** The server now answers a missing built file with a real **404** (never the home page). The web app recognises the failed download, retries the import once, and if it still fails **reloads once** to pick up the new version; a one-minute guard prevents any reload loop, after which a clear "A new version is available - Reload" screen shows. (`lib/chunkRecovery.ts`, `app.ts`)
- **Global error handling.** Errors in event handlers, unhandled promise rejections and failed downloads are reported (short, sanitised, rate-limited, to the server log only: `POST /api/public/client-errors`). (`lib/clientErrors.ts`, `modules/diagnostics`)
- **Authentication states.** The app now distinguishes *starting*, *signed in*, *signed out* and *could not check*. If the server cannot be reached the person sees "We could not check your session" with **Try again**, not the sign-in page. Protected pages never draw before the check ends. (`AuthContext.tsx`, `ProtectedRoute.tsx`)
- **One token refresh at a time.** Start-up and every API call share a single refresh request; if several requests expire together only one refresh is made and all are retried. If the refresh is refused, the app is told once and shows the sign-in page; if the server cannot be reached it does **not** log the person out. (`lib/api.ts`)
- **API client.** 30-second timeout on requests, a clear error for a dropped connection or a timeout, safe handling of non-JSON and broken JSON replies, request cancellation supported, friendly text for server errors.
- **Loading failures are visible.** Any page whose data fails to load the first time shows a message with **Try again** (one message for a burst of failures); background refreshes that fail quietly keep the data already on screen. Failed requests retry up to twice for network and server errors, never for 4xx. The dashboard has its own error card. (`lib/queryClient.ts`)

### Routes affected
Every lazy-loaded page (all of them except the home page) for trigger 1; any page that reads API data for trigger 2 (found in 21 files that had no error handling: dashboard, audit log, analytics, payments pages, bookkeeping pages, poll voters...); every protected route for trigger 3.

## 2. Navigation test results
Checked in the browser (development server with a faked API, because the real backend must not run against the live database) and by automated tests:

| Check | Result |
|---|---|
| Server unreachable at start | "Could not check your session" screen with Try again; after the server is back, one click signs in |
| Page crashes on unexpected data | Error screen inside the layout, menu usable; opening another page recovers |
| Direct address, refresh, new tab (production build, real server code) | Page address returns the app (200, no-cache); missing built file returns 404; API 404 stays JSON |
| Three requests expiring together | One refresh, three retries (test) |
| Refresh refused | One notification, token cleared, no retry loop (test) |
| Refresh while the server is down | Not treated as signed out (test) |
| Slow API | Gives up after 30 s with a clear message (test) |
| Failed page download | Retried once, then one guarded reload, then an explanation (tests) |
| Backup page: status, history, three-step restore dialog and live progress | Checked in the browser with a faked API |
| Back and Forward buttons | Not tested separately; the app uses ordinary React Router history |

Not done: a full click-through of every screen with real data (no safe test database exists, see section 7).

## 3. Scaling and many users at once
What already existed and was **reviewed and kept**:
- Pooled database connections (`DB_POOL_MAX`), reused, released in all paths; connection and now statement timeouts.
- Money, votes, registration numbers and counters protected in the **database**: transactions, advisory locks per organization, unique indexes (one vote per person per position, one payment per paid vote, ledger entries unique per payment/payout/refund), idempotency keys for submissions and payments.
- Background workers safe on many instances (`FOR UPDATE SKIP LOCKED`, unique indexes).
- The shared paging helper limits list pages to 100 rows (individual list endpoints were not re-audited one by one in this change); request body limit 1 MB; timeouts; rate limits; request ids; structured JSON logs without secrets; graceful shutdown on SIGTERM.

**Added in this change:** database statement timeout (60 s) and idle-in-transaction timeout (5 min) per connection; start-up database check with retries (a bad `DATABASE_URL` fails the deploy loudly); `requestId` on every error reply; backup/restore guarded by database unique indexes.

### Multi-instance review
| Thing | Shared across instances? |
|---|---|
| Sessions, refresh tokens, payments, votes, outbox, backups, restores | Yes, in the database |
| Daily backup, restores, email outbox, payment reconciliation | Yes: claimed in the database, never done twice |
| **Global API rate limit** and **per-account login throttle** | **No: each instance counts separately.** With N instances the effective limit is up to N times higher. A shared store (for example Redis) would fix it; none is installed, so this is a known limit. |
| Small read caches (`ttlCache`) | Per instance (they only hold brief copies; harmless) |
| Audit write queue | Per instance, flushed every second and on shutdown |
| Temporary files | Backup and restore use a private temp folder per job, removed afterwards |
| WebSockets | None used |

Single points of failure: one Neon database (mitigated by backups and Neon point-in-time restore), one Render web service on the free plan (sleeps; one instance), Cloudinary, Brevo, Monime (each degrades gracefully: emails queue, payments are reconciled later).

## 4. Concurrency review
Audited areas and how each is protected (see ARCHITECTURE for the money ledger): registrations (unique registration numbers via counters under lock, duplicate email rule, idempotency key), payments (one completion path under a row lock, unique ledger rows), refunds (organization advisory lock, proportional fee, unique refund entries), withdrawals (daily limit under lock, idempotent send), paid votes (unique `payment_id`, one-vote-per-email key, weights), counters (locked increment), status changes (history rows, no lost updates because changes are single `UPDATE`s), roles and settings (server-side checks on every request). **No new race was found that needed a code change.** Edit screens use last-write-wins for ordinary settings (no version column); this is acceptable for a single organization admin team but is a known limit for simultaneous edits of the same record.

## 5. Migrations
Migrations are additive SQL run at the end of the Render build. Migration `0030` only adds two tables, indexes and constraints (nothing destructive). Rules to keep: add columns as nullable or with defaults; never drop or rename in the same release that stops using the old name; take a manual backup before any structure change; **a backup can only be restored into the same structure**, so back up again right after a structure change.

## 6. Tests
| Suite | Command | Result |
|---|---|---|
| Backend unit (no database, no network) | `npm run test:unit --workspace backend` | **410 passed** (adds: encryption, tampering, retention rules, AWS signing test vector, local storage, schedule, restore confirmation, dump format, backup and restore on a real in-memory Postgres including rollback and the audit log, production serving of the built app) |
| Frontend unit | `npm test --workspace frontend` | **26 passed** (token refresh sharing, session loss, timeouts, cancellation, bad replies, chunk recovery and loop guard, error screen and reset) |
| Type checks and build | `tsc --noEmit` (backend), `npm run build` (frontend) | clean |
| Backend integration (needs a database) | `npm test --workspace backend` | **not run**: the project's database is production data |

The backup and restore SQL was tested against **PGlite** (a real Postgres engine running in memory), including foreign keys, a 16-digit number, the audit trigger, rollback on a structure change, and rollback on a count mismatch. It was **not** tested against Neon itself or a real S3 bucket.

## 7. Load testing
`loadtest/` contains k6 scripts and a local benchmark. They could **not** be run for this report: they need a backend and a database, and the only database available is production. Run them against a separate Neon branch (a copy) before relying on numbers. Suggested first run: 50 virtual users on login, a public registration page and a registration submission for 5 minutes; watch Render CPU/memory and Neon connections (should stay under `instances x DB_POOL_MAX`).

## 8. Remaining risks (honest list)
1. **Backup and restore have not run against the real Neon database or a real bucket.** First production use should be: set the settings, back up, verify, then **test a restore into a copy of the database** before trusting it.
2. The restore needs the database role to allow `session_replication_role`; if Neon refuses, it stops safely and says so.
3. Rate limits and the login throttle are per instance (section 3).
4. Free-plan hosting sleeps and has one instance: brief outages and cold starts are expected. Use a paid always-on plan for real traffic.
5. Backups are daily (RPO up to 24 h). Keep Neon point-in-time restore on for finer recovery.
6. The encryption key is a single point of failure: keep a separate safe copy.
7. Per-page empty/error states: pages now fall back to the shared error screen and the "Try again" message, but many screens still show a plain "No results" when a request fails rather than their own tailored message.
8. No end-to-end browser test suite and no load test results yet.
9. No ESLint configuration exists in the repository (`npm run lint` cannot run); type checking is the static check in use.
10. A lawyer should review the Terms and Privacy pages.

## 9. Production deployment checklist
1. Create a **private** S3-compatible bucket (Cloudflare R2 / Backblaze B2 / S3) and a key limited to it.
2. In Render set: `BACKUP_STORAGE=s3`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_KEY` (32+ random characters; store a separate copy).
3. Deploy; read the build log: migration `0030` must apply.
4. Sign in as super admin, open **Backup & Recovery**: no red notice.
5. **Back up now**; wait for **Valid**; press **Verify**.
6. **Restore test** into a copy of the database (a Neon branch with the same migrations), not production.
7. Confirm the daily backup appeared the next day at the scheduled hour and that retention settings are as wanted.
8. Confirm Neon point-in-time restore is enabled.
9. Keep `DB_POOL_MAX x instances` below the Neon connection limit.
10. Move off the free plan for always-on service; add uptime monitoring on `/health` and `/ready`.
11. Watch the Render log for "Browser error report" lines after the first days to find pages that still crash.
12. Run the load tests against a copy of production data and note the results.
