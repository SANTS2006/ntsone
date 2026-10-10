import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import {
  formFields,
  formSections,
  forms,
  programMembers,
  programs,
  registrationFiles,
  registrationStatusHistory,
  registrations,
  users,
} from "../src/db/schema/index.js";
import { hashPassword } from "../src/lib/password.js";
import type { ProgramRole, UserRole } from "../src/modules/users/types.js";

export async function createTestUser(role: UserRole, emailPrefix: string) {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const passwordHash = await hashPassword("TestPassword123!");
  const [user] = await db.insert(users).values({ name: "Test User", email, passwordHash, role }).returning();
  return { user: user!, password: "TestPassword123!" };
}

export async function createTestProgram(createdBy: string, namePrefix: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [program] = await db
    .insert(programs)
    .values({
      name: `${namePrefix} ${suffix}`,
      slug: `${namePrefix.toLowerCase().replace(/\s+/g, "-")}-${suffix}`,
      status: "published",
      registrationEnabled: true,
      createdBy,
    })
    .returning();
  return program!;
}

export async function addMembership(userId: string, programId: string, role: ProgramRole) {
  await db.insert(programMembers).values({ userId, programId, roleOnProgram: role });
}

export async function createPublishedForm(programId: string) {
  const [form] = await db
    .insert(forms)
    .values({ programId, version: 1, status: "published", publishedAt: new Date(), title: "Test Form" })
    .returning();

  const [section] = await db
    .insert(formSections)
    .values({ formId: form!.id, title: "Info", orderIndex: 0 })
    .returning();

  await db.insert(formFields).values({
    formId: form!.id,
    sectionId: section!.id,
    fieldKey: "full_name",
    type: "short_text",
    label: "Full Name",
    required: true,
    orderIndex: 0,
    config: {},
  });
  await db.insert(formFields).values({
    formId: form!.id,
    sectionId: section!.id,
    fieldKey: "email",
    type: "email",
    label: "Email",
    required: true,
    orderIndex: 1,
    config: {},
  });

  return form!;
}

export async function createTestRegistration(programId: string, formId: string, regNumber: string) {
  const [registration] = await db
    .insert(registrations)
    .values({
      programId,
      formId,
      registrationNumber: regNumber,
      applicantName: "Test Applicant",
      applicantEmail: "applicant@test.local",
      responses: { full_name: "Test Applicant", email: "applicant@test.local" },
    })
    .returning();
  return registration!;
}

export async function deleteTestProgram(programId: string) {
  const programForms = await db.select({ id: forms.id }).from(forms).where(eq(forms.programId, programId));
  const programRegistrations = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(eq(registrations.programId, programId));

  for (const registration of programRegistrations) {
    await db.delete(registrationStatusHistory).where(eq(registrationStatusHistory.registrationId, registration.id));
    await db.delete(registrationFiles).where(eq(registrationFiles.registrationId, registration.id));
  }
  await db.delete(registrations).where(eq(registrations.programId, programId));

  for (const form of programForms) {
    await db.delete(formFields).where(eq(formFields.formId, form.id));
    await db.delete(formSections).where(eq(formSections.formId, form.id));
  }
  await db.delete(forms).where(eq(forms.programId, programId));

  await db.delete(programMembers).where(eq(programMembers.programId, programId));
  await db.delete(programs).where(eq(programs.id, programId));
}

export async function deleteTestUser(userId: string) {
  await db.delete(programMembers).where(eq(programMembers.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}
