import ExcelJS from "exceljs";
import type { FieldRow } from "../forms/repository.js";
import { importableFields, MAX_IMPORT_ROWS } from "./importParser.js";

/** What a person should type for each kind of question, shown on the guide sheet. */
const HINTS: Record<string, string> = {
  short_text: "Any text",
  long_text: "Any text",
  address: "Any text",
  email: "An email address, e.g. name@example.com",
  phone: "A phone number, e.g. +23276123456",
  url: "A web address starting with https://",
  number: "A number",
  currency: "An amount, e.g. 1500 or 1,500.50",
  rating: "A whole number",
  date: "A date, e.g. 2026-03-25 or 25/03/2026",
  date_of_birth: "A date, e.g. 1990-12-25 or 25/12/1990",
  time: "A time, e.g. 14:30",
  datetime: "A date and time, e.g. 2026-03-25T14:30",
  yes_no: "Yes or No",
  consent: "Yes or No",
  single_choice: "One of the listed choices",
  dropdown: "One of the listed choices",
  gender: "One of the listed choices",
  country: "One of the listed choices",
  multiple_choice: "One or more of the listed choices, separated by semicolons (;)",
};

export interface ImportTemplate {
  buffer: Buffer;
  contentType: string;
  extension: "xlsx" | "csv";
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const optionsOf = (field: FieldRow) => (((field.config as { options?: string[] })?.options ?? []) as string[]).filter(Boolean);

/** Column name for the optional "find the existing one" column. */
const numberHeader = (isOrder: boolean) => (isOrder ? "Order number" : "Registration number");

/**
 * A blank sheet for a program's current form: one column per question (the question's own wording, so
 * the columns match themselves on import), a guide sheet saying what each column takes, and dropdowns
 * for questions with a fixed list of answers.
 */
export async function buildImportTemplate(fields: FieldRow[], format: "xlsx" | "csv", isOrder: boolean): Promise<ImportTemplate> {
  const questions = importableFields(fields).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const headers = [...questions.map((q) => q.label), numberHeader(isOrder)];

  if (format === "csv") {
    return { buffer: Buffer.from(`﻿${headers.map(csvCell).join(",")}\n`, "utf8"), contentType: "text/csv; charset=utf-8", extension: "csv" };
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import");
  sheet.addRow(headers);
  const head = sheet.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = Math.min(40, Math.max(18, headers[i]!.length + 4));
  });
  questions.forEach((q, i) => {
    // Required questions get a coloured header.
    if (q.required) head.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE9B8" } };

    const choices = q.type === "yes_no" || q.type === "consent" ? ["Yes", "No"] : q.type === "multiple_choice" ? [] : optionsOf(q);
    const list = choices.join(",");
    // Excel limits an inline list to 255 characters; longer lists are described on the guide sheet instead.
    if (choices.length > 0 && list.length <= 255 && !choices.some((c) => c.includes(","))) {
      for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
        sheet.getCell(row, i + 1).dataValidation = { type: "list", allowBlank: true, formulae: [`"${list.replace(/"/g, '""')}"`] };
      }
    }
  });

  const guide = workbook.addWorksheet("Guide");
  guide.addRow(["Column", "Required", "What to enter"]);
  guide.getRow(1).font = { bold: true };
  guide.getColumn(1).width = 34;
  guide.getColumn(2).width = 12;
  guide.getColumn(3).width = 90;
  for (const q of questions) {
    const options = q.type === "yes_no" || q.type === "consent" ? [] : optionsOf(q);
    const hint = HINTS[q.type] ?? "Any text";
    guide.addRow([q.label, q.required ? "Yes" : "No", options.length > 0 ? `${hint}: ${options.join(" | ")}` : hint]);
  }
  guide.addRow([numberHeader(isOrder), "No", `Leave empty for new rows. To update an existing ${isOrder ? "order" : "registration"}, enter its number here.`]);
  guide.addRow([]);
  guide.addRow([`Put one ${isOrder ? "order" : "registration"} per row on the Import sheet, starting on row 2. Up to ${MAX_IMPORT_ROWS} rows can be imported at a time. Required columns have a coloured header, but rows with empty required answers are still imported, so you can fill them in later.`]);
  guide.addRow(["File uploads (photos, documents) cannot be imported."]);

  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  };
}
