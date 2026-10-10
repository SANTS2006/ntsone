import * as formsService from "../forms/service.js";
import type { FieldRow } from "../forms/repository.js";
import { listRegistrationsForExport } from "../registrations/repository.js";
import { otherTextKey } from "../registrations/validation.js";

interface Count {
  value: string;
  count: number;
}

interface FieldBase {
  fieldKey: string;
  label: string;
  type: string;
  section: string | null;
  answered: number;
  total: number;
}

export type FieldAnalytics =
  | (FieldBase & { kind: "choice"; multiple: boolean; options: Count[]; otherAnswers: Count[] })
  | (FieldBase & {
      kind: "number";
      stats: { min: number; max: number; average: number; median: number } | null;
      distribution: Count[];
    })
  | (FieldBase & { kind: "date"; grouping: "age" | "month" | "hour"; distribution: Count[] })
  | (FieldBase & { kind: "text"; unique: number; top: Count[] })
  | (FieldBase & { kind: "file" })
  | (FieldBase & { kind: "consent" });

const CHOICE_TYPES = new Set(["single_choice", "dropdown", "gender", "country", "multiple_choice", "yes_no"]);
const NUMBER_TYPES = new Set(["number", "currency", "rating"]);
const DATE_TYPES = new Set(["date", "datetime", "date_of_birth", "time"]);
const FILE_TYPES = new Set(["image_upload", "pdf_upload", "document_upload"]);
const TOP_LIMIT = 10;

function isAnswered(value: unknown): boolean {
  return !(value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0));
}

function tally(values: string[], limit?: number): Count[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    // Group free text case-insensitively, keeping the first spelling seen.
    const key = value.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { value, count: 1 });
  }
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return limit ? sorted.slice(0, limit) : sorted;
}

function choiceAnalytics(field: FieldRow, values: unknown[], otherTexts: string[]) {
  const multiple = field.type === "multiple_choice";
  const picked: string[] = [];
  for (const value of values) {
    if (field.type === "yes_no") picked.push(value === true ? "Yes" : "No");
    else if (Array.isArray(value)) picked.push(...value.map(String));
    else picked.push(String(value));
  }

  // Keep the form's own option order (including options nobody picked), then any unexpected values.
  const configured = ((field.config as { options?: string[] })?.options ?? []).slice();
  if (field.type === "yes_no") configured.push("Yes", "No");
  const counts = new Map<string, number>(configured.map((o) => [o, 0]));
  for (const value of picked) counts.set(value, (counts.get(value) ?? 0) + 1);

  return {
    kind: "choice" as const,
    multiple,
    options: [...counts.entries()].map(([value, count]) => ({ value, count })),
    otherAnswers: tally(otherTexts, TOP_LIMIT),
  };
}

function numberAnalytics(values: unknown[]) {
  const numbers = values.map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (numbers.length === 0) return { kind: "number" as const, stats: null, distribution: [] };

  const min = numbers[0]!;
  const max = numbers[numbers.length - 1]!;
  const middle = Math.floor(numbers.length / 2);
  const median = numbers.length % 2 ? numbers[middle]! : (numbers[middle - 1]! + numbers[middle]!) / 2;
  const average = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  const round = (n: number) => Math.round(n * 100) / 100;

  let distribution: Count[];
  const distinct = new Set(numbers);
  if (distinct.size <= 8) {
    distribution = [...distinct].map((n) => ({ value: String(n), count: numbers.filter((x) => x === n).length }));
  } else {
    const bucketCount = 6;
    const width = (max - min) / bucketCount;
    distribution = Array.from({ length: bucketCount }, (_, i) => {
      const lo = min + i * width;
      const hi = i === bucketCount - 1 ? max : lo + width;
      const count = numbers.filter((n) => n >= lo && (i === bucketCount - 1 ? n <= hi : n < hi)).length;
      return { value: `${round(lo)} – ${round(hi)}`, count };
    });
  }

  return { kind: "number" as const, stats: { min, max, average: round(average), median: round(median) }, distribution };
}

const AGE_GROUPS: [string, number, number][] = [
  ["Under 18", 0, 17],
  ["18–24", 18, 24],
  ["25–34", 25, 34],
  ["35–44", 35, 44],
  ["45–54", 45, 54],
  ["55+", 55, 200],
];

function dateAnalytics(field: FieldRow, values: unknown[]) {
  if (field.type === "time") {
    const hours = values.map((v) => String(v).slice(0, 2)).filter((h) => /^\d{2}$/.test(h));
    const distribution = tally(hours.map((h) => `${h}:00`)).sort((a, b) => a.value.localeCompare(b.value));
    return { kind: "date" as const, grouping: "hour" as const, distribution };
  }

  const dates = values.map((v) => new Date(String(v))).filter((d) => !Number.isNaN(d.getTime()));

  if (field.type === "date_of_birth") {
    const now = new Date();
    const ages = dates.map((d) => {
      let age = now.getFullYear() - d.getFullYear();
      const beforeBirthday = now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
      if (beforeBirthday) age -= 1;
      return age;
    });
    const distribution = AGE_GROUPS.map(([value, lo, hi]) => ({ value, count: ages.filter((a) => a >= lo && a <= hi).length }));
    return { kind: "date" as const, grouping: "age" as const, distribution };
  }

  const months = dates.map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const distribution = tally(months).sort((a, b) => a.value.localeCompare(b.value));
  return { kind: "date" as const, grouping: "month" as const, distribution };
}

/** Per-field breakdowns of every question on the program's published form. */
export async function getFieldAnalytics(programId: string): Promise<FieldAnalytics[]> {
  const published = await formsService.getPublishedFormWithContent(programId);
  if (!published) return [];

  const registrations = await listRegistrationsForExport(programId, {});
  const responsesList = registrations.map((r) => (r.responses as Record<string, unknown>) ?? {});
  const total = responsesList.length;
  const sectionTitle = new Map(published.sections.map((s) => [s.id, s.title]));

  return published.fields.map((field): FieldAnalytics => {
    const values = responsesList.map((r) => r[field.fieldKey]).filter(isAnswered);
    const base: FieldBase = {
      fieldKey: field.fieldKey,
      label: field.label,
      type: field.type,
      section: field.sectionId ? (sectionTitle.get(field.sectionId) ?? null) : null,
      answered: values.length,
      total,
    };

    if (CHOICE_TYPES.has(field.type)) {
      const otherTexts = responsesList
        .map((r) => r[otherTextKey(field.fieldKey)])
        .filter((v): v is string => typeof v === "string" && v.trim() !== "");
      return { ...base, ...choiceAnalytics(field, values, otherTexts) };
    }
    if (NUMBER_TYPES.has(field.type)) return { ...base, ...numberAnalytics(values) };
    if (DATE_TYPES.has(field.type)) return { ...base, ...dateAnalytics(field, values) };
    if (FILE_TYPES.has(field.type)) return { ...base, kind: "file" };
    if (field.type === "consent") return { ...base, answered: values.filter((v) => v === true).length, kind: "consent" };

    const texts = values.map(String);
    return {
      ...base,
      kind: "text",
      unique: new Set(texts.map((t) => t.trim().toLowerCase())).size,
      top: tally(texts, TOP_LIMIT).filter((c) => c.count > 1 || texts.length <= TOP_LIMIT),
    };
  });
}
