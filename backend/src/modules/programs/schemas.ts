import { z } from "zod";
import { ownImageUrl } from "../../lib/cloudinaryUrl.js";
import { paginationSchema } from "../../lib/pagination.js";
import { registrationNumberConfigSchema } from "../registrations/numbering.js";

export const programStatusValues = ["draft", "published", "closed", "archived"] as const;

export const createProgramSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(20000).optional(),
  shortDescription: z.string().max(500).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  registrationStartDate: z.coerce.date().optional(),
  registrationEndDate: z.coerce.date().optional(),
  // Only used by the platform super_admin, who belongs to no account of its own.
  tenantId: z.string().uuid().optional(),
});

export const updateProgramSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(20000).optional(),
  shortDescription: z.string().max(500).optional(),
  thumbnailUrl: ownImageUrl.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  registrationStartDate: z.coerce.date().optional(),
  registrationEndDate: z.coerce.date().optional(),
  registrationEnabled: z.boolean().optional(),
  idCardEnabled: z.boolean().optional(),
  ticketEnabled: z.boolean().optional(),
  oneRegistrationPerEmail: z.boolean().optional(),
  notifyOnRegistration: z.boolean().optional(),
  allowSubmissionCopy: z.boolean().optional(),
  notifyOnVerification: z.boolean().optional(),
  registrationNumberConfig: registrationNumberConfigSchema.optional(),
});

export const listProgramsQuerySchema = paginationSchema.extend({
  status: z.enum(programStatusValues).optional(),
  search: z.string().trim().min(1).optional(),
});

export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
export type ListProgramsQuery = z.infer<typeof listProgramsQuerySchema>;
