# Security

This lists the protections that exist, what each defends against, and what is **not** covered. It is not a penetration-test report, and no system is "100% secure".

## 1. Accounts and sessions
- Passwords are hashed with Argon2id; plain passwords are never stored or logged.
- Email addresses are confirmed with a one-time code (new accounts, email changes, voters).
- Short-lived access tokens plus refresh tokens kept in an HttpOnly cookie; voters have a separate cookie, key and audience, so a voter session can never act as staff.
- New passwords must be at least 10 characters with a letter and a number and not one of the commonest passwords (staff, team members, voters; also on reset and change).
- Access tokens are signed with one algorithm (HS256), carry an audience, and tokens made for anything else are refused.
- Per-account sign-in throttling with a constant-time dummy hash (no hint whether an email exists); wrong passwords on money actions count against the same limit.
- Password reset by email code; the response is identical whether or not the address has an account.

## 2. Access control
- Every protected route requires authentication and a role check; a test sweeps all routes and fails if one answers an anonymous or forged-token request with anything but 401.
- Per-item access (program, poll, business) is decided on the server by one function per resource; tests prove a scoped user cannot reach another program by changing ids in a URL.
- Each organization is a separate workspace; the platform super admin is the only cross-account role.
- Only organization admins (or the super admin) can: agree to the platform fee, refund, manage the payment fund, add or remove withdrawal accounts.

## 3. Input validation
- Every body, query and parameter is validated by Zod on the server; the screen mirrors the rules but never decides them.
- Amounts are whole integers within limits; negative numbers are refused (fields, form answers, builder limits, money); text has maximum lengths; dates and enumerations are checked.
- Bookkeeping, payments and votes also have **database CHECK constraints** (positive amounts, paid never above total, valid kinds and statuses, vote weight at least 1).
- Design previews (ID cards, tickets, business cards) pass through an SVG sanitizer that removes scripts, embedded pages, event handlers and non-https or non-image links before display.
- Uploaded files go straight to the file store with a signed request that fixes the folder and the **allowed file formats**; links the server later fetches or shows must be the app's own file-store links (no arbitrary or internal addresses).

## 4. Payments
- **Server-side prices**: totals, fees, vote counts are always computed on the server from the program's own prices.
- **Verified settlement**: a payment becomes paid only after the server asks Monime directly and the checkout reference, currency and **full amount** match. Webhooks and the browser's return are only prompts; a forged webhook can cause one harmless lookup.
- **Idempotency**: checkout, withdrawal and refund sends use unique keys; ledger entries are unique per payment/payout/refund and kind, so repeating work cannot double-credit or double-send.
- **Trusted redirects**: payers are only sent to Monime hosts; private payment links are short, signed, expire in 14 days and cannot be altered.
- **Fraud limits**: rate limits per address, email and phone; quiet risk flags for the team; ID cards, tickets and scans stay invalid until payment is confirmed.
- **Fee agreement**: payments cannot be turned on (and cannot charge anyone) until an organization admin has agreed to the platform fee; agreement is stored with who and when.
- **Money out**: password re-entry, new accounts wait before first use, daily limits, per-organization locking so the same money cannot be spent twice, review by the super admin above a threshold (requester cannot approve their own), an append-only ledger, and a background job with retries.
- **Refunds**: see below.

## 5. Refunds
Only completed payments, only after the 3-minute delay and within 180 days; total refunds never exceed the payment; one open refund per payment; the organization's fund must cover it; daily limit; password re-entry; valid mobile money provider and number; large refunds need the super admin; the fee is returned in proportion; the refund leaves the fund immediately and is returned on failure; used votes cannot be refunded; everything is audited. A refund sent to a wrong number cannot be taken back.

## 6. Voting
- One vote per person per position (emails written in different ways count as one person), domain limits, verified-voter lists applied at sign-up, sign-in and voting.
- Secret ballot: admins and the audit log never show which candidate a person chose.
- **One vote per email also applies to paid votes**: when it is on, someone (or the same address written another way) who has voted for a position cannot start a payment for it, cannot use credits for it, and the database refuses a second vote through the same per-person key; the page shows "already voted" and keeps the live results.
- Paid votes: payment confirmed by Monime; votes belong to the payer, one position, one use (locked step plus a unique index), not usable after refund, only while voting is open; payment starts are rate limited.

## 7. Audit and records
- Every change, sign-in, download, export, submission, payment, scan, vote, refund and withdrawal is recorded with who, what, when, address, browser and result; failed and refused attempts are included.
- The audit table cannot be edited or deleted (a database trigger refuses it); only the super admin can read it.
- Never recorded: passwords, tokens, one-time codes, form answers, file contents, card or account numbers, voter choices.
- Bookkeeping never deletes: mistakes are voided with a reason; voice notes used for an entry stay with it.

## 8. Web and server hardening
- Security headers (helmet): strict content security policy, no framing, HSTS in production; microphone is permitted only for this site (voice notes); camera for scanning.
- In production, any browser request that changes data must come from the app's own address.
- API responses are marked `no-store`; request bodies are limited to 1 MB; request ids are validated; internal error details are never sent to clients; Authorization and cookie headers are redacted from logs.
- Global rate limit plus tighter limits on sign-in, voting, payments, refunds and withdrawals (per instance).
- Graceful shutdown flushes the audit queue and drains connections.

## 9. Data protection
- Card and mobile-money PINs are never seen or stored: payment happens on Monime's page.
- Phone and account numbers are masked in lists.
- Privacy and terms pages describe what is collected (including payment records, business records and voice notes) and who processes it.

## 10. What is not covered or not proven
- **Not penetration-tested.** Have a security professional test the system before large volumes of real money.
- **Not load-tested** on the live database; rate limits and caches are per instance.
- **Payments, refunds and withdrawals have never run with real money**; the Monime payout request shape and the webhook signature format are not confirmed against Monime's live system.
- Dependency advisories remain for the Excel export library (a moderate issue in an internal id tool we do not call in the affected way).
- Browser speech-to-text depends on the user's phone and sends audio to the browser vendor's service; the recording itself is stored with our file-store provider.
- A super admin with database or hosting access can see everything; protect those accounts with strong passwords and limit who has them.
- Free-tier hosting means one instance, sleeping when idle; email volume is limited by the email provider's plan.
