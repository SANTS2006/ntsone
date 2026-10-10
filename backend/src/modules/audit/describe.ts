// Turns a request into words a person can read. Every route the system has is listed here; anything new that is not
// listed still gets a sensible description (see the end of this file), so nothing is ever left out of the log.

type Entry = [action: string, label: string, entityType?: string];

const ROUTES: Record<string, Entry> = {
  // ---- signing in and your own account
  "POST /api/auth/login": ["auth.login", "Signed in"],
  "POST /api/auth/logout": ["auth.logout", "Signed out"],
  "POST /api/auth/register": ["auth.register", "Created an account", "tenant"],
  "POST /api/auth/refresh": ["auth.refresh", "Renewed the sign-in session"],
  "POST /api/auth/verify-email": ["auth.verify_email", "Confirmed their email address"],
  "POST /api/auth/verify-email/resend": ["auth.verify_email_resend", "Asked for a new email confirmation code"],
  "POST /api/auth/forgot-password": ["auth.forgot_password", "Asked for a password reset"],
  "POST /api/auth/reset-password": ["auth.reset_password", "Reset their password"],
  "POST /api/auth/me/change-password": ["auth.change_password", "Changed their password"],
  "POST /api/auth/me/email": ["auth.change_email_request", "Asked to change their email address"],
  "POST /api/auth/me/email/confirm": ["auth.change_email_confirm", "Confirmed a new email address"],
  "POST /api/auth/me/own-space": ["auth.own_space", "Opened their own space", "tenant"],
  "POST /api/auth/me/avatar-upload-signature": ["auth.avatar_upload", "Started a profile photo upload"],
  "PATCH /api/auth/me": ["user.update_profile", "Updated their profile", "user"],
  "PATCH /api/auth/me/organization": ["organization.rename", "Changed the organization's name", "tenant"],
  "GET /api/auth/me/organization": ["organization.view", "Viewed the organization's details", "tenant"],

  // ---- programs
  "POST /api/programs": ["program.create", "Created a program", "program"],
  "PATCH /api/programs/:programId": ["program.update", "Updated a program", "program"],
  "DELETE /api/programs/:programId": ["program.delete", "Deleted a program", "program"],
  "POST /api/programs/:programId/publish": ["program.publish", "Published a program", "program"],
  "POST /api/programs/:programId/unpublish": ["program.unpublish", "Unpublished a program", "program"],
  "POST /api/programs/:programId/archive": ["program.archive", "Archived a program", "program"],
  "POST /api/programs/:programId/duplicate": ["program.duplicate", "Duplicated a program", "program"],
  "POST /api/programs/:programId/registration/close": ["program.close_registration", "Closed registration", "program"],
  "POST /api/programs/:programId/registration/reopen": ["program.reopen_registration", "Reopened registration", "program"],
  "POST /api/programs/:programId/thumbnail": ["program.thumbnail", "Changed the program picture", "program"],
  "POST /api/programs/:programId/uploads/signature": ["program.upload", "Started a file upload for a program", "program"],
  "PUT /api/programs/:programId/payment-config": ["program.payment_config", "Changed the program's payment settings", "program"],
  "GET /api/programs/:programId": ["program.view", "Opened a program", "program"],
  "GET /api/programs/:programId/members": ["program.members_view", "Viewed who has access to a program", "program"],
  "POST /api/programs/:programId/members": ["program.member_add", "Gave someone access to a program", "program"],
  "PATCH /api/programs/:programId/members/:userId": ["program.member_update", "Changed someone's access to a program", "program"],
  "DELETE /api/programs/:programId/members/:userId": ["program.member_remove", "Removed someone's access to a program", "program"],

  // ---- forms
  "POST /api/programs/:programId/form": ["form.save", "Saved the registration form", "form"],
  "POST /api/programs/:programId/form/publish": ["form.publish", "Published the registration form", "form"],
  "GET /api/programs/:programId/form": ["form.view", "Opened the form builder", "form"],
  "GET /api/programs/:programId/form/preview": ["form.preview", "Previewed the registration form", "form"],

  // ---- registrations and orders
  "PATCH /api/programs/:programId/registrations/:registrationId/status": ["registration.status", "Changed the status of a registration or order", "registration"],
  "PATCH /api/programs/:programId/registrations/:registrationId": ["registration.edit", "Edited a registration's answers", "registration"],
  "PATCH /api/programs/:programId/registrations/:registrationId/document-overrides": ["registration.document_overrides", "Changed a registrant's ID card details", "registration"],
  "POST /api/programs/:programId/registrations/:registrationId/waive-payment": ["registration.waive_payment", "Waived a payment", "registration"],
  "POST /api/programs/:programId/registrations/import": ["registration.import", "Imported registrations from a file", "program"],
  "POST /api/programs/:programId/registrations/import/preview": ["registration.import_preview", "Previewed a file import", "program"],
  "GET /api/programs/:programId/registrations/import/template": ["registration.import_template", "Downloaded the import template", "program"],
  "GET /api/programs/:programId/registrations/:registrationId": ["registration.view", "Opened a registration or order", "registration"],
  "GET /api/programs/:programId/registrations/export": ["registration.export", "Exported registrations", "program"],
  "GET /api/programs/:programId/registrations/:registrationId/summary.pdf": ["registration.download_summary", "Downloaded a registration's details PDF", "registration"],
  "GET /api/programs/:programId/registrations/:registrationId/files/:fileId/download": ["registration.download_file", "Downloaded a file a registrant uploaded", "registration"],
  "GET /api/programs/:programId/registrations/:registrationId/id-card": ["registration.download_id_card", "Downloaded a registrant's ID card", "registration"],
  "GET /api/programs/:programId/registrations/:registrationId/ticket": ["registration.download_ticket", "Downloaded a registrant's ticket", "registration"],
  "PATCH /api/programs/:programId/id-card/config": ["program.id_card_config", "Changed the ID card design", "program"],
  "PATCH /api/programs/:programId/ticket/config": ["program.ticket_config", "Changed the ticket design", "program"],
  "GET /api/programs/:programId/verifications/export": ["verification.export", "Exported the verification log", "program"],
  "GET /api/programs/:programId/payments": ["payment.list_view", "Viewed a program's payments", "program"],

  // ---- the live registration and order pages (no sign-in)
  "GET /api/public/programs/:slug": ["public.program_view", "Opened a public program page", "program"],
  "GET /api/public/programs/:slug/form": ["public.form_view", "Opened the live registration or order form", "program"],
  "POST /api/public/programs/:slug/registrations": ["public.submit", "Submitted a registration or order", "program"],
  "POST /api/public/uploads/signature": ["public.upload", "Started uploading a file on a live form", "program"],
  "GET /api/public/programs/:slug/registrations/:registrationNumber/id-card": ["public.download_id_card", "Downloaded their ID card", "registration"],
  "GET /api/public/programs/:slug/registrations/:registrationNumber/ticket": ["public.download_ticket", "Downloaded their ticket", "registration"],
  "GET /api/public/submissions/:token": ["public.submission_view", "Viewed a copy of a submission", "registration"],
  "GET /api/public/submissions/:token/pdf": ["public.submission_download", "Downloaded a copy of a submission", "registration"],
  "GET /api/public/verify/:slug/:registrationNumber": ["public.verify", "Scanned or opened a verification link", "registration"],
  "GET /api/public/payments/:token": ["public.payment_view", "Viewed a payment", "payment"],
  "POST /api/public/payments/:token/retry": ["public.payment_retry", "Tried a payment again", "payment"],
  "POST /api/public/client-errors": ["public.client_error", "A browser reported an error"],
  "POST /api/platform/backups": ["backup.request_create", "Asked for a database backup", "backup"],
  "PUT /api/platform/backups/policy": ["backup.request_policy", "Changed the backup retention policy", "backup"],
  "POST /api/platform/backups/:backupId/verify": ["backup.request_verify", "Asked to verify a backup", "backup"],
  "DELETE /api/platform/backups/:backupId": ["backup.request_delete", "Asked to delete a backup", "backup"],
  "POST /api/platform/backups/:backupId/download": ["backup.request_download", "Downloaded a backup file", "backup"],
  "POST /api/platform/backups/restores": ["restore.request", "Asked to restore the database", "backup"],
  "POST /api/wishlists": ["wishlist.create", "Created a wish list", "wishlist"],
  "PATCH /api/wishlists/:wishlistId": ["wishlist.update", "Changed a wish list", "wishlist"],
  "DELETE /api/wishlists/:wishlistId": ["wishlist.remove", "Removed a wish list", "wishlist"],
  "POST /api/wishlists/:wishlistId/items": ["wishlist.add_items", "Added items to a wish list", "wishlist"],
  "POST /api/wishlists/:wishlistId/items/gotten": ["wishlist.mark_gotten", "Marked wish list items as gotten", "wishlist"],
  "PATCH /api/wishlists/:wishlistId/items/:itemId": ["wishlist.update_item", "Changed a wish list item", "wish_item"],
  "POST /api/wishlists/:wishlistId/items/:itemId/ungot": ["wishlist.unmark_gotten", "Moved an item back to the wish list", "wish_item"],
  "POST /api/wishlists/:wishlistId/items/:itemId/restore": ["wishlist.restore_item", "Restored a wish list item", "wish_item"],
  "DELETE /api/wishlists/:wishlistId/items/:itemId": ["wishlist.remove_item", "Removed a wish list item", "wish_item"],
  "GET /api/wishlists/:wishlistId/export": ["wishlist.export", "Exported a wish list", "wishlist"],
  "POST /api/wishlists/:wishlistId/shares": ["wishlist.share_create", "Invited someone to a wish list", "wishlist"],
  "PATCH /api/wishlists/:wishlistId/shares/:shareId": ["wishlist.share_update", "Changed who can open a wish list", "wishlist"],
  "DELETE /api/wishlists/:wishlistId/shares/:shareId": ["wishlist.share_revoke", "Removed someone's access to a wish list", "wishlist"],
  "POST /api/wishlists/:wishlistId/shares/:shareId/reset": ["wishlist.share_reset", "Made a new link for a shared wish list", "wishlist"],
  "POST /api/wishlists/:wishlistId/shares/:shareId/email": ["wishlist.share_email", "Emailed a wish list invitation", "wishlist"],
  "POST /api/public/wish/:token/items": ["wishlist.shared_add_items", "Added items to a shared wish list", "wishlist"],
  "POST /api/public/wish/:token/items/gotten": ["wishlist.shared_mark_gotten", "Marked items gotten on a shared wish list", "wishlist"],
  "PATCH /api/public/wish/:token/items/:itemId": ["wishlist.shared_update_item", "Changed an item on a shared wish list", "wish_item"],
  "POST /api/public/wish/:token/items/:itemId/ungot": ["wishlist.shared_unmark_gotten", "Moved an item back on a shared wish list", "wish_item"],
  "POST /api/public/wish/:token/items/:itemId/restore": ["wishlist.shared_restore_item", "Restored an item on a shared wish list", "wish_item"],
  "DELETE /api/public/wish/:token/items/:itemId": ["wishlist.shared_remove_item", "Removed an item on a shared wish list", "wish_item"],
  "GET /api/public/wish/:token/export": ["wishlist.shared_export", "Downloaded a shared wish list", "wishlist"],
  "POST /api/public/contact": ["public.contact", "Sent a message through the contact form"],
  "POST /api/public/reports": ["public.report", "Sent a report"],
  "POST /api/support/feedback": ["support.feedback", "Sent feedback"],
  "POST /api/webhooks/monime": ["payment.webhook", "Received a notification from Monime", "payment"],

  // ---- polls and voting
  "POST /api/polls": ["poll.create", "Created a poll", "poll"],
  "PATCH /api/polls/:pollId": ["poll.update", "Updated a poll", "poll"],
  "DELETE /api/polls/:pollId": ["poll.delete", "Deleted a poll", "poll"],
  "POST /api/polls/:pollId/open": ["poll.open", "Opened voting", "poll"],
  "POST /api/polls/:pollId/close": ["poll.close", "Closed voting", "poll"],
  "PUT /api/polls/:pollId/ballot": ["poll.ballot_save", "Saved the ballot", "poll"],
  "PUT /api/polls/:pollId/verified-voters": ["poll.verified_voters", "Changed the list of verified voters", "poll"],
  "POST /api/polls/:pollId/uploads/signature": ["poll.upload", "Started a file upload for a poll", "poll"],
  "GET /api/polls/:pollId": ["poll.view", "Opened a poll", "poll"],
  "GET /api/polls/:pollId/results": ["poll.results_view", "Viewed poll results", "poll"],
  "GET /api/polls/:pollId/results/export": ["poll.results_export", "Exported poll results", "poll"],
  "GET /api/polls/:pollId/voters": ["poll.voters_view", "Viewed a poll's voters", "poll"],
  "GET /api/polls/:pollId/voters/export": ["poll.voters_export", "Exported a poll's voters", "poll"],
  "GET /api/polls/:pollId/verified-voters": ["poll.verified_voters_view", "Viewed the verified voters list", "poll"],
  "POST /api/polls/:pollId/members": ["poll.member_add", "Gave someone access to a poll", "poll"],
  "PATCH /api/polls/:pollId/members/:userId": ["poll.member_update", "Changed someone's access to a poll", "poll"],
  "DELETE /api/polls/:pollId/members/:userId": ["poll.member_remove", "Removed someone's access to a poll", "poll"],
  "GET /api/voter/polls/:slug": ["voter.poll_view", "Opened a voting page", "poll"],
  "GET /api/voter/polls/:slug/results": ["voter.results_view", "Viewed live poll results", "poll"],
  "GET /api/voter/polls/:slug/session": ["voter.session", "Checked their voter session", "poll"],
  "POST /api/voter/polls/:slug/positions/:positionId/vote": ["voter.vote", "Cast a vote", "poll"],
  "POST /api/voter/auth/register": ["voter.register", "Created a voter account", "poll"],
  "POST /api/voter/auth/login": ["voter.login", "Signed in to vote", "poll"],
  "POST /api/voter/auth/google": ["voter.login_google", "Signed in to vote with Google", "poll"],
  "POST /api/voter/auth/logout": ["voter.logout", "Signed out of voting", "poll"],
  "POST /api/voter/auth/verify": ["voter.verify", "Confirmed their voter email", "poll"],
  "POST /api/voter/auth/resend": ["voter.resend_code", "Asked for a new voter code", "poll"],
  "POST /api/voter/auth/forgot-password": ["voter.forgot_password", "Asked for a voter password reset", "poll"],
  "POST /api/voter/auth/reset-password": ["voter.reset_password", "Reset a voter password", "poll"],

  // ---- businesses, orders, documents
  "POST /api/businesses": ["business.create", "Created a business", "business"],
  "PATCH /api/businesses/:businessId": ["business.update", "Updated a business", "business"],
  "DELETE /api/businesses/:businessId": ["business.delete", "Deleted a business", "business"],
  "PUT /api/businesses/:businessId/statuses": ["business.statuses", "Changed the business's statuses", "business"],
  "PUT /api/businesses/:businessId/settings/:kind": ["business.document_settings", "Changed document settings", "business"],
  "POST /api/businesses/:businessId/uploads/signature": ["business.upload", "Started a file upload for a business", "business"],
  "GET /api/businesses/:businessId": ["business.view", "Opened a business", "business"],
  "GET /api/businesses/:businessId/analytics/export": ["business.analytics_export", "Exported business analytics", "business"],
  "POST /api/businesses/:businessId/members": ["business.member_add", "Gave someone access to a business", "business"],
  "PATCH /api/businesses/:businessId/members/:userId": ["business.member_update", "Changed someone's access to a business", "business"],
  "DELETE /api/businesses/:businessId/members/:userId": ["business.member_remove", "Removed someone's access to a business", "business"],
  "POST /api/businesses/:businessId/:kind": ["document.create", "Created an invoice, receipt or quotation", "document"],
  "PUT /api/businesses/:businessId/:kind/:documentId": ["document.update", "Updated an invoice, receipt or quotation", "document"],
  "DELETE /api/businesses/:businessId/:kind/:documentId": ["document.delete", "Deleted an invoice, receipt or quotation", "document"],
  "POST /api/businesses/:businessId/:kind/:documentId/send": ["document.send", "Emailed an invoice, receipt or quotation", "document"],
  "GET /api/businesses/:businessId/:kind/:documentId": ["document.view", "Opened an invoice, receipt or quotation", "document"],
  "GET /api/businesses/:businessId/:kind/:documentId/pdf": ["document.download", "Downloaded an invoice, receipt or quotation", "document"],
  "GET /api/businesses/:businessId/:kind/export": ["document.export", "Exported invoices, receipts or quotations", "business"],
  "POST /api/businesses/:businessId/cards": ["card.create", "Created a business card", "card"],
  "PUT /api/businesses/:businessId/cards/:cardId": ["card.update", "Updated a business card", "card"],
  "DELETE /api/businesses/:businessId/cards/:cardId": ["card.delete", "Deleted a business card", "card"],
  "POST /api/businesses/:businessId/cards/:cardId/send": ["card.send", "Emailed a business card", "card"],
  "GET /api/businesses/:businessId/cards/:cardId": ["card.view", "Opened a business card", "card"],
  "GET /api/businesses/:businessId/cards/:cardId/pdf": ["card.download", "Downloaded a business card", "card"],
  "GET /api/businesses/:businessId/cards/export": ["card.export", "Exported business cards", "business"],

  // ---- the team
  "POST /api/users": ["user.create", "Added a team member", "user"],
  "PATCH /api/users/:userId": ["user.update", "Updated a team member", "user"],
  "DELETE /api/users/:userId": ["user.remove", "Removed a team member", "user"],
  "POST /api/users/:userId/programs": ["user.program_access_add", "Gave a team member access to a program", "user"],
  "DELETE /api/users/:userId/programs/:programId": ["user.program_access_remove", "Removed a team member's access to a program", "user"],
  "POST /api/users/:userId/polls": ["user.poll_access_add", "Gave a team member access to a poll", "user"],
  "DELETE /api/users/:userId/polls/:pollId": ["user.poll_access_remove", "Removed a team member's access to a poll", "user"],
  "POST /api/users/:userId/businesses": ["user.business_access_add", "Gave a team member access to a business", "user"],
  "DELETE /api/users/:userId/businesses/:businessId": ["user.business_access_remove", "Removed a team member's access to a business", "user"],
  "GET /api/users/export": ["user.export", "Exported the team list", "tenant"],

  // ---- the payment fund
  "POST /api/funds/accounts": ["fund.account_add", "Added a withdrawal account", "payout_account"],
  "POST /api/funds/accounts/:accountId/remove": ["fund.account_remove", "Removed a withdrawal account", "payout_account"],
  "POST /api/funds/payouts": ["fund.withdraw", "Requested a withdrawal", "payout"],
  "POST /api/funds/payouts/:payoutId/cancel": ["fund.withdraw_cancel", "Cancelled a withdrawal", "payout"],
  "GET /api/funds": ["fund.view", "Viewed the payment fund", "tenant"],
  "GET /api/funds/entries": ["fund.ledger_view", "Viewed the fund's money in and out", "tenant"],
  "GET /api/funds/payouts": ["fund.withdrawals_view", "Viewed the fund's withdrawals", "tenant"],

  "PUT /api/polls/:pollId/payment-config": ["poll.payment_config", "Changed the poll's payment settings", "poll"],
  "POST /api/polls/:pollId/payments/:paymentId/refund": ["refund.request", "Requested a refund", "payment"],
  "GET /api/polls/:pollId/payments/:paymentId/refunds": ["refund.view", "Viewed the refunds of a payment", "payment"],
  "POST /api/voter/polls/:slug/positions/:positionId/pay": ["voter.pay_votes", "Started paying for votes", "poll"],
  "POST /api/voter/polls/:slug/credits/:paymentId/vote": ["voter.vote_paid", "Cast paid votes", "poll"],
  "POST /api/programs/:programId/payments/:paymentId/refund": ["refund.request", "Requested a refund", "payment"],
  "GET /api/programs/:programId/payments/:paymentId/refunds": ["refund.view", "Viewed the refunds of a payment", "payment"],
  "GET /api/funds/refunds": ["fund.refunds_view", "Viewed the fund's refunds", "tenant"],

  // ---- bookkeeping
  "POST /api/businesses/:businessId/books/entries": ["book.entry_add", "Wrote an entry in the books", "book_entry"],
  "PATCH /api/businesses/:businessId/books/entries/:entryId": ["book.entry_edit", "Changed an entry in the books", "book_entry"],
  "POST /api/businesses/:businessId/books/entries/:entryId/void": ["book.entry_void", "Voided an entry in the books", "book_entry"],
  "POST /api/businesses/:businessId/books/entries/:entryId/payments": ["book.payment_add", "Wrote down a payment on credit", "book_entry"],
  "POST /api/businesses/:businessId/books/entries/:entryId/payments/:paymentId/void": ["book.payment_void", "Took back a recorded payment", "book_entry"],
  "POST /api/businesses/:businessId/books/loans": ["book.loan_add", "Wrote down a loan", "book_loan"],
  "PATCH /api/businesses/:businessId/books/loans/:loanId": ["book.loan_edit", "Changed a loan", "book_loan"],
  "POST /api/businesses/:businessId/books/loans/:loanId/repayments": ["book.loan_repayment", "Wrote down a loan payment", "book_loan"],
  "POST /api/businesses/:businessId/books/loans/:loanId/write-off": ["book.loan_write_off", "Wrote off a loan", "book_loan"],
  "POST /api/businesses/:businessId/books/loans/:loanId/cancel": ["book.loan_cancel", "Cancelled a loan", "book_loan"],
  "POST /api/businesses/:businessId/books/voice/signature": ["book.voice_upload", "Asked to upload a voice note", "business"],
  "POST /api/businesses/:businessId/books/voice": ["book.voice_add", "Recorded a voice note", "voice_note"],
  "PATCH /api/businesses/:businessId/books/voice/:noteId": ["book.voice_edit", "Changed a voice note", "voice_note"],
  "POST /api/businesses/:businessId/books/voice/:noteId/remove": ["book.voice_remove", "Removed a voice note", "voice_note"],
  "GET /api/businesses/:businessId/books/entries/export": ["book.export", "Exported the cash book", "business"],
  "GET /api/businesses/:businessId/books/reports/export": ["book.report_export", "Exported the books' reports", "business"],

  // ---- the platform team
  "PUT /api/platform/maintenance": ["maintenance.update", "Changed the maintenance notice", "system"],
  "POST /api/platform/maintenance/notify": ["maintenance.notify", "Sent the maintenance notice by email", "system"],
  "GET /api/platform/fund": ["platform_fund.view", "Viewed the platform fund", "system"],
  "GET /api/platform/fund/entries": ["platform_fund.ledger_view", "Viewed the platform fund's money in and out", "system"],
  "GET /api/platform/fund/payouts": ["platform_fund.withdrawals_view", "Viewed the platform fund's withdrawals", "system"],
  "POST /api/platform/fund/accounts": ["platform_fund.account_add", "Added a platform withdrawal account", "payout_account"],
  "POST /api/platform/fund/accounts/:accountId/remove": ["platform_fund.account_remove", "Removed a platform withdrawal account", "payout_account"],
  "POST /api/platform/fund/payouts": ["platform_fund.withdraw", "Requested a withdrawal of platform fees", "payout"],
  "POST /api/platform/fund/payouts/:payoutId/cancel": ["platform_fund.withdraw_cancel", "Cancelled a platform withdrawal", "payout"],
  "POST /api/platform/payments/refunds/:refundId/review": ["platform.refund_review", "Reviewed a refund", "payment"],
  "PATCH /api/platform/users/:userId/status": ["platform.user_status", "Suspended or reactivated a user", "user"],
  "PATCH /api/platform/messages/:messageId": ["platform.message_update", "Updated an inbox message", "message"],
  "GET /api/platform/messages/:messageId": ["platform.message_view", "Opened an inbox message", "message"],
  "GET /api/platform/messages/export": ["platform.messages_export", "Exported the inbox"],
  "GET /api/platform/tenants/:tenantId": ["platform.account_view", "Opened an account", "tenant"],
  "GET /api/platform/tenants/export": ["platform.accounts_export", "Exported the accounts list"],
  "GET /api/platform/tenants/:tenantId/users/export": ["platform.account_users_export", "Exported an account's users", "tenant"],
  "GET /api/platform/tenants/:tenantId/programs/export": ["platform.account_programs_export", "Exported an account's programs", "tenant"],
  "POST /api/platform/payments/payouts/:payoutId/review": ["platform.payout_review", "Reviewed a withdrawal", "payout"],
  "POST /api/platform/payments/payments/:paymentId/recheck": ["platform.payment_recheck", "Re-checked a payment with Monime", "payment"],
  "GET /api/audit-logs/export": ["audit.export", "Exported the audit log"],
  "GET /api/dashboard/export": ["dashboard.export", "Exported the dashboard"],
};

/** Which parameter names an id can arrive in, and what each one is. */
const ENTITY_PARAMS: [param: string, type: string][] = [
  ["shareId", "wishlist_share"],
  ["itemId", "wish_item"],
  ["wishlistId", "wishlist"],
  ["entryId", "book_entry"],
  ["loanId", "book_loan"],
  ["noteId", "voice_note"],
  ["registrationId", "registration"],
  ["registrationNumber", "registration"],
  ["documentId", "document"],
  ["cardId", "card"],
  ["payoutId", "payout"],
  ["refundId", "payment"],
  ["paymentId", "payment"],
  ["accountId", "payout_account"],
  ["messageId", "message"],
  ["positionId", "poll"],
  ["userId", "user"],
  ["programId", "program"],
  ["pollId", "poll"],
  ["businessId", "business"],
  ["tenantId", "tenant"],
  ["slug", "program"],
  ["token", "payment"],
];

export interface RequestDescription {
  action: string;
  label: string;
  entityType: string;
  entityId: string | null;
}

const VERB: Record<string, string> = { GET: "Viewed", POST: "Created or submitted", PUT: "Updated", PATCH: "Updated", DELETE: "Deleted" };

/** Describes a request from its method, the route it matched, and the ids in its address. */
export function describeRequest(method: string, pattern: string, params: Record<string, unknown> = {}): RequestDescription {
  const known = ROUTES[`${method} ${pattern}`];
  // Paths where the id is the thing acted on, in a fixed order of importance.
  const entityParam = ENTITY_PARAMS.find(([name]) => params[name] !== undefined);
  const paramId = entityParam ? String(params[entityParam[0]]).slice(0, 200) : null;
  const inferredType = entityParam ? entityParam[1] : "system";

  if (known) {
    const [action, label, entityType] = known;
    // A signed link (payment, submission) is not worth keeping as an id.
    const entityId = entityParam && entityParam[0] === "token" ? null : paramId;
    return { action, label, entityType: entityType ?? inferredType, entityId };
  }

  // Not listed: describe it from its shape, so a route added later is still recorded in words.
  const words = pattern
    .replace(/^\/api\//, "")
    .split("/")
    .filter((part) => part && !part.startsWith(":"));
  const subject = words.slice(-2).join(" ").replace(/[-_]/g, " ") || "the system";
  return {
    action: `${method.toLowerCase()}.${words.join(".") || "root"}`,
    label: `${VERB[method] ?? method} ${subject}`,
    entityType: inferredType,
    entityId: entityParam && entityParam[0] === "token" ? null : paramId,
  };
}

// Reads that happen all the time in the background (the app refreshes these tables every few seconds) are left out;
// everything else a person can open, download or export is recorded.
const NOISY_GETS = new Set([
  "GET /api/programs/:programId",
  "GET /api/businesses/:businessId",
  "GET /api/polls/:pollId",
  "GET /api/polls/:pollId/voters",
  "GET /api/polls/:pollId/results",
  "GET /api/polls/:pollId/verified-voters",
  "GET /api/programs/:programId/payments",
  "GET /api/funds",
  "GET /api/polls/:pollId/payments",
  "GET /api/polls/:pollId/payments/:paymentId/refunds",
  "GET /api/platform/fund",
  "GET /api/platform/fund/entries",
  "GET /api/platform/fund/payouts",
  "GET /api/funds/refunds",
  "GET /api/programs/:programId/payments/:paymentId/refunds",
  "GET /api/funds/entries",
  "GET /api/funds/payouts",
  "GET /api/voter/polls/:slug/results",
  "GET /api/voter/polls/:slug/session",
  "GET /api/auth/me/organization",
]);

/** True for a read that is worth a line in the log. */
export function isLoggedGet(pattern: string): boolean {
  const key = `GET ${pattern}`;
  return key in ROUTES && !NOISY_GETS.has(key);
}

// Pages visitors open over and over: kept once per visitor per page per ten minutes.
const VIEW_ACTIONS = new Set(["public.program_view", "public.form_view", "public.payment_view", "voter.poll_view"]);
export const isViewEvent = (action: string) => VIEW_ACTIONS.has(action);
