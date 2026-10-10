import { pgTable, uuid, text, timestamp, integer, bigint, jsonb, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pollPositions, polls, voterAccounts } from "./polls";
import { programs } from "./programs";
import { registrations } from "./registrations";
import { tenants } from "./tenants";
import { users } from "./users";

// All money is stored as whole minor units (1 Leone = 100), never as decimals.
const money = (name: string) => bigint(name, { mode: "number" });

/** One attempt to collect money for a registration or an order. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    // A payment is for a registration or order (program and registration), or for votes in a poll (poll, voter and position).
    programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
    registrationId: uuid("registration_id").references(() => registrations.id, { onDelete: "cascade" }),
    pollId: uuid("poll_id").references(() => polls.id, { onDelete: "restrict" }),
    voterId: uuid("voter_id").references(() => voterAccounts.id, { onDelete: "restrict" }),
    pollPositionId: uuid("poll_position_id").references(() => pollPositions.id, { onDelete: "set null" }),
    // Votes this payment bought, and when they were used (once, for one candidate).
    votesBought: integer("votes_bought"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    // "registration" (fee, ID card, ticket), "order" (goods from the order form) or "vote" (votes in a poll).
    purpose: text("purpose").notNull(),
    // pending -> completed | failed | expired | cancelled, or review when what was paid doesn't match what was asked.
    status: text("status").notNull().default("pending"),
    currency: text("currency").notNull().default("SLE"),
    amountMinor: money("amount_minor").notNull(),
    // What the platform keeps, and what the organization is credited.
    feeMinor: money("fee_minor").notNull().default(0),
    netMinor: money("net_minor").notNull().default(0),
    // The items charged, as they were when the payment was made (names and prices at that moment).
    lineItems: jsonb("line_items").notNull().default([]),
    provider: text("provider").notNull().default("monime"),
    checkoutSessionId: text("checkout_session_id"),
    providerOrderNumber: text("provider_order_number"),
    // Where to send the payer to pay; kept so an unfinished payment can be resumed.
    redirectUrl: text("redirect_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    payerName: text("payer_name"),
    payerEmail: text("payer_email"),
    payerPhone: text("payer_phone"),
    // How it was paid, as reported by the provider (masked phone, provider, reference).
    channel: jsonb("channel"),
    providerPaymentId: text("provider_payment_id"),
    providerFees: jsonb("provider_fees"),
    // Fraud signals noted when it was created or settled: { flags: string[] }.
    risk: jsonb("risk").notNull().default({}),
    failureReason: text("failure_reason"),
    // How much has been sent back to the payer (refunds that are on their way or done).
    refundedMinor: money("refunded_minor").notNull().default(0),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    index("payments_registration_idx").on(table.registrationId),
    index("payments_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
    index("payments_program_idx").on(table.programId, table.createdAt),
    index("payments_poll_idx").on(table.pollId, table.createdAt),
    index("payments_voter_idx").on(table.voterId, table.pollId),
    index("payments_pending_idx").on(table.status, table.createdAt),
    uniqueIndex("payments_checkout_session_idx").on(table.checkoutSessionId).where(sql`${table.checkoutSessionId} is not null`),
    index("payments_ip_idx").on(table.ipAddress, table.createdAt),
    index("payments_email_idx").on(table.payerEmail, table.createdAt),
  ],
);

/** Every notification Monime sends us, once. The event id is unique, so a replayed or retried event is recognised. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull(),
    name: text("name").notNull(),
    objectId: text("object_id"),
    // true: the signature checked out; false: it did not; null: not checked (no secret, or no signature).
    signatureValid: boolean("signature_valid"),
    outcome: text("outcome").notNull().default("received"),
    ipAddress: text("ip_address"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("payment_events_event_idx").on(table.eventId), index("payment_events_received_idx").on(table.receivedAt)],
);

/**
 * An organization's money, as an append-only ledger. A balance is the sum of its entries; nothing is
 * ever edited. Credits can wait until `availableAt` before they can be withdrawn.
 */
export const walletEntries = pgTable(
  "wallet_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null: the platform's own money (the fees it keeps), not an organization's.
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    // payment (+), fee (-), payout (-), payout_reversal (+), refund (-), fee_refund (+), refund_reversal (+), fee_refund_reversal (-);
    // platform entries: platform_fee (+), platform_fee_refund (-), platform_payout (-), platform_payout_reversal (+), ...
    kind: text("kind").notNull(),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull().default("SLE"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    payoutId: uuid("payout_id"),
    refundId: uuid("refund_id"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wallet_entries_tenant_idx").on(table.tenantId, table.createdAt),
    // A payment can be credited once, and charged its fee once, however many times it is processed.
    uniqueIndex("wallet_entries_payment_kind_idx").on(table.paymentId, table.kind).where(sql`${table.paymentId} is not null`),
    uniqueIndex("wallet_entries_payout_kind_idx").on(table.payoutId, table.kind).where(sql`${table.payoutId} is not null`),
    uniqueIndex("wallet_entries_refund_kind_idx").on(table.refundId, table.kind).where(sql`${table.refundId} is not null`),
  ],
);

/** Where an organization withdraws its money to: a mobile money number or a bank account. */
export const payoutAccounts = pgTable(
  "payout_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null: where the platform itself withdraws its fees to.
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    providerId: text("provider_id").notNull(),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name").notNull(),
    // A new account can't receive money until this time, so a stolen session can't cash out at once.
    usableAfter: timestamp("usable_after", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [index("payout_accounts_tenant_idx").on(table.tenantId)],
);

/** A withdrawal of an organization's money. */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null: a withdrawal of the platform's own money.
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => payoutAccounts.id, { onDelete: "restrict" }),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull().default("SLE"),
    // pending_review -> queued -> processing -> completed | failed;  or cancelled / rejected.
    status: text("status").notNull().default("queued"),
    providerPayoutId: text("provider_payout_id"),
    failureReason: text("failure_reason"),
    attempts: integer("attempts").notNull().default(0),
    risk: jsonb("risk").notNull().default({}),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("payouts_tenant_idx").on(table.tenantId, table.createdAt), index("payouts_status_idx").on(table.status, table.updatedAt)],
);

/**
 * Money sent back to someone who paid. It leaves the organization's balance when requested (so it can't be spent twice),
 * is sent to the payer's mobile money number through Monime, and comes back to the balance if that fails.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    amountMinor: money("amount_minor").notNull(),
    // The part of the platform's fee that goes back with it (in proportion), so the organization isn't charged a fee on money it gave back.
    feeRefundMinor: money("fee_refund_minor").notNull().default(0),
    currency: text("currency").notNull().default("SLE"),
    reason: text("reason").notNull(),
    // Where the money is sent: a mobile money provider (m17, m18) and number.
    providerId: text("provider_id").notNull(),
    phoneNumber: text("phone_number").notNull(),
    // pending_review -> queued -> processing -> completed | failed;  or rejected.
    status: text("status").notNull().default("queued"),
    providerPayoutId: text("provider_payout_id"),
    failureReason: text("failure_reason"),
    attempts: integer("attempts").notNull().default(0),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("refunds_payment_idx").on(table.paymentId), index("refunds_tenant_idx").on(table.tenantId, table.createdAt), index("refunds_status_idx").on(table.status, table.updatedAt)],
);
