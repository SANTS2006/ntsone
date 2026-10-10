import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { PaginationInput } from "../../lib/pagination.js";
import { buildPaginatedResult } from "../../lib/pagination.js";
import { hashPassword } from "../../lib/password.js";
import { queueEmail } from "../email/outbox.js";
import { sendEmail } from "../email/service.js";
import { invitationEmail, teamAddedEmail } from "../email/templates.js";
import * as authRepo from "../auth/repository.js";
import { generateUniqueTenantSlug } from "../auth/service.js";
import * as usersRepo from "./repository.js";
import type { AddProgramMembershipInput, CreateUserInput, UpdateUserInput } from "./schemas.js";

const linkRoleOf = (role: CreateUserInput["role"]) => role;

/**
 * Adds someone to the team. A brand-new person gets an account with a space of their own (so they can
 * make their own programs, polls and businesses), and is listed here with the role they were
 * invited into. Someone who already has an account is simply added to the team.
 */
export async function createUser(tenantId: string, input: CreateUserInput, inviter: { name: string }) {
  const email = input.email.toLowerCase();
  const organizationName = (await usersRepo.findTenantName(tenantId)) ?? "your organization";
  const existing = await usersRepo.findUserByEmail(email);

  if (existing) {
    if (existing.role === "super_admin") throw AppError.validation("That email can't be added to a team");
    if (existing.tenantId === tenantId) throw AppError.conflict("That person is already on your team");
    const already = await usersRepo.findTeamMember(existing.id, tenantId);
    if (already) throw AppError.conflict("That person is already on your team");
    await usersRepo.ensureTeamLink(tenantId, existing.id, linkRoleOf(input.role));
    const message = teamAddedEmail({
      name: existing.name,
      inviterName: inviter.name,
      organizationName,
      role: input.role,
      loginUrl: `${env.APP_URL}/login`,
    });
    void queueEmail({ to: existing.email, toName: existing.name, subject: message.subject, html: message.html });
    return teamMember(tenantId, existing.id);
  }

  const passwordHash = await hashPassword(input.password);
  const spaceName = `${input.name.trim().split(/\s+/)[0]}'s space`;
  const { user } = await authRepo.createTenantAndAdmin({
    organizationName: spaceName,
    slug: await generateUniqueTenantSlug(spaceName),
    name: input.name,
    email,
    passwordHash,
    termsAccepted: false,
  });
  await usersRepo.ensureTeamLink(tenantId, user.id, linkRoleOf(input.role));

  const message = invitationEmail({
    name: user.name,
    email: user.email,
    inviterName: inviter.name,
    organizationName,
    role: input.role,
    temporaryPassword: input.password,
    loginUrl: `${env.APP_URL}/login`,
  });
  await sendEmail({ to: user.email, toName: user.name, subject: message.subject, html: message.html });

  return teamMember(tenantId, user.id);
}

/** One team member as the Users page shows them: the role they were invited into, and whether they have their own space. */
async function teamMember(tenantId: string, id: string) {
  const member = await usersRepo.findTeamMember(id, tenantId);
  if (!member) throw AppError.notFound("User not found");
  const { passwordHash, ...rest } = member.user;
  void passwordHash;
  return { ...rest, role: member.role, ownSpace: member.ownSpace };
}

export async function listUsers(tenantId: string, search: string | undefined, pagination: PaginationInput, range: { dateFrom?: Date; dateTo?: Date } = {}) {
  const { items, total } = await usersRepo.listUsers(tenantId, search, pagination, range);
  return buildPaginatedResult(items, total, pagination);
}

export async function getUser(tenantId: string, id: string) {
  // A person from another account resolves the same as a nonexistent one -- callers must
  // never be able to tell the two apart.
  return teamMember(tenantId, id);
}

export async function updateUser(tenantId: string, id: string, input: UpdateUserInput) {
  const member = await usersRepo.findTeamMember(id, tenantId);
  if (!member) throw AppError.notFound("User not found");

  if (!member.ownSpace) {
    await usersRepo.updateUser(id, tenantId, input);
    return teamMember(tenantId, id);
  }

  // Someone with a space of their own: their account is theirs. Their role on your team (and so what
  // they can do with everything of yours they have access to) is what you control from here.
  if (input.status) {
    throw AppError.conflict("This person has a space of their own, so their account can't be suspended here. Remove them from your team instead.");
  }
  if (input.role) {
    await usersRepo.setTeamLinkRole(tenantId, id, input.role);
    await usersRepo.applyRoleToMemberships(tenantId, id, input.role);
  }
  return teamMember(tenantId, id);
}

/** Takes someone with a space of their own off the team, and removes their access to your things. */
export async function removeTeamMember(tenantId: string, id: string) {
  const member = await usersRepo.findTeamMember(id, tenantId);
  if (!member) throw AppError.notFound("User not found");
  if (!member.ownSpace) throw AppError.conflict("This person belongs to your account. Suspend them instead.");
  await usersRepo.removeFromTeam(tenantId, id);
}

export async function listMemberships(tenantId: string, userId: string) {
  await getUser(tenantId, userId);
  return usersRepo.listMembershipsForUser(userId, tenantId);
}

export async function addMembership(tenantId: string, userId: string, input: AddProgramMembershipInput) {
  await getUser(tenantId, userId);
  const programInTenant = await usersRepo.programBelongsToTenant(input.programId, tenantId);
  if (!programInTenant) throw AppError.notFound("Program not found");
  await usersRepo.upsertMembership(userId, input.programId, input.roleOnProgram);
  return usersRepo.listMembershipsForUser(userId, tenantId);
}

export async function removeMembership(tenantId: string, userId: string, programId: string) {
  await getUser(tenantId, userId);
  await usersRepo.removeMembership(userId, programId);
}

function sanitize(user: { passwordHash?: string } & Record<string, unknown>) {
  const { passwordHash, ...rest } = user;
  return rest;
}
