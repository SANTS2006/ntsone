import { and, count, countDistinct, desc, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { documentVerifications, programs, registrations, users } from "../../db/schema/index.js";
import { listAccessibleProgramIds } from "../programs/access.js";
import type { AuthenticatedUser } from "../users/types.js";

const NO_PROGRAM = "00000000-0000-0000-0000-000000000000";
const TREND_DAYS = 30;

/** Restricts a query to the programs this person can see. */
function scopeTo(column: typeof programs.id | typeof registrations.programId | typeof documentVerifications.programId, ids: string[] | "all"): SQL | undefined {
  if (ids === "all") return undefined;
  return inArray(column, ids.length ? ids : [NO_PROGRAM]);
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Dashboard figures beyond the basic counts: ID card and ticket check-ins, review
 * progress, per-program performance, and what happened most recently.
 */
export async function getInsights(user: AuthenticatedUser) {
  const ids = await listAccessibleProgramIds(user);
  const programScope = and(isNull(programs.deletedAt), scopeTo(programs.id, ids));
  const registrationScope = scopeTo(registrations.programId, ids);
  const scanScope = scopeTo(documentVerifications.programId, ids);

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86_400_000);
  const trendStart = new Date(startOfToday.getTime() - (TREND_DAYS - 1) * 86_400_000);
  const documentsOn = sql`(${programs.idCardEnabled} or ${programs.ticketEnabled})`;

  const [
    [documentRow],
    [scanRow],
    [eligibleRow],
    [reviewRow],
    trendRows,
    programRows,
    scanByProgram,
    recentScans,
    recentRegistrations,
  ] = await Promise.all([
    db
      .select({
        idCardPrograms: sql<number>`count(*) filter (where ${programs.idCardEnabled})`,
        ticketPrograms: sql<number>`count(*) filter (where ${programs.ticketEnabled})`,
      })
      .from(programs)
      .where(programScope),
    db
      .select({
        total: count(),
        today: sql<number>`count(*) filter (where ${documentVerifications.createdAt} >= ${startOfToday})`,
        week: sql<number>`count(*) filter (where ${documentVerifications.createdAt} >= ${startOfWeek})`,
        people: countDistinct(documentVerifications.registrationId),
        invalid: sql<number>`count(*) filter (where ${documentVerifications.valid} = false)`,
        idCards: sql<number>`count(*) filter (where ${documentVerifications.documentType} = 'id_card')`,
        tickets: sql<number>`count(*) filter (where ${documentVerifications.documentType} = 'ticket')`,
      })
      .from(documentVerifications)
      .where(scanScope),
    // Registrations that have a card or ticket to scan: the base for the check-in rate.
    db
      .select({ value: count() })
      .from(registrations)
      .innerJoin(programs, eq(programs.id, registrations.programId))
      .where(and(registrationScope, isNull(programs.deletedAt), documentsOn)),
    db
      .select({
        pending: sql<number>`count(*) filter (where ${registrations.status} in ('submitted', 'under_review'))`,
        approved: sql<number>`count(*) filter (where ${registrations.status} = 'approved')`,
        decided: sql<number>`count(*) filter (where ${registrations.status} in ('approved', 'rejected'))`,
      })
      .from(registrations)
      .where(registrationScope),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${documentVerifications.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        value: count(),
      })
      .from(documentVerifications)
      .where(and(scanScope, gte(documentVerifications.createdAt, trendStart)))
      .groupBy(sql`1`),
    db
      .select({
        id: programs.id,
        name: programs.name,
        status: programs.status,
        idCardEnabled: programs.idCardEnabled,
        ticketEnabled: programs.ticketEnabled,
        registrations: sql<number>`count(${registrations.id})`,
        thisWeek: sql<number>`count(${registrations.id}) filter (where ${registrations.submittedAt} >= ${startOfWeek})`,
        approved: sql<number>`count(${registrations.id}) filter (where ${registrations.status} = 'approved')`,
      })
      .from(programs)
      .leftJoin(registrations, eq(registrations.programId, programs.id))
      .where(programScope)
      .groupBy(programs.id)
      .orderBy(desc(sql`count(${registrations.id})`))
      .limit(8),
    db
      .select({
        programId: documentVerifications.programId,
        scans: count(),
        people: countDistinct(documentVerifications.registrationId),
      })
      .from(documentVerifications)
      .where(scanScope)
      .groupBy(documentVerifications.programId),
    db
      .select({
        id: documentVerifications.id,
        programId: documentVerifications.programId,
        programName: programs.name,
        registrationId: documentVerifications.registrationId,
        applicantName: registrations.applicantName,
        registrationNumber: registrations.registrationNumber,
        documentType: documentVerifications.documentType,
        valid: documentVerifications.valid,
        createdAt: documentVerifications.createdAt,
        verifiedByName: users.name,
      })
      .from(documentVerifications)
      .innerJoin(registrations, eq(registrations.id, documentVerifications.registrationId))
      .innerJoin(programs, eq(programs.id, documentVerifications.programId))
      .leftJoin(users, eq(users.id, documentVerifications.verifiedBy))
      .where(scanScope)
      .orderBy(desc(documentVerifications.createdAt))
      .limit(8),
    db
      .select({
        id: registrations.id,
        programId: registrations.programId,
        programName: programs.name,
        applicantName: registrations.applicantName,
        registrationNumber: registrations.registrationNumber,
        status: registrations.status,
        submittedAt: registrations.submittedAt,
      })
      .from(registrations)
      .innerJoin(programs, eq(programs.id, registrations.programId))
      .where(and(registrationScope, isNull(programs.deletedAt)))
      .orderBy(desc(registrations.submittedAt))
      .limit(6),
  ]);

  const n = (value: unknown) => Number(value ?? 0);
  const scansByDay = new Map(trendRows.map((row) => [row.day, n(row.value)]));
  const scanTrend = Array.from({ length: TREND_DAYS }, (_, i) => {
    const date = isoDay(new Date(trendStart.getTime() + i * 86_400_000));
    return { date, count: scansByDay.get(date) ?? 0 };
  });
  const scanStats = new Map(scanByProgram.map((row) => [row.programId, { scans: n(row.scans), people: n(row.people) }]));

  const eligible = n(eligibleRow?.value);
  const people = n(scanRow?.people);
  const decided = n(reviewRow?.decided);

  return {
    documents: {
      idCardPrograms: n(documentRow?.idCardPrograms),
      ticketPrograms: n(documentRow?.ticketPrograms),
    },
    verification: {
      totalScans: n(scanRow?.total),
      scansToday: n(scanRow?.today),
      scansThisWeek: n(scanRow?.week),
      peopleVerified: people,
      invalidScans: n(scanRow?.invalid),
      idCardScans: n(scanRow?.idCards),
      ticketScans: n(scanRow?.tickets),
      eligibleRegistrations: eligible,
      checkInRate: eligible ? Math.round((Math.min(people, eligible) / eligible) * 100) : 0,
    },
    review: {
      pending: n(reviewRow?.pending),
      approvalRate: decided ? Math.round((n(reviewRow?.approved) / decided) * 100) : 0,
    },
    scanTrend,
    programs: programRows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      documentsEnabled: row.idCardEnabled || row.ticketEnabled,
      registrations: n(row.registrations),
      registrationsThisWeek: n(row.thisWeek),
      approved: n(row.approved),
      scans: scanStats.get(row.id)?.scans ?? 0,
      peopleVerified: scanStats.get(row.id)?.people ?? 0,
    })),
    recentScans,
    recentRegistrations,
  };
}
