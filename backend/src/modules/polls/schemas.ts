import { dateRangeQuery } from "../../lib/dateRange.js";
import { z } from "zod";
import { ownImageUrl } from "../../lib/cloudinaryUrl.js";
import { paginationSchema } from "../../lib/pagination.js";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const imageUrl = ownImageUrl.nullish().transform((v) => v ?? null);

// "example.edu, @school.org" -> "example.edu, school.org"
const domainList = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) =>
    v
      ? v
          .split(/[\s,;]+/)
          .map((d) => d.replace(/^@/, "").toLowerCase())
          .filter(Boolean)
          .join(", ")
      : null,
  )
  .refine((v) => !v || v.split(", ").every((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)), "Enter email domains like example.edu");

export const createPollSchema = z.object({
  name: text(200).min(2, "Give the poll a name"),
  description: optionalText(2000),
  tenantId: z.string().uuid().optional(),
});

export const updatePollSchema = z
  .object({
    name: text(200).min(2),
    description: optionalText(2000),
    imageUrl,
    closesAt: z.coerce.date().nullable(),
    onePerEmail: z.boolean(),
    restrictEmailDomain: z.boolean(),
    allowedEmailDomains: domainList,
    showResults: z.boolean(),
    notifyOnVote: z.boolean(),
  })
  .partial();

export const verifiedVotersSchema = z.object({
  enabled: z.boolean(),
  emails: z.array(z.string().trim().toLowerCase().email("Enter valid email addresses").max(254)).max(5000, "Add at most 5,000 emails at a time"),
});

export const listPollsQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["draft", "open", "closed"]).optional(),
});

export const saveBallotSchema = z.object({
  positions: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        title: text(200).min(1, "Every position needs a title"),
        description: optionalText(1000),
        imageUrl,
        candidates: z
          .array(
            z.object({
              id: z.string().uuid().optional(),
              name: text(200).min(1, "Every candidate needs a name"),
              description: optionalText(1000),
              imageUrl,
            }),
          )
          .max(100),
      }),
    )
    .max(100),
});

export const listVotersQuerySchema = paginationSchema.extend({
  ...dateRangeQuery,
  search: z.string().trim().min(1).optional(),
});

export type CreatePollInput = z.infer<typeof createPollSchema>;
export type UpdatePollInput = z.infer<typeof updatePollSchema>;
export type SaveBallotInput = z.infer<typeof saveBallotSchema>;
