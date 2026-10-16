# Operations guide

## 1. Local development
```bash
npm install                 # once, at the repository root (npm workspaces)
cp .env.example .env        # fill in the values below
npm run db:migrate          # applies migrations to DATABASE_URL
npm run db:seed             # demo data only. NEVER against a real database
npm run dev                 # API on :4000, web app on :5173 (proxies /api)
```
> **Safety rule for this project:** the local `.env` may point at the live database. Do not run tests, seeds or the backend locally against it. Use a separate Neon branch or a local Postgres for development.

Useful commands: `npm run build`, `npm run db:generate` (new migration from schema changes), `npm run db:create-super-admin -- --email you@x.com --name "You"` (prompts for a password of 12+ characters).

## 2. Environment variables
Set secrets only in the hosting dashboard. Variables marked **secret** must never be committed.

### Core
| Variable | Meaning |
|---|---|
| `NODE_ENV` | `production` on Render |
| `API_PORT` | Port (Render: 10000) |
| `APP_URL`, `API_URL` | The public https address, both the same (cookies and the cross-site check use them) |
| `DATABASE_URL` | Neon connection string (**secret**) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Long random strings (**secret**) |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Session lengths |
| `DB_POOL_MAX` | Connections per instance (default 10) |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` | Global API rate limit |

### Services
| Variable | Meaning |
|---|---|
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (**secret**), `CLOUDINARY_UPLOAD_FOLDER` | File and voice-note storage |
| `BREVO_API_KEY` (**secret**), `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS` | Email (sender must be verified in Brevo). With no key, emails are logged instead |
| `GOOGLE_CLIENT_ID` | Optional "Continue with Google": on the sign-in and sign-up pages (new people name their organization afterwards) and for voters. Create a Web OAuth client in Google Cloud Console and add the site address under "Authorized JavaScript origins" |

### Payments (Monime)
| Variable | Default | Meaning |
|---|---|---|
| `MONIME_ACCESS_TOKEN` (**secret**), `MONIME_SPACE_ID` | none | Without them, payment features stay off. Pasted spaces, quotes and "Bearer " are cleaned |
| `MONIME_API_BASE`, `MONIME_API_VERSION` | `https://api.monime.io/v1`, `caph.2025-08-23` | |
| `MONIME_WEBHOOK_SECRET` (**secret**), `MONIME_WEBHOOK_STRICT` | none, `false` | Webhooks are hints; strict mode refuses unverified ones |
| `MONIME_REDIRECT_HOSTS` | `monime.io,monime.app` | Payers are only sent to these hosts |
| `MONIME_ALLOW_CARDS`, `MONIME_ALLOW_BANKS` | `false` | Mobile money is always on |
| `PAYMENTS_FEE_PERCENT`, `PAYMENTS_FEE_FIXED` | `5`, `0` | The platform fee |
| `PAYMENTS_HOLD_MINUTES` | `5` | Wait before received money can be withdrawn |
| `PAYMENTS_MAX_AMOUNT` | 10,000,000 | Largest single payment (Leones) |
| `PAYOUT_MIN_AMOUNT`, `PAYOUT_DAILY_LIMIT`, `PAYOUT_REVIEW_ABOVE` | 1, 5,000,000, 1,000,000 | Withdrawal minimum, daily limit, size above which the super admin must approve (also applies to refunds) |
| `PAYOUT_NEW_ACCOUNT_MINUTES` | `3` | Wait before a new withdrawal account can be used |
| `REFUND_DELAY_MINUTES`, `REFUND_WINDOW_DAYS` | `3`, `180` | When a payment can first and last be refunded |

## 3. Database and migrations
- Migrations are SQL files in `backend/drizzle` (0000 to 0029) and run during the Render build (`npm run db:migrate`). They are additive and idempotent.
- Recent migrations: `0020`-`0024` payments, `0025` audit log (adds the trigger that blocks updates and deletes), `0026` refunds and the platform fund (also copies existing fees onto the platform ledger), `0027` paid voting (payments may belong to polls; vote weights), `0028` bookkeeping, `0029` maintenance settings.
- Create a new migration: edit `src/db/schema/*.ts`, run `npm run db:generate`, review the SQL, add any custom SQL at the end, commit.
- Enable Neon **point-in-time restore** and test a restore from time to time.

## 4. Deploying (Render)
1. Connect the repository; Render reads `render.yaml` (one web service, region next to the database).
2. Enter the `sync: false` variables on first deploy.
3. Each push to `main` builds (`npm ci --include=dev && npm run build && npm run db:migrate`) and starts `npm start`. Health: `GET /health` (alive) and `GET /ready` (database reachable).
4. The free plan sleeps after 15 minutes idle and takes about a minute to wake. Use the starter plan for always-on.
5. After a deploy, read the build log: a failed migration must be fixed before relying on the new features.

## 5. Going live checklist (payments)
1. Create a Monime space and a **test** token; configure a staging deployment and try: pay, see it become Paid, open the Payment fund, add a withdrawal account, withdraw, make a refund (after 3 minutes) to your own number.
2. Platform, Payments page: the Monime card should show your account and its balance. If it shows an error it says what Monime answered (token rejected, permission missing, wrong space).
3. Confirm a real webhook arrives (`payment_events.signature_valid` true). If false, tell the developer the real header format before setting `MONIME_WEBHOOK_STRICT`.
4. Switch to the live token and space id.
5. Confirm every organization admin has agreed to the 5% fee on the programs that take payments (the settings card shows a red notice until they do).
6. Create the platform's withdrawal account on **Platform fund** and make a small withdrawal.

## 6. Daily operation
- **Platform, Payments** (super admin): withdrawals and refunds awaiting approval, payments that need a look (with a "Check with Monime" button), fees, Monime balances.
- **Platform fund**: the platform's fees and withdrawals.
- **Audit log**: search by account, person, result, date; failed or refused attempts are highlighted.
- **Maintenance**: switch the notice on before planned work; choose where it shows; email people once.
- **Inbox**: contact, feedback and report messages.
- Approve or decline large withdrawals and refunds; the requester cannot approve their own.

## 7. Troubleshooting
| Symptom | What to check |
|---|---|
| "Payment page could not be opened" | Audit log entry "A payment page could not be opened" shows Monime's answer (status, message, request id). Common: token lacks checkout permission, over-long return address (fixed with short links), wrong space id |
| Monime card shows no balance | The token may lack permission to read financial accounts; the card lists which fields Monime sent |
| Redirect back from Monime shows "Route not found" | Look in the Render log for a "Route not found" line; it records the method and address. `/payment/*` accepts GET and POST |
| Withdraw button greyed out | The line under the page title says why: no account, account still waiting, nothing available yet (hold), or Monime not connected |
| Refund button greyed out | It counts down 3 minutes after the payment; it needs an organization admin |
| Payments paused notice | An admin has not agreed to the platform fee (or the fee increased); agree and save |
| Voice recording blocked | The browser must allow the microphone for the site; the server permits it |
| Emails not arriving | Brevo key and verified sender; the `email_outbox` table shows queued, sent and failed messages |
| Migration failed | Read the Render build log; fix and redeploy. Never edit applied migrations |

## 8. Backups and recovery
The platform now makes its own encrypted daily backups (super admin, **Backup & Recovery**); see [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) for setup, restore and the variables. Neon point-in-time restore stays on as a second layer. The ledger and audit log are append-only, so a restore point just before a problem keeps the record consistent. After any restore, run the Monime reconciliation (the worker does it automatically) to settle payments whose state changed.
