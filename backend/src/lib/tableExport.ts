import ExcelJS from "exceljs";
import { createLimiter } from "./limiter.js";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { attachmentDisposition } from "./downloadName.js";

export const exportFormatSchema = z.object({ format: z.enum(["csv", "xlsx"]).default("csv") });
export type ExportFormat = "csv" | "xlsx";

/** Most rows one export will contain; lists are far smaller in practice. */
export const EXPORT_ROW_LIMIT = 50_000;

export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
  /** Excel number format, e.g. "#,##0.00" for money. */
  numFmt?: string;
}

export interface ExportSheet<T> {
  name: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starting with =, +, -, @) gets a
 * leading apostrophe, so an exported answer can never execute in Excel or Sheets.
 */
export function csvCell(value: unknown): string {
  let text = cellText(value);
  // Plain numbers such as "-5" are left alone; they can't run as a formula.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(sheets: ExportSheet<unknown>[]): string {
  const blocks = sheets.map((sheet) => {
    const lines = [sheet.columns.map((c) => csvCell(c.label)).join(",")];
    for (const row of sheet.rows) lines.push(sheet.columns.map((c) => csvCell(c.value(row))).join(","));
    // Several tables in one CSV are separated by a blank line and their name.
    return sheets.length > 1 ? [csvCell(sheet.name), ...lines].join("\r\n") : lines.join("\r\n");
  });
  // The byte order mark makes Excel open the file as UTF-8 (names with accents, "Le" amounts).
  return `﻿${blocks.join("\r\n\r\n")}`;
}

async function toXlsx(sheets: ExportSheet<unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet");
    ws.columns = sheet.columns.map((c, i) => ({
      header: c.label,
      key: `c${i}`,
      width: Math.min(60, Math.max(12, c.label.length + 4)),
      style: c.numFmt ? { numFmt: c.numFmt } : {},
    }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    for (const row of sheet.rows) {
      ws.addRow(
        Object.fromEntries(
          sheet.columns.map((c, i) => {
            const value = c.value(row);
            return [`c${i}`, value === null || value === undefined ? "" : typeof value === "boolean" ? (value ? "Yes" : "No") : value];
          }),
        ),
      );
    }
    if (sheet.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "export";
}

/**
 * Sends one or more tables as a CSV or Excel download named "<base> <yyyy-mm-dd>.csv|xlsx".
 * Every list in the app exports through here, so the two formats always match.
 */
// Building a workbook takes memory; a few at a time is plenty.
const excelLimiter = createLimiter(2, 40);

export async function sendTableExport(reply: FastifyReply, format: ExportFormat, baseName: string, sheets: ExportSheet<any>[]) {
  const fileName = `${safeName(baseName)} ${new Date().toISOString().slice(0, 10)}.${format}`;
  reply.header("Cache-Control", "no-store");
  reply.header("Content-Disposition", attachmentDisposition(fileName));
  if (format === "xlsx") {
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return reply.send(await excelLimiter(() => toXlsx(sheets)));
  }
  reply.header("Content-Type", "text/csv; charset=utf-8");
  return reply.send(toCsv(sheets));
}

export const MONEY_FORMAT = "#,##0.00";
export const date = (value: Date | string | null | undefined) => (value ? new Date(value) : null);
