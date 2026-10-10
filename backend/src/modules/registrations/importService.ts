import { AppError } from "../../lib/errors.js";
import * as formsService from "../forms/service.js";
import type { FieldRow } from "../forms/repository.js";
import * as programsRepo from "../programs/repository.js";
import * as registrationsRepo from "./repository.js";
import { convertCell, importableFields, parseImportFile, suggestMapping, MAX_IMPORT_ROWS, REGISTRATION_NUMBER_KEY } from "./importParser.js";
import { buildImportTemplate } from "./importTemplate.js";
import { createRegistrationWithNumber } from "./service.js";
import { extractApplicantContact, missingRequiredAnswers, validateAndNormalizeResponses } from "./validation.js";

const REPORT_LIMIT = 200;
const FILE_TYPES = new Set(["image_upload", "pdf_upload", "document_upload"]);

async function loadProgramForm(programId: string) {
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  const published = await formsService.getPublishedFormWithContent(program.id);
  if (!published) throw AppError.conflict("Publish this program's registration form first. Imported rows are matched to its questions.");
  return { program, published };
}

/** Reads the uploaded document and shows what is in it, with a first guess at which column answers which question. */
export async function previewImport(programId: string, filename: string, content: Buffer) {
  const { program, published } = await loadProgramForm(programId);
  const table = await parseImportFile(filename, content);
  const fields = importableFields(published.fields);
  return {
    headers: table.headers,
    sampleRows: table.rows.slice(0, 5),
    totalRows: table.rows.length,
    maxRows: MAX_IMPORT_ROWS,
    mapping: suggestMapping(table.headers, fields),
    fields: [
      ...fields
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((f) => ({ fieldKey: f.fieldKey, label: f.label, type: f.type, required: f.required })),
      // Not a question: it finds the registration a row should update.
      { fieldKey: REGISTRATION_NUMBER_KEY, label: `${program.kind === "order_form" ? "Order" : "Registration"} number (finds existing)`, type: "registration_number", required: false },
    ],
  };
}

/** A blank sheet for the program's current form, ready to fill in and import. */
export async function importTemplateFor(programId: string, format: "xlsx" | "csv") {
  const { program, published } = await loadProgramForm(programId);
  return { program, template: await buildImportTemplate(published.fields, format, program.kind === "order_form") };
}

export interface ImportRowIssue {
  /** The row as numbered in the document (the header is row 1). */
  row: number;
  messages: string[];
}

/** What to do with a row that matches a registration the program already has. */
export type ExistingRows = "skip" | "update" | "update_only";

/** One row of the document as the import sees it, shown before anything is saved. */
export interface ImportRowPreview {
  /** The row as numbered in the document (the header is row 1). */
  row: number;
  /** What would happen to it: saved as new, update an existing registration, left out because of a problem, or skipped. */
  action: "create" | "update" | "error" | "skipped";
  /** The number of the registration it would update. */
  matches?: string;
  /** The row as it was in the document, one entry per column. */
  cells: string[];
  /** The answers the row carries, by question key, as they will be saved. */
  values: Record<string, string>;
  /** Why it has a problem or is skipped. */
  messages: string[];
  /** Required questions it leaves empty (the row is still imported). */
  incomplete: string[];
}

const showValue = (value: unknown): string =>
  value === null || value === undefined ? "" : Array.isArray(value) ? value.map(String).join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);

export interface ImportResult {
  dryRun: boolean;
  /** Every row as it would be handled; filled in by a check (dry run) only. */
  rows: ImportRowPreview[];
  total: number;
  /** Rows that passed every check (and, unless it was a check only, were saved). */
  valid: number;
  /** New registrations saved. */
  imported: number;
  /** Existing registrations updated. */
  updated: number;
  /** Rows imported even though some required questions are not answered yet; they can be completed by editing the registration. */
  incomplete: ImportRowIssue[];
  /** What the import will do (or just did): new registrations and updates. */
  willCreate: number;
  willUpdate: number;
  skipped: ImportRowIssue[];
  errors: ImportRowIssue[];
}

/**
 * Checks every row of the document against the form and, unless `dryRun`, saves the good ones as
 * registrations. Rows with problems are left out and reported; nothing is emailed.
 */
export async function runImport(
  programId: string,
  filename: string,
  content: Buffer,
  mapping: Record<string, string>,
  dryRun: boolean,
  existing: ExistingRows = "skip",
): Promise<ImportResult> {
  const { program, published } = await loadProgramForm(programId);
  const table = await parseImportFile(filename, content);

  const fieldsByKey = new Map(importableFields(published.fields).map((f) => [f.fieldKey, f] as const));
  const columns: { index: number; field: FieldRow }[] = [];
  let numberColumn: number | undefined;
  const usedFields = new Set<string>();
  for (const [columnIndex, fieldKey] of Object.entries(mapping)) {
    const index = Number(columnIndex);
    if (fieldKey === REGISTRATION_NUMBER_KEY) {
      if (!Number.isInteger(index) || index < 0 || index >= table.headers.length || numberColumn !== undefined) {
        throw AppError.validation("The column matching is not valid. Choose the columns again.");
      }
      numberColumn = index;
      continue;
    }
    const field = fieldsByKey.get(fieldKey);
    if (!Number.isInteger(index) || index < 0 || index >= table.headers.length || !field) {
      throw AppError.validation("The column matching is not valid. Choose the columns again.");
    }
    if (usedFields.has(fieldKey)) throw AppError.validation(`"${field.label}" is matched to more than one column.`);
    usedFields.add(fieldKey);
    columns.push({ index, field });
  }
  if (existing !== "skip" && numberColumn === undefined && !columns.some((c) => c.field.type === "email")) {
    throw AppError.validation("To update existing registrations, match a column to the registration number or to the email question, so each row can find its registration.");
  }
  if (columns.length === 0) throw AppError.validation("Match at least one column to a question before importing.");

  // A document can't carry uploaded files, so an upload question never blocks a row.
  const checkFields = published.fields.map((f) => (FILE_TYPES.has(f.type) ? { ...f, required: false } : f));
  const knownEmails = program.oneRegistrationPerEmail ? await registrationsRepo.listRegisteredEmails(program.id) : new Set<string>();

  // Convert every row once, and look up the registrations they might update in one go.
  const parsedRows = table.rows.map((cells) => {
    const responses: Record<string, unknown> = {};
    for (const { index, field } of columns) {
      const value = convertCell(field, cells[index] ?? "");
      if (value !== undefined) responses[field.fieldKey] = value;
    }
    const number = numberColumn === undefined ? "" : (cells[numberColumn] ?? "").trim();
    const email = extractApplicantContact(published.fields, responses).email?.trim().toLowerCase() ?? "";
    return { responses, number, email };
  });
  const byNumber = new Map<string, registrationsRepo.RegistrationRow>();
  const byEmail = new Map<string, registrationsRepo.RegistrationRow>();
  if (existing !== "skip") {
    const found = await registrationsRepo.findRegistrationsForImport(
      program.id,
      [...new Set(parsedRows.map((r) => r.email).filter(Boolean))],
      [...new Set(parsedRows.map((r) => r.number).filter(Boolean))],
    );
    // Newest first, so the first one seen for an email is the latest.
    for (const reg of found) {
      byNumber.set(reg.registrationNumber.toLowerCase(), reg);
      const key = reg.applicantEmail?.trim().toLowerCase();
      if (key && !byEmail.has(key)) byEmail.set(key, reg);
    }
  }

  const result: ImportResult = {
    dryRun,
    rows: [],
    total: table.rows.length,
    valid: 0,
    imported: 0,
    updated: 0,
    willCreate: 0,
    willUpdate: 0,
    skipped: [],
    errors: [],
    incomplete: [],
  };
  const note = `Imported from ${filename.slice(0, 120)}`;
  const updateNote = `Updated from ${filename.slice(0, 120)}`;
  // The row being handled, for the preview of a check.
  let current: { responses: Record<string, unknown>; matches?: string; cells: string[] } = { responses: {}, cells: [] };
  const showRow = (row: number, action: ImportRowPreview["action"], messages: string[], incomplete: string[] = []) => {
    if (!dryRun) return;
    result.rows.push({
      row,
      action,
      matches: current.matches,
      cells: current.cells,
      values: Object.fromEntries(Object.entries(current.responses).map(([key, value]) => [key, showValue(value)])),
      messages,
      incomplete,
    });
  };
  const addIssue = (list: ImportRowIssue[], row: number, messages: string[]) => {
    if (list.length < REPORT_LIMIT) list.push({ row, messages });
    if (list === result.errors) showRow(row, "error", messages);
    else if (list === result.skipped) showRow(row, "skipped", messages);
  };
  // Rows are accepted with required answers missing; list them so the admin can complete them afterwards.
  const noteIncomplete = (row: number, answers: Record<string, unknown>) => {
    const missing = missingRequiredAnswers(checkFields, answers, [], published.sections);
    if (missing.length > 0) addIssue(result.incomplete, row, missing);
    return missing;
  };
  const detailsOf = (err: unknown) =>
    err instanceof AppError && Array.isArray(err.details) ? (err.details as string[]) : [err instanceof Error ? err.message : "Invalid row"];

  for (let i = 0; i < parsedRows.length; i++) {
    const rowNumber = i + 2;
    const { responses, number, email } = parsedRows[i]!;
    current = { responses, cells: table.rows[i]! };

    // A row finds its registration by number first, then by email.
    const match = existing === "skip" ? undefined : ((number && byNumber.get(number.toLowerCase())) || (email ? byEmail.get(email) : undefined));
    current = { responses, matches: match?.registrationNumber, cells: table.rows[i]! };

    if (match) {
      // Only what the document supplies is changed; empty cells and other questions keep their answers.
      const merged = { ...(match.responses as Record<string, unknown>), ...responses };
      let cleaned: Record<string, unknown>;
      try {
        cleaned = validateAndNormalizeResponses(checkFields, merged, [], published.sections, { ignoreRequired: true });
      } catch (err) {
        addIssue(result.errors, rowNumber, detailsOf(err));
        continue;
      }
      const finalResponses: Record<string, unknown> = { ...(match.responses as Record<string, unknown>) };
      for (const key of Object.keys(responses)) finalResponses[key] = cleaned[key];
      const contact = extractApplicantContact(published.fields, finalResponses);
      const newEmail = contact.email?.trim().toLowerCase();
      if (program.oneRegistrationPerEmail && newEmail && newEmail !== match.applicantEmail?.trim().toLowerCase() && knownEmails.has(newEmail)) {
        addIssue(result.errors, rowNumber, [`${contact.email} is already used by another registration`]);
        continue;
      }
      result.valid++;
      result.willUpdate++;
      showRow(rowNumber, "update", [], noteIncomplete(rowNumber, finalResponses));
      if (dryRun) continue;
      try {
        const saved = await registrationsRepo.updateRegistrationFromImport(match, {
          applicantName: contact.name,
          applicantEmail: contact.email,
          applicantPhone: contact.phone,
          responses: finalResponses,
          enforceUniqueEmail: program.oneRegistrationPerEmail,
          note: updateNote,
          formId: published.form.id,
        });
        result.updated++;
        if (program.oneRegistrationPerEmail && newEmail) knownEmails.add(newEmail);
        // A later row for the same person builds on this update.
        byNumber.set(saved.registrationNumber.toLowerCase(), saved);
        if (newEmail) byEmail.set(newEmail, saved);
      } catch (err) {
        result.valid--;
        result.willUpdate--;
        addIssue(result.errors, rowNumber, [err instanceof AppError ? err.message : "This row could not be saved (is the email already used?)"]);
      }
      continue;
    }

    if (existing === "update_only") {
      addIssue(result.skipped, rowNumber, ["No existing registration was found for this row"]);
      continue;
    }

    let cleaned: Record<string, unknown>;
    try {
      cleaned = validateAndNormalizeResponses(checkFields, responses, [], published.sections, { ignoreRequired: true });
    } catch (err) {
      addIssue(result.errors, rowNumber, detailsOf(err));
      continue;
    }

    const contact = extractApplicantContact(published.fields, cleaned);
    const emailKey = contact.email?.trim().toLowerCase();
    if (program.oneRegistrationPerEmail && emailKey && knownEmails.has(emailKey)) {
      addIssue(result.skipped, rowNumber, [`${contact.email} is already registered for this program`]);
      continue;
    }

    result.valid++;
    result.willCreate++;
    showRow(rowNumber, "create", [], noteIncomplete(rowNumber, cleaned));
    if (dryRun) {
      if (program.oneRegistrationPerEmail && emailKey) knownEmails.add(emailKey);
      continue;
    }

    try {
      await createRegistrationWithNumber(program, published.form.id, contact, cleaned, [], note);
      result.imported++;
      if (program.oneRegistrationPerEmail && emailKey) knownEmails.add(emailKey);
    } catch (err) {
      result.valid--;
      result.willCreate--;
      addIssue(result.errors, rowNumber, [err instanceof AppError ? err.message : "This row could not be saved"]);
    }
  }
  return result;
}
