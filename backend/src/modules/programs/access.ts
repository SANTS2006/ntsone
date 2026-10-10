import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { businessMembers, programMembers, programs } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import type { AuthenticatedUser, ProgramRole } from "../users/types.js";

/**
 * Never trust a programId or role supplied by the client. This is the single
 * enforcement point for per-program data isolation -- every registration/form
 * service call must route through here before touching data.
 *
 * Tenant boundary: the platform super_admin bypasses everything (read-only is
 * enforced globally elsewhere, not here); a tenant "admin" bypasses
 * program_members the same way, but only for programs inside their OWN
 * tenant. Everyone else, in any account, needs a program_members row (or a
 * business membership for an order form). No row means "no access", identically
 * to "doesn't exist".
 *
 * A business's order form is a program too: its team gets the role they have on the business.
 */
export async function getProgramRole(
  user: AuthenticatedUser,
  programId: string,
): Promise<ProgramRole | null> {
  if (user.role === "super_admin") return "admin";

  const [program] = await db
    .select({ tenantId: programs.tenantId, businessId: programs.businessId })
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);
  if (!program) return null;
  // The owner of the account the program lives in has full access. Anyone else needs to have been
  // given access to this program, and that works across accounts: a person invited to someone
  // else's program keeps their own space and can still be a viewer or admin here.
  if (user.role === "admin" && program.tenantId === user.tenantId) return "admin";

  const [membership] = await db
    .select({ roleOnProgram: programMembers.roleOnProgram })
    .from(programMembers)
    .where(and(eq(programMembers.userId, user.id), eq(programMembers.programId, programId)))
    .limit(1);
  if (membership) return membership.roleOnProgram;

  if (program.businessId) {
    const [businessMembership] = await db
      .select({ role: businessMembers.roleOnBusiness })
      .from(businessMembers)
      .where(and(eq(businessMembers.userId, user.id), eq(businessMembers.businessId, program.businessId)))
      .limit(1);
    return businessMembership?.role ?? null;
  }
  return null;
}

export async function assertProgramAccess(
  user: AuthenticatedUser,
  programId: string,
  minRole: ProgramRole = "viewer",
): Promise<ProgramRole> {
  const role = await getProgramRole(user, programId);
  if (!role) {
    throw AppError.forbidden("You do not have access to this program");
  }
  if (minRole === "admin" && role !== "admin") {
    throw AppError.forbidden("You need admin access to this program to perform this action");
  }
  return role;
}

/**
 * The program IDs the user may see in program listings, dashboards, and analytics. Business
 * order forms are left out (they belong to their business) unless asked for.
 */
export async function listAccessibleProgramIds(
  user: AuthenticatedUser,
  kind: "program" | "order_form" = "program",
): Promise<string[] | "all"> {
  const ofKind = and(isNull(programs.deletedAt), eq(programs.kind, kind));

  if (user.role === "super_admin") {
    const rows = await db.select({ id: programs.id }).from(programs).where(ofKind);
    return rows.map((r) => r.id);
  }

  const shared = await db
    .select({ programId: programMembers.programId })
    .from(programMembers)
    .innerJoin(programs, eq(programs.id, programMembers.programId))
    .where(and(ofKind, eq(programMembers.userId, user.id)));
  const ids = new Set(shared.map((r) => r.programId));

  if (user.role === "admin") {
    const own = await db
      .select({ id: programs.id })
      .from(programs)
      .where(and(ofKind, eq(programs.tenantId, user.tenantId!)));
    for (const r of own) ids.add(r.id);
  }
  return [...ids];
}
