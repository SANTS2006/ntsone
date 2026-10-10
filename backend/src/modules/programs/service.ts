import slugify from "slugify";
import { AppError } from "../../lib/errors.js";
import type { PaginationInput } from "../../lib/pagination.js";
import { buildPaginatedResult } from "../../lib/pagination.js";
import * as formsService from "../forms/service.js";
import type { AuthenticatedUser } from "../users/types.js";
import { listAccessibleProgramIds } from "./access.js";
import * as programsRepo from "./repository.js";
import type { CreateProgramInput, ListProgramsQuery, UpdateProgramInput } from "./schemas.js";

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name, { lower: true, strict: true }).slice(0, 180) || "program";
  let candidate = base;
  let suffix = 2;
  while (await programsRepo.slugExists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function createProgram(user: AuthenticatedUser, input: CreateProgramInput) {
  let tenantId = user.tenantId;
  if (user.role === "super_admin") {
    if (!input.tenantId) throw AppError.validation("Choose the account this program belongs to");
    if (!(await programsRepo.tenantExists(input.tenantId))) throw AppError.notFound("Account not found");
    tenantId = input.tenantId;
  }
  if (!tenantId) throw AppError.forbidden("This account cannot create programs");
  const slug = await generateUniqueSlug(input.name);
  const program = await programsRepo.insertProgram({
    name: input.name,
    slug,
    description: input.description,
    shortDescription: input.shortDescription,
    startDate: input.startDate,
    endDate: input.endDate,
    registrationStartDate: input.registrationStartDate,
    registrationEndDate: input.registrationEndDate,
    createdBy: user.id,
    tenantId,
  });

  // Tenant admins bypass program_members entirely (like the platform
  // super_admin does), so only program_admin/viewer creators need an
  // explicit membership row to see what they just made.
  if (user.role !== "admin" && user.role !== "super_admin") {
    await programsRepo.addProgramMember(user.id, program.id, "admin");
  }

  return program;
}

export async function listPrograms(user: AuthenticatedUser, query: ListProgramsQuery) {
  const accessibleProgramIds = await listAccessibleProgramIds(user);
  const pagination: PaginationInput = { page: query.page, pageSize: query.pageSize };
  const { items, total } = await programsRepo.listPrograms(
    { accessibleProgramIds, status: query.status, search: query.search },
    pagination,
  );
  return buildPaginatedResult(items, total, pagination);
}

export async function getProgram(programId: string) {
  const program = await programsRepo.findProgramById(programId);
  if (!program) throw AppError.notFound("Program not found");
  return program;
}

export async function updateProgram(programId: string, input: UpdateProgramInput) {
  await getProgram(programId);
  return programsRepo.updateProgramRow(programId, input);
}

export async function deleteProgram(programId: string) {
  await getProgram(programId);
  await programsRepo.softDeleteProgram(programId);
}

export async function publishProgram(programId: string) {
  const program = await getProgram(programId);
  if (program.status === "archived") throw AppError.conflict("Cannot publish an archived program");
  return programsRepo.updateProgramRow(programId, { status: "published" });
}

export async function unpublishProgram(programId: string) {
  const program = await getProgram(programId);
  if (program.status === "archived") throw AppError.conflict("Cannot unpublish an archived program");
  return programsRepo.updateProgramRow(programId, { status: "draft", registrationEnabled: false });
}

export async function closeRegistration(programId: string) {
  await getProgram(programId);
  return programsRepo.updateProgramRow(programId, { registrationEnabled: false, status: "closed" });
}

export async function reopenRegistration(programId: string) {
  const program = await getProgram(programId);
  if (program.status === "archived") throw AppError.conflict("Cannot reopen an archived program");
  return programsRepo.updateProgramRow(programId, { registrationEnabled: true, status: "published" });
}

export async function archiveProgram(programId: string) {
  await getProgram(programId);
  return programsRepo.updateProgramRow(programId, { status: "archived", registrationEnabled: false });
}

export async function duplicateProgram(user: AuthenticatedUser, programId: string) {
  const source = await getProgram(programId);
  const name = `${source.name} (Copy)`;
  const slug = await generateUniqueSlug(name);

  const copy = await programsRepo.insertProgram({
    name,
    slug,
    description: source.description,
    shortDescription: source.shortDescription,
    idCardEnabled: source.idCardEnabled,
    createdBy: user.id,
    tenantId: source.tenantId,
    status: "draft",
    registrationEnabled: false,
  });

  if (user.role !== "admin" && user.role !== "super_admin") {
    await programsRepo.addProgramMember(user.id, copy.id, "admin");
  }

  await formsService.duplicateFormForProgram(programId, copy.id);

  return copy;
}

export async function setThumbnail(programId: string, thumbnailUrl: string) {
  await getProgram(programId);
  return programsRepo.updateProgramRow(programId, { thumbnailUrl });
}
