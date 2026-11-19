# NTSOne: feature inventory and role breakdown

Source of truth: the project itself (`frontend/src/app/AppRoutes.tsx`, `backend/src/db/schema/enums.ts`, `docs/SYSTEM_OVERVIEW.md`,
`docs/PAYMENTS.md`, `docs/BOOKKEEPING.md`, `docs/WISHLIST.md` and the modules under `backend/src/modules` and
`frontend/src/features`). Nothing below is planned or assumed: every line maps to a route or module that exists.

## 1. Product

- **Name:** NTSOne, by NTS Digital Solutions. Tagline in the app footer: *One platform. Endless possibilities.*
- **Purpose:** a multi-tenant web platform. Each organization gets a private workspace for registrations, voting polls,
  orders and business documents, mobile-money payments, bookkeeping, contributions and wish lists.
- **Audience:** schools, churches, associations and event organizers (registrations, tickets, ID cards, elections),
  small businesses (orders, invoices, receipts, bookkeeping), and individuals (wish lists, contributions).
- **Brand assets:** `docs/brand/ntsone-logo.png`; blue-to-cyan gradient identity (`bg-gradient-brand`), Poppins-style
  typography, light and dark themes. The app installs like a phone app (PWA).
- **Payments:** Monime (Orange Money, Africell Money, QMoney). Currency shown as SLE.

## 2. Roles (exactly as implemented)

| Role | Where it comes from | What it can do |
|---|---|---|
| Visitor / registrant / customer | no account | Opens a public link or QR code, fills a registration or order form, pays, downloads an ID card, ticket or order copy, checks a QR code. |
| Voter | voter account (email + password, or Google), or, when the poll chooses, an anonymous guest | Votes in polls only; cannot reach anything else. |
| Viewer (`viewer`) | team member | Sees only the programs, polls and businesses they were given. |
| Program admin (`program_admin`) | team member | Manages only what they were given. Cannot agree to the platform fee, cannot refund. |
| Admin (`admin`, organization admin) | account owner | Everything in the organization: team, payment fund, withdrawals, refunds, fee agreement, automatic withdrawal. |
| Super admin (`super_admin`) | platform team | All organizations, audit log, per-organization payment terms, approvals of large withdrawals and refunds, platform fund, maintenance mode, backups, inbox. |

Access is per item (per program, poll or business). Routes guarded by role: `/admin/users` and `/admin/funds` (admin);
`/admin/tenants`, `/admin/inbox`, `/admin/platform-payments`, `/admin/platform-fund`, `/admin/maintenance`,
`/admin/backups`, `/admin/audit` (super admin).

## 3. Feature inventory

### A. Website and onboarding
1. Public home page: features, 3D showcases, FAQ, module visuals (`/`).
2. Sign up with an emailed one-time code, Google sign-up with organization setup step (`/register`, `/verify-email`).
3. Sign in, forgot / reset password, accept an invitation (temporary password flow) (`/login`, `/forgot-password`, `/reset-password`, `/accept-invitation`).
4. Contact form, report-a-concern form, terms, privacy, cookies, acceptable use (`/contact`, `/report`, `/terms`, ...).
5. Installable app, offline page, light and dark mode.

### B. Dashboard and navigation (`/admin`)
6. Dashboard summary cards for programs, registrations, scans, polls, businesses, payments, bookkeeping (and audit summary for super admin).
7. Sidebar navigation; "Start a space of your own" card for invited team members.
8. Refresh buttons and date-range filters with matching exports on every table.

### C. Programs and registration forms (`/admin/programs`)
9. Program list (modern cards), create program, cover image, status (draft, published, closed, archived), share link and QR code.
10. Form builder: drag and drop, 23 question types, sections, step-by-step or single page, consent and review-confirmation settings, preview (desktop, tablet, mobile).
11. Rules: show/hide, required-when, limits, pre-fill, auto-fill, narrowed choices (district then chiefdom), date and age limits.
12. Form versions; registration numbers in a chosen format; one registration per email.
13. Public registration page with inline field validation (red/green), review screen, "Clear form", draft kept in the browser.
14. Registrations table: search, filters (status, payment, dates), sorting, paging, CSV and Excel export.
15. Registration detail: answers, files, status history, edit, status change with email, payment card.
16. Import from Excel/CSV/Word table with column matching and preview; blank template; update existing registrations.
17. Program analytics (per day, status, demographics, per question).
18. Program notifications (team emails on new registration / verification) and registration rules.

### D. ID cards, tickets and verification
19. 50+ designs, colours, logo, flyer or own artwork, registrant photo, QR code and barcode.
20. Public verify page (`/verify/:slug/:registrationNumber`) and the Verifications log with live check-in numbers.
21. Documents stay locked until payment is confirmed (and after a full refund).

### E. Voting polls (`/admin/polls`, `/vote/:slug`)
22. Poll list, create poll (choose whether voters need an account), overview and settings (one vote per email, email-domain limit, live results, notifications, logo/cover).
23. Ballot builder: positions, candidates, photos.
24. Voters: account sign-up/sign-in with email code, forgot password, Google; or no-account guest voting; verified-voters-only lists.
25. Secret ballot; live results; voters list; exports of results and voters.
26. Paid voting: price per vote, fixed or any amount (exact multiples only), fee agreement, voter pays on Monime then chooses a candidate.
27. Poll payments tab.

### F. Businesses (`/admin/businesses`)
28. Business list and overview (brand colour, logo, contact details, status, order page on/off).
29. Order form builder (simplified fields), items with pictures and optional videos, prices.
30. Live order page (`/order/:slug`): storefront with product gallery, cart, checkout, confirmation, review before paying.
31. Orders list and detail with the business's own statuses and customer emails; order analytics.
32. Invoices, receipts, quotations: 14 layouts, tax and discounts, PDF, email to client, settings, edit history.
33. Business cards: two-sided designs with QR code, print or PDF.
34. Business analytics.

### G. Payments
35. Per-program/order/poll payment settings with the platform-fee agreement.
36. Payer status page (`/payment/:token`): confirm, cancel (order cancelled), try again; "received" emails only after payment.
37. Payments tabs with filters, refunds, waive, "paid in person", payment analytics.
38. Payment fund (`/admin/funds`): balances, all-time totals (before fee, after fee, after refunds), withdrawal accounts, withdrawals, money in and out ledger, automatic withdrawal (with "Automatic" labels).
39. Platform side: per-organization fee, hold time and withdrawal activation, all-organizations payment summary, review queue for withdrawals and refunds, platform fund.

### H. Bookkeeping (`/admin/businesses/:id/books`)
40. Cash book with big buttons, credit, loans, ledger, reports (profit and loss, cash flow, who owes what), voice notes.

### I. Contributions (`/admin/contributions`)
41. Recurring (monthly) or one-time contribution lists: contributors, monthly payment records (locked once a month has passed), withdrawals/"taken" amounts, balance, column options.

### J. Wish lists (`/admin/wishlists`, `/wish/:token`)
42. Private lists with budget and date; items, gotten list, summary, activity record; share by private link and QR with view-only or edit access.

### K. Team and account
43. Users page (admin): invite, roles, per-item access, suspend, remove.
44. Settings: profile, photo, organization name, change email, change password, **leave other organizations**, **delete own account**.

### L. Platform team (super admin)
45. Organizations list and detail (users, programs, payment terms), support inbox (feedback, contact, reports).
46. Audit log (immutable), maintenance mode with notices, backups and restore.

## 4. Not demonstrable / limits to state honestly in the videos
- Real Monime payment pages cannot be shown being paid without real money; use the test/sandbox flow or show the screens up to the redirect.
- Emails (confirmations, reset codes) are logged to the console when `BREVO_API_KEY` is empty; show them only if a mail catcher is set up.
- Google sign-in needs a configured Google client id.
