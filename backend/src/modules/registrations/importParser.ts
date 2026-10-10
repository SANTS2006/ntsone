import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { AppError } from "../../lib/errors.js";
import type { FieldRow } from "../forms/repository.js";

/** The column that holds an existing registration's number, used to find it again. */
export const REGISTRATION_NUMBER_KEY = "__registration_number";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_COLUMNS = 100;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

const FILE_TYPES = new Set(["image_upload", "pdf_upload", "document_upload"]);

/** Questions an imported row can fill in: everything except uploads, which a document can't carry. */
export function importableFields(fields: FieldRow[]): FieldRow[] {
  return fields.filter((f) => !FILE_TYPES.has(f.type));
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** A spreadsheet cell as plain text, whatever it holds (text, number, date, formula, link, rich text). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return isoDay(value);
  if (typeof value === "object") {
    const v = value as { richText?: { text: string }[]; text?: unknown; result?: unknown; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join("").trim();
    if (v.result !== undefined) return cellText(v.result);
    if (v.text !== undefined) return cellText(v.text);
    if (v.hyperlink) return v.hyperlink;
    return "";
  }
  return String(value).trim();
}

function cleanTable(raw: string[][]): ParsedTable {
  const rows = raw.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
  if (rows.length < 2) throw AppError.validation("The document needs a header row and at least one row of data.");
  const width = Math.min(MAX_IMPORT_COLUMNS, Math.max(...rows.map((r) => r.length)));
  const headers = Array.from({ length: width }, (_, i) => rows[0]![i]?.trim() || `Column ${i + 1}`);
  const data = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
  return { headers, rows: data };
}

async function parseSheet(sheet: ExcelJS.Worksheet | undefined): Promise<string[][]> {
  if (!sheet) throw AppError.validation("The file has no sheet with data.");
  const out: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value);
    });
    out.push(Array.from(cells, (c) => c ?? ""));
  });
  return out;
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** The first table in a Word document, as rows of text. */
async function parseDocx(buffer: Buffer): Promise<string[][]> {
  let xml: string | undefined;
  try {
    const zip = await JSZip.loadAsync(buffer);
    xml = await zip.file("word/document.xml")?.async("string");
  } catch {
    throw AppError.validation("That Word document could not be read. Save it as .docx and try again.");
  }
  if (!xml) throw AppError.validation("That Word document could not be read. Save it as .docx and try again.");

  const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
  for (const table of tables) {
    const rows = (table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((tr) =>
      (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((tc) =>
        (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [tc])
          .map((p) => decodeXml((p.replace(/<w:tab\/>/g, " ").match(/<w:t[ >][^<]*<\/w:t>|<w:t>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")))
          .filter(Boolean)
          .join(" ")
          .trim(),
      ),
    );
    if (rows.length >= 2) return rows;
  }
  throw AppError.validation("No table was found in the document. Put the registrations in a table with a header row.");
}

/** Reads a spreadsheet (.xlsx, .csv) or a Word table (.docx) into a header row and rows of text. */
export async function parseImportFile(filename: string, buffer: Buffer): Promise<ParsedTable> {
  if (buffer.length === 0) throw AppError.validation("The file is empty.");
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw AppError.validation("The file is too large. The limit is 5 MB.");
  const name = filename.toLowerCase();
  let raw: string[][];
  try {
    if (name.endsWith(".xlsx")) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      // A sheet named "Import" (as in the downloadable template) wins; otherwise the first sheet with data.
      raw = await parseSheet(workbook.getWorksheet("Import") ?? workbook.worksheets.find((s) => s.rowCount > 1) ?? workbook.worksheets[0]);
    } else if (name.endsWith(".csv")) {
      const workbook = new ExcelJS.Workbook();
      // Excel writes a byte-order mark at the start of a CSV; it is not part of the first column name.
      const text = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? buffer.subarray(3) : buffer;
      const sheet = await workbook.csv.read(Readable.from(text));
      raw = await parseSheet(sheet);
    } else if (name.endsWith(".docx")) {
      raw = await parseDocx(buffer);
    } else if (name.endsWith(".xls") || name.endsWith(".doc")) {
      throw AppError.validation("Older .xls and .doc files can't be read. Save the file as .xlsx or .docx and upload it again.");
    } else {
      throw AppError.validation("Upload an Excel sheet (.xlsx or .csv) or a Word document (.docx).");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.validation("That file could not be read. Check that it is a valid Excel or Word file.");
  }
  const table = cleanTable(raw);
  if (table.rows.length > MAX_IMPORT_ROWS) {
    throw AppError.validation(`The file has ${table.rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`);
  }
  return table;
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Guesses which question each column belongs to, from the header text. One question per column, one column per question. */
export function suggestMapping(headers: string[], fields: FieldRow[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const take = (index: number, field: FieldRow | undefined) => {
    if (!field || used.has(field.fieldKey)) return false;
    used.add(field.fieldKey);
    mapping[String(index)] = field.fieldKey;
    return true;
  };
  const normalized = headers.map(words);

  // Exact matches on the question's label or key first, then looser ones.
  normalized.forEach((h, i) => {
    if (h) take(i, fields.find((f) => !used.has(f.fieldKey) && (words(f.label) === h || words(f.fieldKey) === h)));
  });
  normalized.forEach((h, i) => {
    if (!h || mapping[String(i)]) return;
    take(
      i,
      fields.find((f) => {
        if (used.has(f.fieldKey)) return false;
        const label = words(f.label);
        return label.length >= 3 && h.length >= 3 && (label.includes(h) || h.includes(label));
      }),
    );
  });
  normalized.forEach((h, i) => {
    if (!h || mapping[String(i)] || used.has(REGISTRATION_NUMBER_KEY)) return;
    if (/^(registration|reg|order|ticket|reference|ref)( ?(number|no|num|id|#))?$/.test(h) || /registration (number|no)/.test(h)) {
      used.add(REGISTRATION_NUMBER_KEY);
      mapping[String(i)] = REGISTRATION_NUMBER_KEY;
    }
  });
  const byType = (types: string[]) => fields.find((f) => types.includes(f.type) && !used.has(f.fieldKey));
  normalized.forEach((h, i) => {
    if (!h || mapping[String(i)]) return;
    if (/^(e ?mail|email address)$/.test(h)) take(i, byType(["email"]));
    else if (/^(phone|phone number|mobile|mobile number|telephone|tel|contact)$/.test(h)) take(i, byType(["phone"]));
  });
  return mapping;
}

const YES = new Set(["yes", "y", "true", "1", "x", "agree", "agreed", "checked"]);
const NO = new Set(["no", "n", "false", "0", "disagree", "unchecked"]);

function parseDay(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  // 25/12/1990 or 25-12-1990: day first, as is usual outside the US.
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : isoDay(new Date(parsed));
}

const matchOption = (options: string[], raw: string) => options.find((o) => o.trim().toLowerCase() === raw.toLowerCase()) ?? raw;

/** Turns the text of one cell into the kind of answer the question expects. Anything unclear is passed on as is, so validation can report it. */
export function convertCell(field: FieldRow, raw: string): unknown {
  const text = raw.trim();
  if (text === "") return undefined;
  const options = ((field.config as { options?: string[] })?.options ?? []).filter(Boolean);
  switch (field.type) {
    case "yes_no":
    case "consent": {
      const lower = text.toLowerCase();
      return YES.has(lower) ? true : NO.has(lower) ? false : text;
    }
    case "number":
    case "currency":
    case "rating": {
      const n = Number(text.replace(/[,\s]/g, "").replace(/^[^\d.-]+/, ""));
      return Number.isFinite(n) ? n : text;
    }
    case "multiple_choice":
      return text
        .split(/[;,\n]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => matchOption(options, part));
    case "single_choice":
    case "dropdown":
    case "gender":
    case "country":
      return matchOption(options, text);
    case "date":
    case "date_of_birth":
      return parseDay(text) ?? text;
    default:
      return text;
  }
}
