import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export function toOffsetLimit(input: PaginationInput) {
  return {
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  input: PaginationInput,
) {
  return {
    items,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}
