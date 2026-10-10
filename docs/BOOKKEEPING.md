# Bookkeeping

A simple book for the businesses on the platform. It lives inside each business (Business → **Bookkeeping**). Anyone with access to the business can read it; changing it needs admin access to the business.

## What it holds
- **Cash book** — every entry is one of: sale, other income, stock bought, expense, loan received, loan given, loan paid back (either way), money the owner put in, money the owner took out.
- **Credit** — sales, stock and expenses can be partly or fully unpaid. The person is named, payments are written down against the entry as they come, and the books show who owes what.
- **Loans** — money lent or borrowed, with an optional flat extra (a percentage of the loan), a due date, repayments, "overdue", write-off, and cancel (only while nothing has been paid back).
- **Voice notes** — a person records what happened (up to 3 minutes). The recording is kept in the book as a record. Later it is turned into an entry (which links the two) or marked as dealt with. Browsers that can also work out the words keep them; the recording is the record either way. The app can also read totals out loud.
- **Reports** — profit and loss for any period (money earned, stock bought, expenses, result), cash flow (money that really moved, opening and closing, by method), and who owes what. Downloads for Excel and CSV.

## Rules the books keep
- Money is whole cents in the business's own currency; nothing is stored as decimals. Amounts must be positive and at most 1,000,000,000.
- Profit = money earned − stock bought − expenses. Loans and the owner's own money are **not** profit or loss.
- Cash flow is built from payments (when money actually moved), profit and loss from entries (the day they were written).
- **Nothing is deleted.** A wrong entry, payment or loan is voided (with a reason) and stays in the book, marked as voided. Voice notes that were used for an entry cannot be removed.
- The database also refuses nonsense (non-positive amounts, paid more than the total, unknown kinds).
- Every change is in the audit log (who, what, amounts; never the contents of a voice note).

## Security
- Reads need access to the business; writes need admin access. Super admins can see everything.
- Voice recordings upload straight to the file store with a signed, folder-scoped request limited to audio formats; the saved link must be one of the app's own file-store links.
- Writes are rate limited per route.

## Not covered
- It is a single-entry book for small businesses, not double-entry accounting; there is no tax filing, stock counting or bank reconciliation.
- Speech-to-text depends on the phone's browser and does not understand Krio; typed text and the recording are always available.
- Nothing here has been run against the live database yet; migrations 0026–0028 apply on the next deploy.
