import { csvCell } from "../../lib/tableExport.js";
import ExcelJS from "exceljs";
import * as formsRepo from "../forms/repository.js";
import type { RegistrationFilters, RegistrationRow } from "./repository.js";
import { listRegistrationsForExport } from "./repository.js";
import { followTextKey, isOtherOption, otherTextKey } from "./validation.js";

export type ExportFormat = "csv" | "xlsx";

interface ExportColumn {
  key: string;
  label: string;
}

const BUILT_IN_COLUMNS: ExportColumn[] = [
  { key: "registrationNumber", label: "Registration Number" },
  { key: "status", label: "Status" },
  { key: "submittedAt", label: "Submitted At" },
  { key: "applicantName", label: "Name" },
  { key: "applicantEmail", label: "Email" },
  { key: "applicantPhone", label: "Phone" },
];

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object") {
      return value.map((v: { filename?: string; url?: string }) => v.filename ?? v.url ?? "file").join("; ");
    }
    return value.join("; ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Shows a chosen "Other" option together with what the registrant typed, e.g. "Other: Freetown". */
export function withOtherText(value: unknown, otherText: unknown, followText?: unknown): unknown {
  // Multiple choice: show each option's extra answer next to it.
  if (Array.isArray(value) && followText && typeof followText === "object") {
    const extra = followText as Record<string, unknown>;
    return withOtherText(
      value.map((option) => (typeof option === "string" && typeof extra[option] === "string" ? `${option}: ${extra[option]}` : option)),
      otherText,
    );
  }
  if (typeof otherText !== "string" || !otherText) return value;
  const expand = (option: unknown) => (typeof option === "string" && isOtherOption(option) ? `${option}: ${otherText}` : option);
  if (Array.isArray(value)) return value.map(expand);
  // A single choice (or Yes/No) that asked for more details: show them next to the answer.
  if (typeof value === "boolean") return `${value ? "Yes" : "No"}: ${otherText}`;
  if (typeof value === "string" && value) return `${value}: ${otherText}`;
  return value;
}

async function buildFieldColumns(programId: string): Promise<ExportColumn[]> {
  const versions = await formsRepo.listFormVersions(programId);
  const { fields } = await formsRepo.getContentForForms(versions.map((v) => v.id));

  const labelByKey = new Map<string, string>();
  // Versions are returned newest-first; iterate in reverse so the most recent
  // label for a given key wins without needing an extra sort pass.
  for (const field of [...fields].reverse()) {
    labelByKey.set(field.fieldKey, field.label);
  }

  return [...labelByKey.entries()].map(([key, label]) => ({ key, label }));
}

async function buildRows(programId: string, filters: RegistrationFilters) {
  const [registrationsList, fieldColumns] = await Promise.all([
    listRegistrationsForExport(programId, filters),
    buildFieldColumns(programId),
  ]);

  // Payment and order columns appear only when there is something to show in them.
  const hasPayments = registrationsList.some((r) => r.paymentStatus !== "none");
  const hasOrders = registrationsList.some((r) => (r.responses as Record<string, unknown>)?.__order);
  const columns = [
    ...BUILT_IN_COLUMNS,
    ...(hasPayments
      ? [
          { key: "paymentStatus", label: "Payment" },
          { key: "amountDue", label: "Amount due (NLe)" },
          { key: "paidAt", label: "Paid at" },
        ]
      : []),
    ...(hasOrders
      ? [
          { key: "orderItems", label: "Order items" },
          { key: "orderTotal", label: "Order total (NLe)" },
        ]
      : []),
    ...fieldColumns,
  ];

  const rows = registrationsList.map((registration: RegistrationRow) => {
    const responses = (registration.responses as Record<string, unknown>) ?? {};
    const row: Record<string, string> = {
      registrationNumber: registration.registrationNumber,
      status: registration.status,
      submittedAt: registration.submittedAt.toISOString(),
      applicantName: registration.applicantName ?? "",
      applicantEmail: registration.applicantEmail ?? "",
      applicantPhone: registration.applicantPhone ?? "",
    };
    if (hasPayments) {
      row.paymentStatus = registration.paymentStatus;
      row.amountDue = (registration.amountDueMinor / 100).toFixed(2);
      row.paidAt = registration.paidAt ? registration.paidAt.toISOString() : "";
    }
    if (hasOrders) {
      const order = responses.__order as { lines?: { name: string; quantity: number }[]; totalMinor?: number } | undefined;
      row.orderItems = (order?.lines ?? []).map((l) => `${l.quantity} x ${l.name}`).join("; ");
      row.orderTotal = order?.totalMinor !== undefined ? (order.totalMinor / 100).toFixed(2) : "";
    }
    for (const field of fieldColumns) {
      row[field.key] = formatCellValue(withOtherText(responses[field.key], responses[otherTextKey(field.key)], responses[followTextKey(field.key)]));
    }
    return row;
  });

  return { columns, rows };
}

// Formula-safe, and quoted when needed (see lib/tableExport).
const escapeCsvCell = csvCell;

export async function generateCsvExport(programId: string, filters: RegistrationFilters): Promise<string> {
  const { columns, rows } = await buildRows(programId, filters);
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key] ?? "")).join(","));
  return [header, ...lines].join("\r\n");
}

export async function generateXlsxExport(programId: string, filters: RegistrationFilters): Promise<Buffer> {
  const { columns, rows } = await buildRows(programId, filters);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Registrations");

  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(14, c.label.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
  sheet.addRows(rows);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
