import { z } from "zod";

export const registrationNumberConfigSchema = z.object({
  prefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9]*$/, "Prefix can only contain letters and numbers")
    .default("REG"),
  separator: z.enum(["-", "/", ""]).default("-"),
  includeYear: z.boolean().default(true),
  digits: z.number().int().min(3).max(10).default(6),
  startAt: z.number().int().min(1).max(999_999_999).default(1),
});

export type RegistrationNumberConfig = z.infer<typeof registrationNumberConfigSchema>;

export function resolveNumberingConfig(raw: unknown): RegistrationNumberConfig {
  const parsed = registrationNumberConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : registrationNumberConfigSchema.parse({});
}

/**
 * Counters are kept per (program, year). Formats without the year share one
 * running counter, stored under year 0, so numbering never restarts.
 */
export function counterBucket(config: RegistrationNumberConfig, year: number): number {
  return config.includeYear ? year : 0;
}

export function formatRegistrationNumber(config: RegistrationNumberConfig, year: number, sequence: number): string {
  const number = String(config.startAt + sequence - 1).padStart(config.digits, "0");
  const parts = [config.prefix.toUpperCase(), config.includeYear ? String(year) : "", number].filter(Boolean);
  return parts.join(config.separator);
}
