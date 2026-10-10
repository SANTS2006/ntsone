import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { convertCell, parseImportFile, suggestMapping } from "../../src/modules/registrations/importParser.js";
import type { FieldRow } from "../../src/modules/forms/repository.js";

const field = (fieldKey: string, type: string, label: string, config: Record<string, unknown> = {}) =>
  ({ id: fieldKey, fieldKey, type, label, config, required: false, orderIndex: 0 }) as unknown as FieldRow;

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function docx(rows: string[][]): Promise<Buffer> {
  const cell = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const body = `<w:tbl>${rows.map((r) => `<w:tr>${r.map(cell).join("")}</w:tr>`).join("")}</w:tbl>`;
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Intro</w:t></w:r></w:p>${body}</w:body></w:document>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("reading a document into rows", () => {
  it("reads an Excel sheet, including dates and numbers", async () => {
    const buffer = await xlsx([
      ["Full name", "Age", "Joined"],
      ["Ama Kamara", 31, new Date(Date.UTC(2024, 4, 9))],
      [],
      ["Musa Bangura", 28, "2024-06-01"],
    ]);
    const table = await parseImportFile("people.xlsx", buffer);
    expect(table.headers).toEqual(["Full name", "Age", "Joined"]);
    expect(table.rows).toEqual([
      ["Ama Kamara", "31", "2024-05-09"],
      ["Musa Bangura", "28", "2024-06-01"],
    ]);
  });

  it("reads a CSV file with quoted commas", async () => {
    const csv = 'Name,Email,Notes\n"Kamara, Ama",ama@example.com,"likes, commas"\n';
    const table = await parseImportFile("people.csv", Buffer.from(csv));
    expect(table.rows[0]).toEqual(["Kamara, Ama", "ama@example.com", "likes, commas"]);
  });

  it("reads the first table in a Word document", async () => {
    const table = await parseImportFile("people.docx", await docx([["Name", "Email"], ["Ama", "ama@example.com"]]));
    expect(table.headers).toEqual(["Name", "Email"]);
    expect(table.rows).toEqual([["Ama", "ama@example.com"]]);
  });

  it("explains what to do with unsupported or empty files", async () => {
    await expect(parseImportFile("x.pdf", Buffer.from("x"))).rejects.toThrow(/Excel/);
    await expect(parseImportFile("x.xls", Buffer.from("x"))).rejects.toThrow(/\.xlsx/);
    await expect(parseImportFile("x.xlsx", Buffer.alloc(0))).rejects.toThrow(/empty/);
    await expect(parseImportFile("x.xlsx", Buffer.from("not a spreadsheet"))).rejects.toThrow(/could not be read/);
  });

  it("refuses more rows than one import can take", async () => {
    const rows: unknown[][] = [["Name"]];
    for (let i = 0; i < 501; i++) rows.push([`Person ${i}`]);
    await expect(parseImportFile("big.xlsx", await xlsx(rows))).rejects.toThrow(/at most 500/);
  });
});

describe("matching columns to questions", () => {
  const fields = [field("full_name", "short_text", "Full name"), field("email", "email", "Email address"), field("phone", "phone", "Phone number"), field("region", "single_choice", "Region")];
  it("matches by label, key and kind of question", () => {
    expect(suggestMapping(["Full Name", "E-mail", "Mobile", "Region", "Comments"], fields)).toEqual({ "0": "full_name", "1": "email", "2": "phone", "3": "region" });
  });
  it("never uses a question twice", () => {
    const mapping = suggestMapping(["Name", "Full name"], fields);
    expect(Object.values(mapping).filter((k) => k === "full_name")).toHaveLength(1);
  });
});

describe("turning cell text into answers", () => {
  it("handles yes/no, numbers, dates and choices", () => {
    expect(convertCell(field("a", "yes_no", "A"), "Yes")).toBe(true);
    expect(convertCell(field("a", "yes_no", "A"), "no")).toBe(false);
    expect(convertCell(field("n", "currency", "N"), "$1,250.50")).toBe(1250.5);
    expect(convertCell(field("d", "date_of_birth", "D"), "25/12/1990")).toBe("1990-12-25");
    expect(convertCell(field("s", "single_choice", "S", { options: ["North", "South"] }), "north")).toBe("North");
    expect(convertCell(field("m", "multiple_choice", "M", { options: ["A", "B", "C"] }), "a; c")).toEqual(["A", "C"]);
    expect(convertCell(field("t", "short_text", "T"), "   ")).toBeUndefined();
  });
});

describe("the blank import template", () => {
  const fields = [
    { ...field("full_name", "short_text", "Full name"), required: true, orderIndex: 0 },
    { ...field("region", "single_choice", "Region", { options: ["North", "South"] }), orderIndex: 1 },
    { ...field("photo", "image_upload", "Photo"), orderIndex: 2 },
  ] as unknown as FieldRow[];

  it("has one column per question, without uploads, plus the number column", async () => {
    const { buildImportTemplate } = await import("../../src/modules/registrations/importTemplate.js");
    const csv = await buildImportTemplate(fields, "csv", false);
    expect(csv.buffer.toString("utf8").replace("\uFEFF", "").trim()).toBe("Full name,Region,Registration number");
    const orders = await buildImportTemplate(fields, "csv", true);
    expect(orders.buffer.toString("utf8")).toContain("Order number");
  });

  it("can be filled in and imported straight back, matching its own columns", async () => {
    const { buildImportTemplate } = await import("../../src/modules/registrations/importTemplate.js");
    const template = await buildImportTemplate(fields, "xlsx", false);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(template.buffer as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Guide")).toBeTruthy();
    wb.getWorksheet("Import")!.addRow(["Ama Kamara", "North"]);
    const filled = Buffer.from(await wb.xlsx.writeBuffer());
    const table = await parseImportFile("filled.xlsx", filled);
    expect(table.headers).toEqual(["Full name", "Region", "Registration number"]);
    expect(table.rows[0]!.slice(0, 2)).toEqual(["Ama Kamara", "North"]);
    expect(suggestMapping(table.headers, fields.slice(0, 2))).toEqual({ "0": "full_name", "1": "region", "2": "__registration_number" });
  });
});
