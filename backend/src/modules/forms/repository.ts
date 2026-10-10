import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "../../db/client.js";
import { formFields, formSections, forms } from "../../db/schema/index.js";
import type { FieldInput, SectionInput } from "./schemas.js";

export type FormRow = typeof forms.$inferSelect;
export type SectionRow = typeof formSections.$inferSelect;
export type FieldRow = typeof formFields.$inferSelect;

export interface FormWithContent {
  form: FormRow;
  sections: SectionRow[];
  fields: FieldRow[];
}

export async function getLatestVersionNumber(programId: string): Promise<number> {
  const [row] = await db
    .select({ value: max(forms.version) })
    .from(forms)
    .where(eq(forms.programId, programId));
  return row?.value ?? 0;
}

export async function findDraftForm(programId: string): Promise<FormRow | null> {
  const [row] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.programId, programId), eq(forms.status, "draft")))
    .limit(1);
  return row ?? null;
}

export async function findPublishedForm(programId: string): Promise<FormRow | null> {
  const [row] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.programId, programId), eq(forms.status, "published")))
    .limit(1);
  return row ?? null;
}

export async function findFormById(formId: string): Promise<FormRow | null> {
  const [row] = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
  return row ?? null;
}

export async function listFormVersions(programId: string): Promise<FormRow[]> {
  return db.select().from(forms).where(eq(forms.programId, programId)).orderBy(desc(forms.version));
}

// Optional text fields accept null so an admin can clear them (undefined is skipped by drizzle).
interface FormMetaFields {
  title: string;
  description?: string | null;
  instructions?: string | null;
  confirmationMessage?: string | null;
  requireConsent?: boolean;
  consentText?: string | null;
  consentConditions?: unknown;
  showRegistrationNumber?: boolean;
  orderItems?: unknown;
  registrationNumberConditions?: unknown;
  reviewConfirmEnabled?: boolean;
  reviewConfirmText?: string | null;
  reviewConfirmConditions?: unknown;
  layoutMode?: "stepped" | "single";
}

export async function createDraftForm(
  programId: string,
  version: number,
  defaults: FormMetaFields,
): Promise<FormRow> {
  const [row] = await db
    .insert(forms)
    .values({ programId, version, status: "draft", ...defaults })
    .returning();
  return row!;
}

export async function updateFormMeta(formId: string, values: FormMetaFields): Promise<FormRow> {
  const [row] = await db
    .update(forms)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(forms.id, formId))
    .returning();
  return row!;
}

export async function getContent(formId: string): Promise<{ sections: SectionRow[]; fields: FieldRow[] }> {
  const [sections, fields] = await Promise.all([
    db.select().from(formSections).where(eq(formSections.formId, formId)).orderBy(asc(formSections.orderIndex)),
    db.select().from(formFields).where(eq(formFields.formId, formId)).orderBy(asc(formFields.orderIndex)),
  ]);
  return { sections, fields };
}

export async function getContentForForms(
  formIds: string[],
): Promise<{ sections: SectionRow[]; fields: FieldRow[] }> {
  if (formIds.length === 0) return { sections: [], fields: [] };
  const [sections, fields] = await Promise.all([
    db.select().from(formSections).where(inArray(formSections.formId, formIds)),
    db.select().from(formFields).where(inArray(formFields.formId, formIds)),
  ]);
  return { sections, fields };
}

/** Full replace of a draft form's sections and fields. Never call on a published/archived form. */
export async function replaceDraftContent(
  formId: string,
  sections: SectionInput[],
  fields: FieldInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(formFields).where(eq(formFields.formId, formId));
    await tx.delete(formSections).where(eq(formSections.formId, formId));

    const sectionKeyToId = new Map<string, string>();
    for (const section of sections) {
      const [row] = await tx
        .insert(formSections)
        .values({
          formId,
          title: section.title,
          description: section.description,
          orderIndex: section.orderIndex,
          conditionalLogic: section.conditionalLogic ?? null,
        })
        .returning({ id: formSections.id });
      sectionKeyToId.set(section.key, row!.id);
    }

    if (fields.length > 0) {
      await tx.insert(formFields).values(
        fields.map((field) => ({
          formId,
          sectionId: field.sectionKey ? (sectionKeyToId.get(field.sectionKey) ?? null) : null,
          fieldKey: field.fieldKey,
          type: field.type,
          label: field.label,
          description: field.description,
          placeholder: field.placeholder,
          helpText: field.helpText,
          required: field.required,
          orderIndex: field.orderIndex,
          config: field.config,
          conditionalLogic: field.conditionalLogic ?? null,
        })),
      );
    }
  });
}

export async function copyFormContent(sourceFormId: string, targetFormId: string): Promise<void> {
  const { sections, fields } = await getContent(sourceFormId);

  await db.transaction(async (tx) => {
    const oldToNewSectionId = new Map<string, string>();
    for (const section of sections) {
      const [row] = await tx
        .insert(formSections)
        .values({
          formId: targetFormId,
          title: section.title,
          description: section.description,
          orderIndex: section.orderIndex,
          conditionalLogic: section.conditionalLogic,
        })
        .returning({ id: formSections.id });
      oldToNewSectionId.set(section.id, row!.id);
    }

    if (fields.length > 0) {
      await tx.insert(formFields).values(
        fields.map((field) => ({
          formId: targetFormId,
          sectionId: field.sectionId ? (oldToNewSectionId.get(field.sectionId) ?? null) : null,
          fieldKey: field.fieldKey,
          type: field.type,
          label: field.label,
          description: field.description,
          placeholder: field.placeholder,
          helpText: field.helpText,
          required: field.required,
          orderIndex: field.orderIndex,
          config: field.config,
          conditionalLogic: field.conditionalLogic,
        })),
      );
    }
  });
}

export async function archivePublishedForm(programId: string): Promise<void> {
  await db
    .update(forms)
    .set({ status: "archived" })
    .where(and(eq(forms.programId, programId), eq(forms.status, "published")));
}

export async function publishFormRow(formId: string): Promise<FormRow> {
  const [row] = await db
    .update(forms)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(forms.id, formId))
    .returning();
  return row!;
}
