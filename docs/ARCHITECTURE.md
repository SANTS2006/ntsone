# Architecture

## 1. Stack
- **Front end**: React 19, Vite, TypeScript, React Router, TanStack Query (data and automatic refresh), TanStack Table, React Hook Form + Zod, Tailwind CSS, Radix UI components, @dnd-kit (form builder), Recharts (charts). Shared SVG document designs live in a package aliased as `@designs`.
- **Back end**: Node 22, TypeScript, Fastify 5 (helmet, cors, cookie, rate-limit, static), Zod validation, Drizzle ORM, JWT access and refresh tokens, Argon2id password hashing.
- **Database**: PostgreSQL on Neon through the serverless WebSocket pool, so real multi-statement transactions are available.
- **Services**: Cloudinary (files and voice recordings, direct signed uploads), Brevo (email, with a durable outbox), Monime (payments and payouts), Google Identity (optional voter sign-in).
- **Hosting**: one Render web service serves the API (`/api/*`) and the built React app, so cookies and API calls share one origin.

## 2. Repository layout
```
/backend    Fastify API. src/modules/<domain>/ holds routes, controller, service, repository for each domain
  src/config        environment parsing (env.ts)
  src/db            Drizzle client, schema/*.ts, migrate, seed, createSuperAdmin
  src/lib           shared helpers: money, errors, pagination, dateRange, tableExport, limiter, loginThrottle, ttlCache...
  src/middleware    authenticate, authorize, errorHandler
  src/modules       access, analytics, audit, auth, bookkeeping, businesses, dashboard, email, forms, idcards,
                    notifications, payments, platform, polls, programs, public, registrations, seo, support,
                    tickets, uploads, users, verifications, voters
  drizzle/          SQL migrations 0000-0028 (plus meta snapshots)
  tests/            integration tests (need a database) and tests/unit (no database, no network)
/frontend   Vite SPA. src/features/<domain>, src/components (shared UI), src/lib, src/app (routes, layouts, auth)
/docs       this documentation
/loadtest   k6 and local benchmark scripts
render.yaml Render blueprint
```

## 3. How a request flows
1. **onRequest hooks**: request id, cross-site check (production, state-changing requests must come from this app's own address; `/payment/*` is exempt), and the audit context is opened.
2. **Authentication** (`middleware/authenticate`): protected routes (`/api/*` except the public prefixes) require a valid access token (Bearer). Voters use a separate cookie and key.
3. **Authorization**: `requireRole`, `requireProgramAccess`, `requirePollAccess`, `requireBusinessAccess` decide per item. Super admin always passes; admins pass for their own account; others need a membership row.
4. **Validation**: every body, query and param is parsed with Zod; failures return 4xx without touching the database.
5. **Controller to service to repository**: business rules live in services, SQL in repositories or services using Drizzle.
6. **Response** in a single envelope `{ success, data | error }`. API responses carry `Cache-Control: no-store` unless a route sets its own.
7. **onResponse**: the audit hook writes the request record (and folds in named events the code recorded).

Static files and the SPA fallback are served by the same process in production. `/payment/*` has explicit GET and POST routes so a return from Monime always lands on the app.

## 4. Multi-tenancy and access
- Every program, poll and business belongs to a **tenant**. The tenant id is stored on child records that need it (payments, entries, loans, audit rows).
- Access is enforced in the service layer (not row-level security) through a single function per resource type (`assertProgramAccess`, `getPollRole`, `getBusinessRole`, and `listAccessible*Ids` for lists). Tests prove a scoped user cannot read or change another program's data even by swapping ids in the URL.
- The platform super admin has `tenantId = null` and sees everything.

## 5. Data model (tables by area)
| Area | Tables |
|---|---|
| Accounts | `tenants`, `users`, `refresh_tokens`, `email_verification_codes`, `password_reset_tokens`, `tenant_members` |
| Programs and forms | `programs`, `program_members`, `program_counters`, `forms` (one row per version), `form_sections`, `form_fields` |
| Registrations | `registrations` (answers in JSONB by field key; name, email, phone extracted to columns for search), `registration_files`, `registration_status_history`, `document_verifications` |
| Polls and voting | `polls`, `poll_positions`, `poll_candidates`, `poll_members`, `voter_accounts`, `voter_email_codes`, `poll_voters`, `poll_verified_voters`, `poll_votes` (with `weight` and a unique `payment_id`) |
| Businesses | `businesses`, `business_members`, `business_documents` (invoices, receipts, quotations), `business_cards` |
| Payments | `payments` (registration, order or vote payments; `refunded_minor`), `payment_events` (webhook ids), `wallet_entries` (append-only ledger; no tenant means the platform), `payout_accounts`, `payouts` (no tenant means the platform), `refunds` |
| Bookkeeping | `book_entries`, `book_entry_payments`, `book_loans`, `book_voice_notes` |
| Wish List | `wishlists`, `wish_items`, `wish_events`, `wishlist_shares` (private to the owner unless shared by signed private link; nothing deleted) |
| System | `system_settings` (maintenance), `audit_logs` (append-only, trigger-protected), `support_messages`, `email_outbox`, `idempotency_keys` |

Conventions: UUID keys; all money in whole minor units (`bigint`); soft delete (`deleted_at`) for programs, polls and businesses; CHECK constraints for money and status rules (`0027`, `0028`).

### Money ledger
An organization's balance is the sum of its `wallet_entries`. Kinds: `payment (+)`, `fee (-)`, `payout (-)`, `payout_reversal (+)`, `refund (-)`, `fee_refund (+)`, `refund_reversal (+)`, `fee_refund_reversal (-)`. The platform's ledger uses the same table with no tenant: `platform_fee (+)`, `platform_fee_refund (-)`, `payout`, `payout_reversal`, and reversals. Unique indexes on `(payment_id, kind)`, `(payout_id, kind)` and `(refund_id, kind)` make every entry safe to write twice.

## 6. Background work
| Job | Interval | What it does |
|---|---|---|
| Email outbox worker | continuous | Sends queued email with retries and back-off; safe across instances (`SKIP LOCKED`) |
| Payments worker | 30 s | Reconciles open payments with Monime, sends queued withdrawals and refunds, follows those in progress |
| Audit queue flush | 1 s and on shutdown | Writes audit rows in batches |
| Maintenance | 6 h | Purges expired tokens and codes |

Every worker runs on every instance; database locks and idempotency keys prevent duplicate sends.

## 7. Registration, payment and vote lifecycles

### Registration with payment
`submit` validates answers, saves the registration (status `submitted`, payment status `pending`), creates a `payments` row, opens a Monime checkout session (idempotency key = payment id) and returns the checkout address. The return page and the worker call `refreshPayment`, the only place a payment becomes `completed`: it asks Monime for the session and its payments and checks the reference, currency and **full** amount, then in one transaction marks it paid, credits the fund and the platform ledger, and flips the registration to `paid`.

### Refund
`requestRefund` (one transaction under the organization's advisory lock): checks, inserts `refunds`, writes the ledger entries, raises `refunded_minor`, and may set the registration to `refunded`. The worker sends the transfer (`createPayout` with key `refund-<id>`) and completes or reverses it.

### Paid vote
`createVotePayment` (server computes votes and total) then the same payment path; `redeemVotes` locks the payment row, checks voter, status, not used, not refunded, and inserts one weighted `poll_votes` row whose `payment_id` is unique.

## 8. API map
All paths start with `/api`.

| Prefix | Purpose | Access |
|---|---|---|
| `/auth/*` | register, login, refresh, logout, verify email, reset password, profile | public or own session |
| `/public/*` | public programs and forms, submissions, verification pages, payment status and retry, ID card and ticket downloads, contact and report forms | no account |
| `/voter/*` | voter sign-up, sign-in, polls, voting, paid voting | voter session |
| `/webhooks/monime` | Monime notifications (hints only) | Monime |
| `/users`, `/access` | team members and per-item access | admin |
| `/programs/*` | programs, forms, registrations, ID cards, tickets, verifications, analytics, payments, refunds | by program role |
| `/polls/*` | polls, ballots, results, voters, verified voters, paid-voting settings and payments | by poll role |
| `/businesses/*` | businesses, order forms, documents, cards, analytics, bookkeeping | by business role |
| `/funds/*` | the organization's payment fund, withdrawals, refunds list | org admin |
| `/dashboard/*` | overview, insights, module insights, exports | signed in |
| `/platform/*` | accounts, users, inbox, payments overview, refund and withdrawal review, platform fund, maintenance | super admin |
| `/public/maintenance` | the current maintenance notice (public, no secrets) | no account |
| `/audit-logs/*` | the audit log | super admin |

Every mutating route is also described in `backend/src/modules/audit/describe.ts`; a test fails if a route is added without a description or without authentication.

## 9. Front end
- `src/app`: route table (`AppRoutes.tsx`, lazy-loaded pages), layouts (public, bare, admin), auth context, protected route.
- `src/features/<domain>`: pages, dialogs, API functions and hooks per domain, mirroring the back end modules.
- `src/components`: shared UI (`ui/*` Radix wrappers, tables, date range filter, export buttons, stat cards, **Loading / LogoSpinner**).
- `src/lib`: `api.ts` (fetch wrapper with token refresh), `money.ts`, `liveData.ts` (which query keys refresh by themselves every few seconds), `seo.ts`.
- Data fetching uses TanStack Query keyed by domain; tables refresh automatically and have a Refresh button.
- Responsive rules: no page scrolls sideways (global clip plus per-component fixes), tabs scroll inside themselves, fields are 16px on phones, dialogs use `dvh`.

## 10. Testing
- `npm run test:unit --workspace backend` runs the **unit suite** (no database, no network): domain rules, form logic, imports, payments (pricing, fee, refunds, paid voting math, webhook and verification), bookkeeping rules and schemas, audit, date ranges, infrastructure, and the **route sweep** that proves every protected route answers 401 to anonymous and forged-token requests.
- `npm test --workspace backend` runs the integration tests (auth, registration flow, program isolation) against the configured database. **Never run it against production data.**
- The front end is checked with `tsc` and `vite build`; there is no automated browser test suite.
