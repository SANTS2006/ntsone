# NTSOne

A multi-tenant web platform for running registrations, voting polls, orders, mobile money payments and small-business
bookkeeping, with a private workspace for every organization and an audit log for the platform team.

**Start with the documentation:** [docs/README.md](docs/README.md)

- [System overview](docs/SYSTEM_OVERVIEW.md): modules, roles, workflows
- [Architecture](docs/ARCHITECTURE.md): stack, data model, request flow, API map
- [Operations](docs/OPERATIONS.md): setup, environment variables, deployment, going live, troubleshooting
- [Security](docs/SECURITY.md): protections and their limits
- [Payments](docs/PAYMENTS.md) and [Bookkeeping](docs/BOOKKEEPING.md): detailed module guides

What it does today: custom registration forms (23 question types, rules, imports), ID cards and tickets with QR check-in,
voting polls (free or paid), order pages with item prices, invoices, receipts, quotations, business cards, Monime mobile
money payments with refunds, a payment fund and a 5% platform fee, bookkeeping with loans, credit, reports and voice
notes, dashboards, analytics, date filters and exports on every table, and an immutable audit log.

> The sections below were written for the first build and are kept for local setup. Where they disagree with the
> documents above (for example "What's not built yet"), the documents above are correct.

## Stack

- **Frontend**: React 19, Vite, TypeScript, React Router, TanStack Query, TanStack Table, React Hook Form
  + Zod, Tailwind CSS, Radix UI primitives (shadcn-style components), @dnd-kit for the form builder.
- **Backend**: Node.js, TypeScript, Fastify, Zod validation, Drizzle ORM, JWT access + refresh-token auth,
  Argon2id password hashing, Cloudinary for file storage, Brevo for transactional email.
- **Database**: PostgreSQL (Neon), via `@neondatabase/serverless` (WebSocket `Pool`, so real
  multi-statement transactions are available — used for registration numbering and cascading writes).

## Project layout

```
/backend    Fastify API — routes → controllers → services → repositories, one module per domain
/frontend   Vite + React SPA — feature-folder structure under src/features/*
```

See `backend/src/modules/*` for the domain modules (auth, users, programs, forms, registrations,
uploads, email, audit, dashboard) and `frontend/src/features/*` for their UI counterparts.

## Local setup

1. **Install dependencies** (npm workspaces — run once at the repo root):
   ```bash
   npm install
   ```
2. **Configure environment variables**. Copy `.env.example` to `.env` at the repo root and fill in:
   - `DATABASE_URL` — a Neon Postgres connection string
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — for file uploads
   - `BREVO_API_KEY` — for transactional email (confirmation emails, password resets). If left blank,
     emails are logged to the console instead of sent, so the rest of the app still works in dev.
   - `JWT_SECRET` / `JWT_REFRESH_SECRET` — any long random strings (already pre-filled with generated
     values for local dev; **replace them for any real deployment**).
3. **Run database migrations**:
   ```bash
   npm run db:migrate
   ```
4. **Seed sample data** (3 programs, 3 admin users with different roles, sample registrations):
   ```bash
   npm run db:seed
   ```
   Seeded logins (see console output for the authoritative list):
   - `admin@example.com` / `SuperAdmin123!` — super admin (sees everything)
   - `bootcamp.admin@example.com` / `ProgramAdmin123!` — program admin, scoped to "Web Development Bootcamp"
   - `viewer@example.com` / `Viewer123!` — viewer, scoped to "Leadership Training"
5. **Run the app**:
   ```bash
   npm run dev
   ```
   This starts the API on `http://localhost:4000` and the SPA on `http://localhost:5173` (which proxies
   `/api` to the backend, so cookies work without extra CORS configuration in dev).

## Deployment (Render)

In production a single Node service serves both the API (`/api/*`) and the built React app, so the
refresh-token cookie and `/api` calls share one origin. `render.yaml` is a Render Blueprint that creates a
`ntsone` project with a `production` environment containing one **free** web service:

- **Build:** `npm ci --include=dev && npm run build && npm run db:migrate` (dev dependencies are needed for
  Vite/tsup/tsx; migrations run here because pre-deploy commands aren't guaranteed on the free plan).
- **Start:** `npm start`, listening on `API_PORT=10000`. Health check: `GET /health`.
- **Free-plan behavior:** the service sleeps after 15 minutes without traffic and takes about a minute to
  wake on the next visit. Switch `plan: free` to `plan: starter` to keep it always on.

Environment variables marked `sync: false` in `render.yaml` are entered in the Render dashboard on first
deploy. `APP_URL`/`API_URL` must both be the public HTTPS address (e.g. `https://register.yourdomain.com`),
and `EMAIL_FROM_ADDRESS` must be a sender verified in Brevo. `JWT_SECRET`/`JWT_REFRESH_SECRET` are generated
by Render.

**Creating the platform super admin.** `npm run db:seed` only creates demo accounts with published
passwords, so never use it for real data. Create your super admin (cross-tenant, view-only) from the
`backend` folder instead; it prompts for a hidden password of at least 12 characters:

```bash
npx tsx src/db/createSuperAdmin.ts --email you@yourdomain.com --name "Your Name"
```

It writes to whatever `DATABASE_URL` is in effect, so to target production set that variable to the
production connection string first. Where there's no interactive terminal, set `SUPER_ADMIN_PASSWORD`.

To test a production build locally: `npm run build`, then
`NODE_ENV=production API_PORT=4100 node --env-file=.env backend/dist/server.js` and open `http://localhost:4100`.

## Testing

```bash
npm test
```

Runs the backend's Vitest integration suite (via Fastify's `.inject()`, no server binding required)
against your configured `DATABASE_URL`. The suite covers auth, the registration submission → status
history flow, and — most importantly — **program data isolation**: it proves a `program_admin` scoped to
one program cannot list, fetch, or mutate another program's registrations, whether by direct access or by
swapping the `:programId` in the URL for a registration that belongs elsewhere. Test fixtures are created
and torn down per-run with unique names, so the suite is safe to run against your seeded dev database.

## Key architectural decisions

- **Program isolation is enforced at the service layer**, not via Postgres Row-Level Security. Every
  program-scoped route runs through `requireProgramAccess()` (`backend/src/middleware/authorize.ts`),
  which calls `assertProgramAccess()` (`backend/src/modules/programs/access.ts`) — the single point that
  decides whether the authenticated user may touch a given `programId`. A `super_admin` always passes; a
  `program_admin`/`viewer` must have a matching row in `program_members`. RLS was considered but skipped
  for this pass: it requires per-transaction `SET LOCAL` session variables that don't compose cleanly with
  a pooled/serverless driver, and would add a second, easy-to-desync enforcement path. A future hardening
  pass could add RLS as defense-in-depth on top of the service-layer checks.
- **Dynamic, versioned forms**: `forms` has one row per *version* (draft/published/archived), not one row
  per program. Editing after registrations exist creates or updates the draft version; publishing archives
  the previous published version rather than deleting it, so a registration's `formId` always resolves to
  the exact field definitions it was submitted against (`backend/src/modules/forms/service.ts`).
- **Registration data model**: `registrations.responses` is a JSONB blob keyed by each field's stable
  `fieldKey`, so completely different programs can have completely different forms without new tables or
  migrations per program. `applicantName`/`applicantEmail`/`applicantPhone` are pulled out into real
  columns (by field *type*, not by key) purely so search/filter/sort can use normal indexes instead of
  scanning JSONB.
- **Registration numbers** (`REG-2026-000123`) are generated with a single atomic
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` against a small `program_counters` table
  (`backend/src/modules/registrations/repository.ts`), scoped per program per year — safe under
  concurrent submissions without a separate locking step.
- **File uploads never touch the API server.** The backend only issues short-lived signed Cloudinary
  upload parameters (`backend/src/modules/uploads/service.ts`); the browser uploads directly to
  Cloudinary and reports back the resulting URL, which is validated and stored as a row in
  `registration_files`.
