import { z } from "zod";
import { isOwnCloudinaryUrl } from "../../lib/cloudinaryUrl.js";
import { paginationSchema } from "../../lib/pagination.js";
import { orderSelectionSchema } from "../payments/pricing.js";

export const programStatusChoices = ["submitted", "under_review", "approved", "rejected", "waitlisted", "cancelled"] as const;

// A business can add its own order statuses, so this only checks the shape; the service checks
// the status is one the program or business actually uses.
const statusKey = z.string().trim().min(1).max(30).regex(/^[a-z0-9_]+$/);

export const updateStatusSchema = z.object({
  status: statusKey,
  note: z.string().max(1000).optional(),
});

export const listRegistrationsQuerySchema = paginationSchema.extend({
  status: statusKey.optional(),
  paymentStatus: z.enum(["none", "pending", "paid", "review", "waived", "refunded"]).optional(),
  search: z.string().trim().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(["submittedAt", "registrationNumber", "status"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export const exportRegistrationsQuerySchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  status: statusKey.optional(),
  paymentStatus: z.enum(["none", "pending", "paid", "review", "waived", "refunded"]).optional(),
  search: z.string().trim().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const submittedFileSchema = z.object({
  fieldKey: z.string().min(1),
  url: z.string().url().refine(isOwnCloudinaryUrl, "Files must be uploaded through the registration form"),
  publicId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export const submitRegistrationSchema = z.object({
  responses: z.record(z.string(), z.unknown()),
  files: z.array(submittedFileSchema).optional().default([]),
  consentAccepted: z.boolean().optional(),
  // For an order form that sells items: what was chosen (the prices always come from the server's own list).
  items: orderSelectionSchema.optional(),
  // The registrant will buy the ID card or ticket in person at the program instead of paying for it online.
  documentsInPerson: z.boolean().optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListRegistrationsQuery = z.infer<typeof listRegistrationsQuerySchema>;
export type ExportRegistrationsQuery = z.infer<typeof exportRegistrationsQuerySchema>;
export type SubmitRegistrationInput = z.infer<typeof submitRegistrationSchema>;
