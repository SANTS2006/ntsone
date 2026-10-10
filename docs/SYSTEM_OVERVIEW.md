# System overview

## 1. What it is
**NTSOne** (by NTS Digital Solutions) is a multi-tenant web application. Each organization gets a
private workspace to run:

- **Registrations**: custom registration forms for programs, with ID cards, tickets and QR check-in.
- **Voting polls**: elections with verified voters, secret ballots, live results, and optional paid votes.
- **Businesses**: order pages with item prices, order tracking, invoices, receipts, quotations, business cards.
- **Payments**: mobile money through Monime, a payment fund, withdrawals, refunds, a 5% platform fee.
- **Bookkeeping**: a cash book, credit, loans, profit and loss, cash flow and voice notes for small businesses.
- **Wish List**: personal lists of things to buy or have; when something is gotten it moves to a gotten list with the price paid and the date. Private to each person.
- **Audit log**: every action in the system, grouped by account, visible only to the platform's super admin.

Everything is available on phones and desktops, in light and dark mode.

## 2. Who uses it (roles)
| Role | What they can do |
|---|---|
| **Visitor / registrant / customer** | Opens a public link or QR code, fills a registration or order form, pays, downloads their ID card, ticket or order copy. No account needed. |
| **Voter** | Has a separate voter account (email, password or Google), tied to polls only. Cannot reach anything else. |
| **Viewer** | Staff member who can *see* the programs, polls or businesses they were given. |
| **Program admin** | Staff member who can *manage* the programs, polls or businesses they were given. Cannot agree to the platform fee and cannot refund. |
| **Admin (organization admin)** | Owns an account (organization). Sees and manages everything in it, manages the team, the payment fund, withdrawals, refunds, and agrees to the platform fee. |
| **Super admin (platform team)** | Sees every account, reads the audit log, approves large withdrawals and refunds, uses the platform fund, reviews payments that need a look. |

Access is **per item**: a program admin can manage some programs, polls and businesses and not others.

## 3. Modules and features

### 3.1 Accounts and team
- Sign up with email verification (a one-time code), sign in, password reset by email, change email, profile picture.
- Short-lived sessions that refresh themselves; sign-in attempts are throttled.
- Organization admins add team members, give each person access to specific programs, polls and businesses (admin or viewer), and suspend people.
- Platform super admin sees all accounts, their users and programs, can suspend users, and has an inbox for feedback, contact messages and reports.

### 3.2 Programs and registration forms
- A **program** has a name, public link, status (draft, published, closed, archived), cover image, share link, QR code and optional closing rules.
- **Form builder**: drag and drop, 23 question types (text, email, phone, number, currency, rating, dates and times, date of birth, single and multiple choice, dropdown, yes/no, country, gender, address, website, consent, image/PDF/document uploads and more), sections, step-by-step or single-page layout.
- **Rules**: show, hide, require, limit, pre-fill or auto-fill a question or section depending on other answers; narrowed choices (district then chiefdom); date and age limits.
- Forms are **versioned**: editing after registrations exist creates a new version; each registration keeps the version it was submitted against.
- **Registration numbers** in a format you choose (prefix, year, length, start number), safe under many simultaneous sign-ups.
- Duplicate protection: one registration per email where chosen; double submissions are blocked.

### 3.3 Managing registrations
- Table with search, filters (status, payment, **date range**), sorting, paging, and Excel or CSV export that follows the filters.
- Detail page with every answer, uploaded files (open or download), status history, edit answers, change status, and payment panel.
- Status changes email the registrant when enabled. Import from Excel, CSV or a Word table with column matching, preview and error report; blank import template download.
- Update existing registrations from a file.

### 3.4 ID cards, tickets and check-in
- 50+ ID card and ticket designs (many two-sided), your colours, logo, event flyer or your own artwork, each registrant's photo and details filled in automatically.
- QR code and barcode on each document. Anyone can scan to see who it belongs to and whether it is valid; every scan is recorded in the **Verifications** log (person, document, result, who scanned, when).
- Live check-in numbers (scans, people checked in, scans today, invalid attempts).
- If payments are on, the ID card and ticket stay locked until the payment is confirmed (and lock again after a full refund).

### 3.5 Voting polls
- Positions and candidates (with photos); one link for the whole poll or one per position, with QR codes.
- Voters create an account and confirm their email. Rules: one vote per person per position (an email written in a different way still counts as the same person), email-domain limits, and **verified voters only** lists.
- Secret ballot: admins see who voted but never which candidate.
- Live results with percentages and places; export results and the voters list.
- **Paid voting** (optional): the admin sets a price per vote and chooses fixed (one vote per payment) or any amount (votes = whole prices that fit). A voter pays on Monime, comes back, chooses a candidate; those votes count once. To vote again they pay again.

### 3.6 Businesses
- **Order form**: a branded order page. Admins list items with prices; customers pick quantities and see the total; they pay if payments are on. The orders list, order details, the customer's confirmation page and their PDF or picture all show the items.
- **Order tracking** with the business's own statuses and customer emails at each step.
- **Invoices, receipts, quotations**: 14 layouts in your colours, tax, discounts, PDF, email to the client, edit history (shown as "Updated").
- **Business cards**: eight two-sided designs with QR code, print or PDF.
- Business **analytics** (orders, invoiced, received, outstanding, top clients, and bookkeeping and payments blocks).

### 3.7 Payments
Covered in detail in [PAYMENTS.md](PAYMENTS.md). In short:
- Admin turns payments on for a program, order form or poll, sets prices, and **must agree to the platform's 5% fee** before it can be turned on (only an organization admin can agree).
- People pay with Orange Money or Africell Money on Monime's own page, then are sent back to a page showing their number and details.
- A payment counts only after the server asks Monime directly and the full amount matches.
- Money goes to the organization's **payment fund** (after a short hold). Admins add a withdrawal account and withdraw with their password. The platform keeps its fee in its own fund, which the super admin can withdraw.
- **Refunds**: a Refund button on every paid payment, available 3 minutes after the payment.

### 3.8 Bookkeeping
Covered in detail in [BOOKKEEPING.md](BOOKKEEPING.md). Inside each business: a cash book with big buttons (I sold, I spent, I bought stock, I received money, I put in / took out money, I lent, I borrowed), credit tracking, loans, profit and loss, cash flow, who owes what, **voice notes** and read-aloud totals. Nothing is ever deleted; mistakes are voided with a reason.

### 3.8b Wish List
Covered in detail in [WISHLIST.md](WISHLIST.md). Each person keeps private wish lists with a budget and target date. Items are added one by one or many at once (quantity and expected price optional), then marked as gotten with the price paid, date and store. Tabs: Wish list, Gotten (with savings against the expected price and a date filter), Summary (budget, by category, by month, by priority) and Activity (a record that cannot be changed). Nothing is deleted; removed items and lists stay in the records. An owner can **share a list** with people who have no account: each gets a private link and QR code with view-only or edit access, sees only that list, and can be changed, given a new link or removed at any time.

### 3.9 Dashboards, analytics and exports
- **Dashboard**: programs, registrations, scans, polls, businesses, **payments** (money collected, top earners, latest), **bookkeeping** (profit this month, owed, loans), and for the super admin the **audit log** summary.
- **Analytics** per program (registrations per day, status breakdown, demographics, every question) and per business; payment analytics per program or order form (money per day, how people paid, best sellers, funnel from registering to paying).
- **Date filters** on every table and downloads that follow them.

### 3.10 Audit log (super admin only)
Records every change, sign-in, download, export, page view of live pages (once per visitor per ten minutes), submission, payment, scan, vote (never the candidate), refund, withdrawal and failed or refused attempt. Grouped by account. Cannot be edited or deleted (enforced by the database). Never stores passwords, form answers, file contents or voter choices.

### 3.11 Maintenance mode (super admin only)
Under **Maintenance** the platform team can switch a notice on, write the message, give an expected end time, show it as a strip at the top or replace the page with a maintenance screen, and choose where it shows: everywhere, or only chosen parts (website, sign-in pages, the admin app, registration and order forms, voting pages, the payment status page, ID card and ticket checks). When it is switched on, an email goes once to the team members (and optionally the voters), with an optional "back" email when it is switched off. Pages check for the notice every minute. The platform team is never locked out, and sign-in pages only ever show the strip. The notice is on screen only: the server keeps working.

### 3.12 Website and legal pages
Public home page (features, 3D showcases, FAQ), contact form, report-a-concern form, terms, privacy, cookie and acceptable-use policies, sitemap and SEO pages for published programs, polls and order pages.

## 4. Key workflows

### 4.1 Run a paid registration
1. Admin creates a program, builds and publishes the form.
2. Under **Payments**, turns payments on, sets the registration fee, ID card and ticket prices, ticks the fee agreement, saves.
3. A registrant opens the link, fills the form, reviews their answers, presses **Confirm and pay** and is sent to Monime.
4. They pay with mobile money and are sent back to the payment page, which confirms with Monime and then shows their registration number and details and unlocks the ID card and ticket.
5. The admin sees the payment in the program's **Payments** tab and the money in the **Payment fund** (after the hold).

### 4.2 Take orders with items
1. Create a business, open **Order Form**, add items with prices, turn payments on (optional) and agree to the fee.
2. Share the order link. The customer picks items, sees the total, reviews the order, pays.
3. The business sees the order in **Orders** with the items listed, and in **Payments**.

### 4.3 Refund a payment
1. Open the program's or business's **Payments** tab (or the registration's Payment card).
2. When the Refund button turns on (3 minutes after payment), press it, choose the amount, enter the reason, provider and number, and your password.
3. The money leaves the fund at once, is sent to the number, and the admins and the payer are emailed. Large refunds wait for the super admin.

### 4.4 Run a paid poll
1. Create the poll and ballot. On the poll's **Overview**, turn on **Paid voting**, set the price per vote, choose fixed or any amount, agree to the fee, save, and open voting.
2. A voter signs in, picks a position, pays, returns, chooses a candidate; the votes they bought are recorded once.
3. The admin sees who paid and how many votes in the poll's **Payments** tab (never the candidate).

### 4.5 Keep the books
1. Open a business, then **Bookkeeping**. Press a big button (for example **I sold something**), enter the amount, say whether it was paid or on credit, who it was with and what for.
2. Anyone who finds writing hard can press **Say it with my voice**; the recording is saved and later turned into an entry.
3. See profit, cash and who owes what on the first page and in **Reports**.

### 4.6 Withdraw money
1. **Payment fund**, add a withdrawal account (mobile money or bank) with your password; it can be used a few minutes later.
2. Press **Withdraw** once money is available (past the hold) and a usable account exists; enter the amount and password.
3. Large withdrawals wait for the super admin; others are sent by the background job.

## 5. Glossary
- **Tenant / account / organization**: one customer's private workspace.
- **Minor units**: money stored in cents (1 Leone = 100), never decimals.
- **Hold**: minutes a received payment waits before it can be withdrawn.
- **Payment fund**: an organization's balance, computed from an append-only ledger.
- **Platform fund**: the platform's own ledger of fees it has kept.
- **Void**: mark an entry as a mistake while keeping it in the record.
