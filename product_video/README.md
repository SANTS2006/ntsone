# NTSOne product video project

## Status
| Item | State |
|---|---|
| Audit, feature inventory, roles | Done: `storyboards/01_feature_inventory_and_roles.md` |
| Storyboard for the series (9 module videos + master + promos) | Done: `storyboards/02_video_series_storyboard.md` |
| Coverage checklist | Updated: `storyboards/03_feature_coverage_checklist.md` |
| Written user guide | First version: `user_guide/NTSOne_User_Guide.md` |
| **Video 1, Main product overview (1:14, 1080p)** | **Produced:** `master_product_tutorial/NTSOne_01_Product_Overview_1080p.mp4` |
| Subtitles for video 1 | `subtitles/NTSOne_01_Product_Overview.srt` (also burned into the video) |
| Vertical 9:16 cut of video 1 | Draft: `promotional_video/NTSOne_Overview_9x16_draft.mp4` |
| **Video 3, Registrations, ID cards and tickets (2:34, 1080p)** | **Produced:** `feature_tutorials/NTSOne_03_Registrations_ID_cards_tickets_1080p.mp4` (subtitles in `subtitles/`) |
| **Video 4, Voting polls (2:02, 1080p)** | **Produced:** `feature_tutorials/NTSOne_04_Voting_polls_1080p.mp4` (subtitles in `subtitles/`) |
| **Video 5, Businesses, orders and invoices (2:24, 1080p)** | **Produced:** `feature_tutorials/NTSOne_05_Businesses_orders_invoices_1080p.mp4` (subtitles in `subtitles/`) |
| **Video 6, Payments, payment fund and withdrawals (2:38, 1080p)** | **Produced:** `feature_tutorials/NTSOne_06_Payments_fund_withdrawals_1080p.mp4` (subtitles in `subtitles/`) |
| **Video 7, Bookkeeping (2:07, 1080p)** | **Produced:** `feature_tutorials/NTSOne_07_Bookkeeping_1080p.mp4` (subtitles in `subtitles/`). Contributions and wish lists are not in it yet |
| **Video 2, Getting started (2:24, 1080p)** | **Produced:** `feature_tutorials/NTSOne_02_Getting_started_1080p.mp4` (subtitles in `subtitles/`) |
| **Video 9, The platform team (2:59, 1080p)** | **Produced:** `feature_tutorials/NTSOne_09_Platform_team_1080p.mp4` (subtitles in `subtitles/`) |
| **Video 8, Your team and account security (2:13, 1080p)** | **Produced:** `feature_tutorials/NTSOne_08_Team_and_security_1080p.mp4` (subtitles in `subtitles/`) |
| **Video 10, Contributions and wish lists (3:02, 1080p)** | **Produced:** `feature_tutorials/NTSOne_10_Contributions_wish_lists_1080p.mp4` |
| **Master training video (23:41, 1080p)** | **Produced:** `master_product_tutorial/NTSOne_Master_Training_Video_1080p.mp4` (videos 1-10 joined, chapter list and combined SRT included) |
| **Role guides (5, 31-38 s each)** | **Produced:** `feature_tutorials/role_guides/` (organization admin, program admin and viewer, voter, registrant and customer, platform team) |
| **Promos (7, each in 16:9 and 9:16)** | **Produced:** `promotional_video/` (main 38 s, then registrations, voting, business, payments, bookkeeping, contributions and wish lists at 13-25 s) |
| Complete file list | `FINAL_DELIVERABLES.md` |

## How the last pieces were made
- **Video 10:** `tools/record_groups.mjs` prepares fictitious contributors, payments and an amount taken out in the demo database, then shows the contribution tabs and a wish list
  (one item is marked gotten and then appears in the Gotten tab). Share links are only shown, not created. The contribution tracker month shown is the current year only.
- **Master video:** `pipeline/build_master.py` joins videos 1-10 in a teaching order (overview, getting started, registrations, voting, businesses, payments, bookkeeping,
  contributions and wish lists, team and security, platform team), re-encodes them to one format and writes `NTSOne_Master_Training_Video_chapters.txt` and a combined SRT.
- **Promos and role guides:** `pipeline/make_promos.py` builds them from screenshots already captured for the tutorials (so they show real screens), with short scripts, and makes the
  9:16 versions with the screen on a blurred background. **The promos are shorter than the 30-60 s asked for (13-38 s)** because the scripts are short; a longer cut needs more narration.
- A first 9:16 draft of the overview (`NTSOne_Overview_9x16_draft.mp4`) is still there from the first version.

## How video 8 was made
`tools/record_team.mjs` invites a fictitious teammate (mariama.demo@example.com; the invitation email is not delivered in the demo), and shows the Users page, the
invite dialog and role list, a person's access dialog and role dropdown (opened, nothing changed), a viewer's own dashboard, programs list and Settings "Other
organizations / Leave" card (Leave is not pressed), a failed sign-in message and the change-password card. Built with `pipeline/build_steps_video.py video_team`.
Not shown: granting or removing access, changing a role, suspending someone, accepting an invitation, and the leave and sign-in throttling actually happening.
**Two inconsistencies were noticed while recording (app text, not changed):** (1) the invite dialog says the teammate gets a "temporary password" made of the organization's
initials, "@" and the year, but the code starts the account with an unknown password and a private link, so the narration only says "a link to accept the invitation and
choose their own password"; (2) the sign-in page answers "We couldn't find an account with this email address", although docs/SECURITY.md says there is no hint whether an email exists.

## How video 9 was made
`tools/record_platform.mjs` signs in as the demo super admin and records, read-only: the sidebar, accounts list and one account (users, payment terms),
the inbox (one demo contact message is added through the public contact form first), platform payments summary and review queues, the platform fund,
maintenance mode, backups and the audit log. Nothing is switched on, saved, suspended, backed up or restored. Built with `pipeline/build_steps_video.py video_platform`.
Not shown: suspending a user, an approval of a large withdrawal or refund (none are waiting in the demo), maintenance mode actually on, creating or restoring a backup,
the feedback and reports tabs with content, and the dashboard's audit summary.

## How video 2 was made
`tools/record_started.mjs` shows the home page, fills in the sign-up form and submits it up to the "check your inbox" code screen (a throwaway
@example.com address in the demo database; the emailed code cannot be received, so confirming the email is described, not shown), the sign-in and
forgot-password pages, the contact page, and, signed in as the demo admin, the dashboard, sidebar, dark mode, profile menu and the Settings page
(profile, password and delete-account cards; nothing is submitted). Built with `pipeline/build_steps_video.py video_started`.
Not shown: Google sign-up, accepting an invitation, the installable-app prompt and the mobile layout.

## How video 7 was made
`tools/record_books.mjs` creates a fictitious business ("Kamara General Store") in the demo database and uses the cash book through the screen: writes
a sale (paid), a sale on credit, spending, bought stock and a loan, then shows My book, All entries, Loans, the three reports and Voice notes.
Built with `pipeline/build_steps_video.py video_books`. Not covered: the "I borrowed money" and loan-repayment flows, voiding an entry, exports,
the "Read it to me" and "Listen" read-aloud buttons (audio) and actually recording a voice note.

## How video 6 was made
Real payments cannot be made in the demo, so `tools/seed_demo_payments.mjs` adds **fictitious** payment history to the demo database only
(six payments, ledger entries, a withdrawal account and one completed withdrawal; the video says the amounts are sample data).
`tools/record_payments.mjs` then shows turning payments on for a program (with the fee-agreement box, its error and its confirmation), the program's payments,
the payment fund (balances, all-time totals, accounts, add-account and withdraw dialogs, automatic withdrawal card, withdrawals, ledger) and, as the
super admin, the all-organization summary and one organization's payment terms. Two phases were needed: the organization screens ran with a
dummy (non-working) Monime setting so payments could be switched on, and the platform screens ran with Monime blank ("Not connected").
Nothing was submitted that moves money: no withdrawal, no automatic-withdrawal switch-on and no new account was saved, and no request reached Monime.

## How video 5 was made
`tools/record_business.mjs` performs the workflow in the demo app: adds a business, builds its order form (items and questions), publishes and shares
the order page, places an order as a customer, manages the order, saves an invoice, and visits the receipts, quotations, cards and analytics tabs.
Built with `pipeline/build_steps_video.py video_business`. Payments are switched off in the demo, so the customer confirms without paying; the
receipt, quotation and business-card creation flows, the PDF download and the email sending are mentioned but not demonstrated.

## How video 4 was made
`tools/record_voting.mjs` performs the workflow in the demo app: creates a poll that needs no voter accounts, builds a ballot, opens voting,
votes as a visitor (a guest voter), and shows the account sign-in of the seeded poll, the results and the voters list. Built with
`pipeline/build_steps_video.py video_voting`. Not covered: signing up as a voter (needs an emailed code), verified-voters lists, domain limits,
and paid voting beyond showing its settings card.

## How video 3 was made
The script `tools/record_registrations.mjs` actually performs the workflow in the demo app (creates a program, builds and publishes a form,
registers as a visitor with validation errors, then manages and approves the registration) and saves a highlighted 1920x1080 screenshot
at every step. `pipeline/build_steps_video.py` adds narration, section titles, a zoom toward each highlight and burned-in subtitles.
Not covered in this video (planned for later): the import from Excel, exports, ID card and ticket designs and the QR check-in itself
(only the settings and the Verifications log are shown), analytics, and payments for registrations.

## How video 1 was made
- **Screens:** real 1920x1080 captures of the running NTSOne app (light theme) against a separate **demo database** with fictitious data
  (Acme Training Co, "Student Council Elections 2026", Sunrise Stationery, a wish list and a contribution). Each screen becomes a slow zoom or a scroll.
  They are still screens with motion, not live click-through recordings: live screencasting crashed the headless browser on the dashboard's charts.
- **Voice:** the local Windows voice "Microsoft Zira". It is intelligible but synthetic, not a professional narrator.
- **Titles and outro:** branded cards built from `docs/brand/ntsone-logo.png`, plus a section title on each screen scene.
- **No music** was added (no music source available here).
- **Assembly:** ffmpeg via `pipeline/assemble.py`; narration, cards and SRT via `pipeline/build_assets.py`; screens via `tools/capture_stills.mjs`.

## What is not done and why
1. **Higgsfield:** the workspace is on the free plan with 10 credits and this session only exposes read tools (balance, model
   catalogue, history). Nothing from Higgsfield (voice, music, video, motion graphics) could be generated. Its catalogue lists
   ElevenLabs voices and music that would improve the narration and add a music bed.
2. **Live click-through recordings and form-filling demos** (sign up, build a form, vote, order, withdraw) are not recorded.
3. **Videos 2-9, role videos, master training video, 30-60 s promos** are scripted at storyboard level only.
4. The vertical cut simply places the 16:9 screen on a blurred background; a proper vertical edit would zoom into regions.

## Running the demo environment again
- Demo settings live in `product_video/.demo.env` (git-ignored, contains the demo database URL). Never commit it.
- `pipeline/with_demo_env.mjs <command>` runs a command (for example `npm run db:migrate`) against the demo database and refuses to run if the URL equals the live database.
- Start the API with the `demo-api` preview configuration (`pipeline/run_demo_api.mjs`) and the frontend with `web`.
- Demo content: `tools/seed_demo_content.mjs`. Rebuild video 1: `python pipeline/build_assets.py video1_overview`, `node tools/capture_stills.mjs`, `python pipeline/assemble.py video1_overview`.

## Incident note
While setting this up, the seed script was run against the live database by mistake (an unquoted `&` in the connection string stopped the
demo URL being loaded). The rows it added were removed by the owner and verified gone; `with_demo_env.mjs` now prevents a repeat.
