import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as formsService from "../forms/service.js";

export interface TrendPoint {
  date: string;
  count: number;
}

const DEMOGRAPHIC_FIELD_TYPES = new Set(["gender", "country", "single_choice", "dropdown", "yes_no"]);
const MAX_DEMOGRAPHIC_FIELDS = 4;
const MAX_OPTIONS_PER_FIELD = 8;

export async function getRegistrationTrend(programId: string, days: number): Promise<TrendPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const result = await db.execute<{ day: string; count: number }>(sql`
    SELECT to_char(date_trunc('day', submitted_at), 'YYYY-MM-DD') as day, count(*)::int as count
    FROM registrations
    WHERE program_id = ${programId} AND submitted_at >= ${since}
    GROUP BY day
    ORDER BY day
  `);

  const byDay = new Map(result.rows.map((r) => [r.day, Number(r.count)]));
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    points.push({ date: key, count: byDay.get(key) ?? 0 });
  }
  return points;
}

export async function getCrossProgramTrend(programIds: string[] | "all", days: number): Promise<TrendPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  if (programIds !== "all" && programIds.length === 0) {
    return Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return { date: d.toISOString().slice(0, 10), count: 0 };
    });
  }

  // Interpolating a JS array directly makes drizzle emit a row tuple ($1, $2, ...),
  // not a Postgres array, so bind each id individually into an IN list.
  const scopeClause =
    programIds === "all"
      ? sql`TRUE`
      : sql`program_id IN (${sql.join(
          programIds.map((id) => sql`${id}`),
          sql`, `,
        )})`;

  const result = await db.execute<{ day: string; count: number }>(sql`
    SELECT to_char(date_trunc('day', submitted_at), 'YYYY-MM-DD') as day, count(*)::int as count
    FROM registrations
    WHERE submitted_at >= ${since} AND ${scopeClause}
    GROUP BY day
    ORDER BY day
  `);

  const byDay = new Map(result.rows.map((r) => [r.day, Number(r.count)]));
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    points.push({ date: key, count: byDay.get(key) ?? 0 });
  }
  return points;
}

export interface DemographicBreakdown {
  fieldKey: string;
  label: string;
  data: { value: string; count: number }[];
}

export async function getDemographics(programId: string): Promise<DemographicBreakdown[]> {
  const published = await formsService.getPublishedFormWithContent(programId);
  const fields = published?.fields ?? [];

  const eligible = fields.filter((f) => DEMOGRAPHIC_FIELD_TYPES.has(f.type)).slice(0, MAX_DEMOGRAPHIC_FIELDS);

  const breakdowns: DemographicBreakdown[] = [];
  for (const field of eligible) {
    const result = await db.execute<{ value: string | null; count: number }>(sql`
      SELECT responses ->> ${field.fieldKey} as value, count(*)::int as count
      FROM registrations
      WHERE program_id = ${programId} AND responses ->> ${field.fieldKey} IS NOT NULL
      GROUP BY value
      ORDER BY count DESC
      LIMIT ${MAX_OPTIONS_PER_FIELD}
    `);

    if (result.rows.length === 0) continue;

    breakdowns.push({
      fieldKey: field.fieldKey,
      label: field.label,
      data: result.rows.map((r) => ({ value: r.value ?? "Unknown", count: Number(r.count) })),
    });
  }

  return breakdowns;
}
