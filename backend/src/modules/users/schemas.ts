import { z } from "zod";
import { dateRangeQuery } from "../../lib/dateRange.js";
import { paginationSchema } from "../../lib/pagination.js";

// A tenant admin invites teammates only -- never another admin/super_admin.
// There is exactly one admin per tenant, created via /auth/register.
export const inviteRoleValues = ["program_admin", "viewer"] as const;
export const programRoleValues = ["admin", "viewer"] as const;

export const createUserSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  role: z.enum(inviteRoleValues),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  role: z.enum(inviteRoleValues).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export const addProgramMembershipSchema = z.object({
  programId: z.string().uuid(),
  roleOnProgram: z.enum(programRoleValues),
});

export const listUsersQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  ...dateRangeQuery,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AddProgramMembershipInput = z.infer<typeof addProgramMembershipSchema>;
