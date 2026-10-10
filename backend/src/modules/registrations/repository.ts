import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  programCounters,
  registrationFiles,
  registrationStatusHistory,
  registrations,
} from "../../db/schema/index.js";
import type { PaginationInput } from "../../lib/pagination.js";
import { toOffsetLimit } from "../../lib/pagination.js";
import type { SubmittedFile } from "./validation.js";

export type RegistrationRow = typeof registrations.$inferSelect;
export type RegistrationStatus = RegistrationRow["status"];

export async function nextRegistrationSequence(programId: string, year: number): Promise<number> {
  const [row] = await db
    .insert(programCounters)
    .values({ programId, year, nextValue: 1 })
    .onConflictDoUpdate({
      target: [programCounters.programId, programCounters.year],
      set: { nextValue: sql`${programCounters.nextValue} + 1` },
    })
    .returning({ nextValue: programCounters.nextValue });
  return row!.nextValue;
}

interface CreateRegistrationInput {
  programId: string;
  formId: string;
  registrationNumber: string;
  applicantName: string | null;
  applicantEmail: string | null;
  applicantPhone: string | null;
  responses: Record<string, unknown>;
  files: SubmittedFile[];
  /** Refuse a second registration with this email in this program (enforced by the database). */
  enforceUniqueEmail?: boolean;
  /** What the first line of the status history says; "Registration submitted" when empty. */
  historyNote?: string;
  /** Set when the registration has to be paid for: it starts as "pending" with the amount due. */
  payment?: { status: string; amountDueMinor: number };
}

export async function createRegistration(input: CreateRegistrationInput): Promise<RegistrationRow> {
  return db.transaction(async (tx) => {
    const [registration] = await tx
      .insert(registrations)
      .values({
        programId: input.programId,
        formId: input.formId,
        registrationNumber: input.registrationNumber,
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail,
        applicantPhone: input.applicantPhone,
        responses: input.responses,
        uniqueEmailGuard: Boolean(input.enforceUniqueEmail && input.applicantEmail),
        ...(input.payment ? { paymentStatus: input.payment.status, amountDueMinor: input.payment.amountDueMinor } : {}),
      })
      .returning();

    if (input.files.length > 0) {
      await tx.insert(registrationFiles).values(
        input.files.map((file) => ({
          registrationId: registration!.id,
          fieldKey: file.fieldKey,
          originalFilename: file.filename,
          cloudinaryPublicId: file.publicId,
          secureUrl: file.url,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        })),
      );
    }

    await tx.insert(registrationStatusHistory).values({
      registrationId: registration!.id,
      fromStatus: null,
      toStatus: "submitted",
      note: input.historyNote ?? "Registration submitted",
    });

    return registration!;
  });
}

export async function findRegistrationInProgram(
  programId: string,
  registrationId: string,
): Promise<RegistrationRow | null> {
  const [row] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.programId, programId), eq(registrations.id, registrationId)))
    .limit(1);
  return row ?? null;
}

export async function findRegistrationById(registrationId: string): Promise<RegistrationRow | null> {
  const [row] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.id, registrationId), isNull(registrations.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function updateDocumentOverrides(registrationId: string, overrides: Record<string, unknown>) {
  await db.update(registrations).set({ documentOverrides: overrides, updatedAt: new Date() }).where(eq(registrations.id, registrationId));
}

/** Whether this email address has already been used to register for the program (any letter case). */
/** Every email already registered for a program (lower case), for spotting duplicates in bulk. */
export async function listRegisteredEmails(programId: string): Promise<Set<string>> {
  const rows = await db
    .select({ email: sql<string>`lower(${registrations.applicantEmail})` })
    .from(registrations)
    .where(and(eq(registrations.programId, programId), sql`${registrations.applicantEmail} is not null`));
  return new Set(rows.map((r) => r.email));
}

/** Existing registrations of a program with any of these emails or registration numbers, newest first. */
export async function findRegistrationsForImport(programId: string, emails: string[], numbers: string[]): Promise<RegistrationRow[]> {
  if (emails.length === 0 && numbers.length === 0) return [];
  const matches = [
    ...(emails.length ? [inArray(sql<string>`lower(${registrations.applicantEmail})`, emails)] : []),
    ...(numbers.length ? [inArray(registrations.registrationNumber, numbers)] : []),
  ];
  return db
    .select()
    .from(registrations)
    .where(and(eq(registrations.programId, programId), or(...matches)))
    .orderBy(desc(registrations.submittedAt));
}

/** Replaces a registration's answers and contact details from an imported document, and notes it in the history. */
export async function updateRegistrationFromImport(
  registration: RegistrationRow,
  values: {
    applicantName: string | null;
    applicantEmail: string | null;
    applicantPhone: string | null;
    responses: Record<string, unknown>;
    enforceUniqueEmail: boolean;
    note: string;
    /** The form the answers now follow; the registration is moved to it. */
    formId?: string;
    changedBy?: string;
  },
): Promise<RegistrationRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(registrations)
      .set({
        applicantName: values.applicantName,
        applicantEmail: values.applicantEmail,
        applicantPhone: values.applicantPhone,
        responses: values.responses,
        ...(values.formId ? { formId: values.formId } : {}),
        uniqueEmailGuard: Boolean(values.enforceUniqueEmail && values.applicantEmail),
      })
      .where(eq(registrations.id, registration.id))
      .returning();
    await tx.insert(registrationStatusHistory).values({
      registrationId: registration.id,
      fromStatus: registration.status,
      toStatus: registration.status,
      changedBy: values.changedBy,
      note: values.note,
    });
    return row!;
  });
}

export async function emailAlreadyRegistered(programId: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(and(eq(registrations.programId, programId), sql`lower(${registrations.applicantEmail}) = ${email.trim().toLowerCase()}`))
    .limit(1);
  return Boolean(row);
}

export async function findRegistrationByNumber(
  programId: string,
  registrationNumber: string,
): Promise<RegistrationRow | null> {
  const [row] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.programId, programId), eq(registrations.registrationNumber, registrationNumber)))
    .limit(1);
  return row ?? null;
}

export async function getRegistrationFiles(registrationId: string) {
  return db.select().from(registrationFiles).where(eq(registrationFiles.registrationId, registrationId));
}

export async function findRegistrationFile(registrationId: string, fileId: string) {
  const [row] = await db
    .select()
    .from(registrationFiles)
    .where(and(eq(registrationFiles.id, fileId), eq(registrationFiles.registrationId, registrationId)))
    .limit(1);
  return row ?? null;
}

export async function getRegistrationHistory(registrationId: string) {
  return db
    .select()
    .from(registrationStatusHistory)
    .where(eq(registrationStatusHistory.registrationId, registrationId))
    .orderBy(desc(registrationStatusHistory.createdAt));
}

export interface RegistrationFilters {
  status?: RegistrationStatus;
  paymentStatus?: "none" | "pending" | "paid" | "review" | "waived" | "refunded";
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: "submittedAt" | "registrationNumber" | "status";
  sortDir?: "asc" | "desc";
}

function buildRegistrationWhere(programId: string, filters: RegistrationFilters) {
  const conditions = [eq(registrations.programId, programId)];

  if (filters.status) conditions.push(eq(registrations.status, filters.status));
  if (filters.paymentStatus) conditions.push(eq(registrations.paymentStatus, filters.paymentStatus));
  if (filters.dateFrom) conditions.push(gte(registrations.submittedAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(registrations.submittedAt, filters.dateTo));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(registrations.registrationNumber, term),
        ilike(registrations.applicantName, term),
        ilike(registrations.applicantEmail, term),
        ilike(registrations.applicantPhone, term),
      )!,
    );
  }

  return and(...conditions);
}

export async function listRegistrations(
  programId: string,
  filters: RegistrationFilters,
  pagination: PaginationInput,
) {
  const where = buildRegistrationWhere(programId, filters);
  const { limit, offset } = toOffsetLimit(pagination);

  const sortColumn =
    filters.sortBy === "registrationNumber"
      ? registrations.registrationNumber
      : filters.sortBy === "status"
        ? registrations.status
        : registrations.submittedAt;
  const orderFn = filters.sortDir === "asc" ? asc : desc;

  const [items, totalRow] = await Promise.all([
    db.select().from(registrations).where(where).orderBy(orderFn(sortColumn)).limit(limit).offset(offset),
    db.select({ value: count() }).from(registrations).where(where),
  ]);

  return { items, total: Number(totalRow[0]?.value ?? 0) };
}

const EXPORT_ROW_CAP = 20_000;

/** Fetches every matching registration (up to a safety cap) for a synchronous export -- no pagination. */
export async function listRegistrationsForExport(
  programId: string,
  filters: RegistrationFilters,
): Promise<RegistrationRow[]> {
  const where = buildRegistrationWhere(programId, filters);
  return db.select().from(registrations).where(where).orderBy(asc(registrations.submittedAt)).limit(EXPORT_ROW_CAP);
}

export async function updateRegistrationStatus(
  registrationId: string,
  fromStatus: RegistrationStatus,
  toStatus: RegistrationStatus,
  changedBy: string,
  note?: string,
): Promise<RegistrationRow> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(registrations)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(eq(registrations.id, registrationId))
      .returning();

    await tx.insert(registrationStatusHistory).values({
      registrationId,
      fromStatus,
      toStatus,
      changedBy,
      note,
    });

    return updated!;
  });
}

export async function getProgramStats(programId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[totalRow], [todayRow], [weekRow], [monthRow], statusRows] = await Promise.all([
    db.select({ value: count() }).from(registrations).where(eq(registrations.programId, programId)),
    db
      .select({ value: count() })
      .from(registrations)
      .where(and(eq(registrations.programId, programId), gte(registrations.submittedAt, startOfToday))),
    db
      .select({ value: count() })
      .from(registrations)
      .where(and(eq(registrations.programId, programId), gte(registrations.submittedAt, startOfWeek))),
    db
      .select({ value: count() })
      .from(registrations)
      .where(and(eq(registrations.programId, programId), gte(registrations.submittedAt, startOfMonth))),
    db
      .select({ status: registrations.status, value: count() })
      .from(registrations)
      .where(eq(registrations.programId, programId))
      .groupBy(registrations.status),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) byStatus[row.status] = Number(row.value);

  return {
    total: Number(totalRow?.value ?? 0),
    today: Number(todayRow?.value ?? 0),
    thisWeek: Number(weekRow?.value ?? 0),
    thisMonth: Number(monthRow?.value ?? 0),
    byStatus,
  };
}
