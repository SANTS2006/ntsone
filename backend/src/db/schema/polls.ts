import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pollStatusEnum, programRoleEnum } from "./enums";
import { tenants } from "./tenants";
import { users } from "./users";

/** A vote, e.g. "SRC Elections 2026", made up of positions that each have candidates. */
export const polls = pgTable(
  "polls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    // Logo or cover picture, also shown on the poll's own sign-in pages.
    imageUrl: text("image_url"),
    status: pollStatusEnum("status").notNull().default("draft"),
    // The poll closes by itself at this moment.
    closesAt: timestamp("closes_at", { withTimezone: true }),
    // Each voter can vote once per position; off lets the same voter vote again.
    onePerEmail: boolean("one_per_email").notNull().default(true),
    // Only voters with an email at one of these domains (comma separated) can vote.
    restrictEmailDomain: boolean("restrict_email_domain").notNull().default(false),
    allowedEmailDomains: text("allowed_email_domains"),
    // Voters see live results on the voting pages.
    showResults: boolean("show_results").notNull().default(true),
    notifyOnVote: boolean("notify_on_vote").notNull().default(true),
    // Only emails the admin has pre-registered as verified voters can create an account and vote.
    verifiedVotersOnly: boolean("verified_voters_only").notNull().default(false),
    // Paid voting: switched on or off, the price of one vote, and whether voters may pay any amount (see payments/pollPayments).
    paymentConfig: jsonb("payment_config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("polls_tenant_id_idx").on(table.tenantId), index("polls_status_idx").on(table.status)],
);

/** One question on the ballot, such as "President". */
export const pollPositions = pgTable(
  "poll_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("poll_positions_poll_id_idx").on(table.pollId)],
);

export const pollCandidates = pgTable(
  "poll_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => pollPositions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("poll_candidates_position_id_idx").on(table.positionId)],
);

/** Team members who can manage (admin) or only see (viewer) a poll. */
export const pollMembers = pgTable(
  "poll_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    roleOnPoll: programRoleEnum("role_on_poll").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("poll_members_user_poll_unique").on(table.userId, table.pollId), index("poll_members_poll_id_idx").on(table.pollId)],
);

/**
 * People who vote. Kept apart from `users`: a voter account only signs in to polls and never
 * reaches the rest of the system. One account works for every poll on the platform.
 */
export const voterAccounts = pgTable("voter_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Stored lower-case.
  email: text("email").notNull().unique(),
  // Null for accounts that only sign in with Google.
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/** One-time codes emailed to confirm a voter's address. */
export const voterEmailCodes = pgTable(
  "voter_email_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voterId: uuid("voter_id")
      .notNull()
      .references(() => voterAccounts.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("voter_email_codes_voter_id_idx").on(table.voterId)],
);

/** The voters of a poll: everyone who has signed in to it. */
/** Emails an admin has pre-registered as eligible to vote in a poll. */
export const pollVerifiedVoters = pgTable(
  "poll_verified_voters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    // As the admin entered it.
    email: text("email").notNull(),
    // The address behind it (no +tags, no Gmail dots), so an alias can't slip past the list.
    emailKey: text("email_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("poll_verified_voters_poll_key_unique").on(table.pollId, table.emailKey), index("poll_verified_voters_poll_id_idx").on(table.pollId)],
);

export const pollVoters = pgTable(
  "poll_voters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    voterId: uuid("voter_id")
      .notNull()
      .references(() => voterAccounts.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("poll_voters_poll_voter_unique").on(table.pollId, table.voterId), index("poll_voters_poll_id_idx").on(table.pollId)],
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => pollPositions.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => pollCandidates.id, { onDelete: "cascade" }),
    voterId: uuid("voter_id")
      .notNull()
      .references(() => voterAccounts.id, { onDelete: "cascade" }),
    // "<position>:e:<canonical email>" when each email may vote once per position, otherwise unique per vote,
    // so the database itself refuses a second vote even if two arrive at the same moment.
    ballotKey: text("ballot_key").notNull(),
    // How many votes this is worth: 1, or the number someone paid for. Results add these up.
    weight: integer("weight").notNull().default(1),
    // The payment these votes were bought with (paid polls). Each payment can be used once, which the unique index enforces.
    paymentId: uuid("payment_id"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("poll_votes_ballot_key_unique").on(table.ballotKey),
    uniqueIndex("poll_votes_payment_unique").on(table.paymentId),
    index("poll_votes_poll_id_idx").on(table.pollId),
    index("poll_votes_position_candidate_idx").on(table.positionId, table.candidateId),
    index("poll_votes_voter_id_idx").on(table.voterId),
  ],
);
