# Payments (Monime)

Registrations, ID cards, tickets and orders can be paid for through [Monime](https://docs.monime.io), which takes
Orange Money, Africell Money and QMoney in Sierra Leone. This page covers how it works, how to switch it on, and the
security around it.

**Status: built and unit-tested against Monime's published API (version `caph.2025-08-23`), but never run against a real
Monime account.** Test with Monime's sandbox token first (see "Going live").

## How it works

1. **Admin sets prices.** On a program: Overview → Payments (registration fee, ID card price, ticket price). On a
   business order form: the Form Builder has "Items for sale" (name, price, most per order) and the same Payments switch.
2. **The customer chooses and submits.** An order page lists the items with quantity buttons and a live total. The
   registration is saved immediately with status "Awaiting payment".
3. **They pay on Monime's page** (hosted checkout, mobile money by default). Card numbers and wallet PINs never touch
   this platform.
4. **We confirm with Monime.** The payment only counts once the server has asked Monime for the checkout session and its
   payments and the amount matches. Then the registration becomes "Paid", the ID card and ticket unlock, a receipt is
   emailed, and the organization's payment fund is credited.
5. **The organization withdraws** from the fund to a mobile money number or bank account (Funds page).

If the payer closes the page, `/payment/<private link>` lets them resume or try again.

## Switching it on

Set these in the hosting settings (Render). Without the first two, every payment feature stays off.

| Variable | Meaning |
|---|---|
| `MONIME_ACCESS_TOKEN` | A personal access token for your Monime space (Dashboard → Personal access tokens). A test token uses the sandbox; a live token uses live. |
| `MONIME_SPACE_ID` | The space id, starts with `spc-`. |
| `MONIME_WEBHOOK_SECRET` | The secret you set on the webhook (32+ characters). |
| `MONIME_WEBHOOK_STRICT` | `false` at first; `true` once a real webhook has been seen to verify. |
| `MONIME_REDIRECT_HOSTS` | Hosts a payer may be sent to. Default `monime.io,monime.app`. |
| `MONIME_ALLOW_CARDS` / `MONIME_ALLOW_BANKS` | Off by default; mobile money is always offered. |
| `PAYMENTS_FEE_PERCENT`, `PAYMENTS_FEE_FIXED` | What the platform keeps from each payment (percent, and Leones). Monime's own fees are charged to your Monime account, so set this to cover them. |
| `PAYMENTS_HOLD_MINUTES` | Money can't be withdrawn until this many minutes after the payment (default 5). |
| `PAYMENTS_MAX_AMOUNT` | Largest single payment, in Leones (default 10,000,000). |
| `PAYOUT_MIN_AMOUNT`, `PAYOUT_DAILY_LIMIT`, `PAYOUT_REVIEW_ABOVE`, `PAYOUT_NEW_ACCOUNT_MINUTES` | Withdrawal limits; above `PAYOUT_REVIEW_ABOVE` a person on the platform team must approve. |

**Webhook:** in Monime create a webhook pointing at `https://<your API_URL>/api/webhooks/monime`, with an HMAC (HS256)
secret equal to `MONIME_WEBHOOK_SECRET`, subscribed to the checkout session, payment and payout events.

The database change (migration 0024) runs on the next deploy.

## Security design

**Money**
- Amounts are whole cents (`bigint`), never decimals. All prices and totals are computed on the server from the
  program's own settings; the browser sends only item ids and quantities.
- A payment is only ever marked paid in one place (`refreshPayment`), after asking Monime directly: the checkout
  session must carry our payment id as its reference, be `completed`, and the completed payments for its order number
  must total at least the amount, in `SLE`. Too little, or a reference mismatch, puts the payment in **review**: nothing
  is credited and the ID card stays locked.
- Webhooks, the return-from-Monime redirect and the 30-second background check all call that same function. A forged
  webhook can at most cause one harmless lookup.
- Each webhook event id is stored once (`payment_events`); replays are ignored. The signature (`Monime-Signature`,
  HMAC-SHA256) is checked in constant time with a 5-minute timestamp window. Monime's public docs do not yet spell out
  the exact header layout, so several common layouts are accepted and `MONIME_WEBHOOK_STRICT` is off by default.
- Creating a checkout and a payout use an `Idempotency-Key` (the payment/payout id), so a retry cannot double-charge or
  double-pay. Credits to the ledger are unique per payment (database index), so settling twice credits once.
- Payers are only redirected to https pages on `MONIME_REDIRECT_HOSTS`.
- The access token and secrets exist only in environment variables, are sent only in the `Authorization` header, and are
  never logged or put in error messages (a test checks this).

**Fraud and abuse**
- Rate limits per address, email and phone on starting payments; limits on abandoned/failed attempts; at most 6 attempts
  per registration per day; unusual patterns are flagged on the payment (`risk.flags`) for the team.
- A hard cap per payment (`PAYMENTS_MAX_AMOUNT`) and the 16-line limit of a Monime checkout.
- ID cards and tickets are refused (HTTP 402) while a payment is pending or under review; a QR scan of an unpaid card
  shows "not valid". Admins can waive a payment (audited).
- The status link is a signed, expiring token; the payer needs no account but cannot see anyone else's payment.

**The payment fund (withdrawals)**
- An append-only ledger per organization; a balance is a sum of entries. Money is held for `PAYMENTS_HOLD_MINUTES`.
- Withdrawing needs the organization **admin**, who must **re-enter their password** (wrong tries count toward the
  sign-in lockout). Adding or removing a withdrawal account also needs the password.
- A new account waits `PAYOUT_NEW_ACCOUNT_MINUTES` before it can receive money, and every admin is emailed when accounts
  are added or withdrawals requested.
- Requests are serialised per organization (advisory lock), checked against the available balance, minimum and daily
  limit, and the amount leaves the balance at once so it cannot be spent twice. A failed, cancelled or declined
  withdrawal puts the money back.
- Withdrawals above `PAYOUT_REVIEW_ABOVE` wait for a super admin; the requester cannot approve their own.
- Everything that moves money is in the audit log.

## The platform fee and the platform fund
- Every payment keeps `PAYMENTS_FEE_PERCENT` (default **5%**) for the platform. Whoever switches payments on for a program, order form or poll must tick that they agree; the agreement (percent, time, person) is stored with the settings and must be given again if the fee goes up.
- Each completed payment also credits the platform's own ledger (wallet entries with no organization). **Platform → Platform fund** (super admin) shows it and lets the super admin add a withdrawal account and withdraw, with the same password check, cooling-off period, daily limit and background sending as an organization's fund. There is no second approver for the platform's own money.
- `PAYMENTS_HOLD_MINUTES` (default 5) and `PAYOUT_NEW_ACCOUNT_MINUTES` (default 3) set the hold and the wait for a new withdrawal account.

## Refunds
- An organization admin (or the platform team) refunds a **completed** payment from its Payments page, fully or in part, within `REFUND_WINDOW_DAYS` (default 180). They give a reason, the provider and number to send to (Orange Money or Africell Money), and their password.
- The refund leaves the payment fund at once (it comes back if the transfer fails), the platform's fee goes back in proportion, and the money is sent to the number through Monime by the background job. A fully refunded registration stops counting as paid, so its ID card and ticket are locked again.
- Refunds above `PAYOUT_REVIEW_ABOVE` wait for a super admin (the requester can't approve their own). Daily limits apply. Votes that were already cast can't be refunded.
- Every request, approval, failure and send is in the audit log.

## Paid voting
- A poll's admin turns on **Paid voting** (Overview), sets the price of one vote, and chooses fixed (one vote per payment) or any amount (votes = whole prices that fit in the amount; the charge is exactly those votes). They agree to the platform fee first.
- A voter signs in, pays for one position on Monime, is sent back to the voting page and chooses a candidate; all the votes they bought go to that candidate, once. To vote again they pay again.
- Safeguards: price, votes and total are always worked out on the server; a payment counts only after Monime confirms the full amount; the votes belong to the voter who paid, for that position, while the poll is open; using them is one locked step and a unique index refuses a second use of a payment; refunded or refunding payments can't be used; payment starts are rate limited; the audit log records every payment and every use (never the candidate).

## Operations
- **Platform → Payments** (super admin): withdrawals awaiting approval, payments needing a look (with a "Check with
  Monime" button), fees earned, and the balances of your Monime accounts.
- A background job runs every 30 seconds on each server: settles open payments Monime has news about, sends queued
  withdrawals, and follows up those in progress. If a server restarts mid-withdrawal, it is re-queued and the
  idempotency key prevents a second transfer.

## Going live
1. Create a Monime space and a **test** personal access token; set the variables on a staging deploy.
2. Make a small payment with a test number; watch it become Paid, check the fund, add a withdrawal account, withdraw.
3. Confirm a real webhook arrives (Platform → Payments, or the `payment_events` table: `signature_valid` should be true).
   If it is false, tell the developer the actual header format and set `MONIME_WEBHOOK_STRICT` only after it verifies.
4. Swap in the **live** token and space id.

## Known limits
- **QMoney:** the platform shows whatever mobile money providers Monime offers for Sierra Leone. Orange Money (`m17`) and
  Africell Money (`m18`) are in Monime's published API; QMoney appears if and when Monime enables it.
- **Refunds** are done by the platform: Monime's API has no refund call, so a refund is a transfer from your Monime account to the payer's mobile money number (see Refunds below). Card and bank payments can't be refunded this way.
- Phone numbers for withdrawals are sent as country code plus number (`23276123456`); confirm Monime accepts that form in
  the sandbox.
- Not covered by any real-money test yet; see "Going live".
