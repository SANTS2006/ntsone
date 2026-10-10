import { and, count, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { programs, registrations } from "../../db/schema/index.js";
import { listAccessibleProgramIds } from "../programs/access.js";
import type { AuthenticatedUser } from "../users/types.js";

export async function getOverview(user: AuthenticatedUser) {
  const accessible = await listAccessibleProgramIds(user);
  const programScope = accessible === "all" ? isNull(programs.deletedAt) : and(isNull(programs.deletedAt), inArray(programs.id, accessible));
  const registrationScope =
    accessible === "all" ? undefined : accessible.length === 0 ? eq(registrations.programId, "00000000-0000-0000-0000-000000000000") : inArray(registrations.programId, accessible);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    [totalProgramsRow],
    [publishedProgramsRow],
    [closedProgramsRow],
    [totalRegistrationsRow],
    [todayRow],
    [weekRow],
    [monthRow],
    statusRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(programs).where(programScope),
    db.select({ value: count() }).from(programs).where(and(programScope, eq(programs.status, "published"))),
    db.select({ value: count() }).from(programs).where(and(programScope, eq(programs.status, "closed"))),
    db.select({ value: count() }).from(registrations).where(registrationScope),
    db
      .select({ value: count() })
      .from(registrations)
      .where(registrationScope ? and(registrationScope, gte(registrations.submittedAt, startOfToday)) : gte(registrations.submittedAt, startOfToday)),
    db
      .select({ value: count() })
      .from(registrations)
      .where(registrationScope ? and(registrationScope, gte(registrations.submittedAt, startOfWeek)) : gte(registrations.submittedAt, startOfWeek)),
    db
      .select({ value: count() })
      .from(registrations)
      .where(registrationScope ? and(registrationScope, gte(registrations.submittedAt, startOfMonth)) : gte(registrations.submittedAt, startOfMonth)),
    db
      .select({ status: registrations.status, value: count() })
      .from(registrations)
      .where(registrationScope)
      .groupBy(registrations.status),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) byStatus[row.status] = Number(row.value);

  return {
    totalPrograms: Number(totalProgramsRow?.value ?? 0),
    activePrograms: Number(publishedProgramsRow?.value ?? 0),
    closedPrograms: Number(closedProgramsRow?.value ?? 0),
    totalRegistrations: Number(totalRegistrationsRow?.value ?? 0),
    registrationsToday: Number(todayRow?.value ?? 0),
    registrationsThisWeek: Number(weekRow?.value ?? 0),
    registrationsThisMonth: Number(monthRow?.value ?? 0),
    byStatus,
  };
}
