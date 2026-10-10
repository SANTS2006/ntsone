import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { businessMembers, businesses, pollMembers, polls, programMembers, programs, users } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { sendSuccess } from "../../lib/response.js";
import { generateVerificationCode } from "../../lib/tokens.js";
import { recordAudit } from "../audit/recorder.js";
import * as usersRepo from "../users/repository.js";
import * as authRepo from "../auth/repository.js";
import { generateUniqueTenantSlug } from "../auth/service.js";
import { queueEmail } from "../email/outbox.js";
import { resourceAccessEmail } from "../email/templates.js";
import { requireBusinessAccess } from "../businesses/access.js";
import { requirePollAccess } from "../polls/access.js";
import { requireProgramAccess } from "../../middleware/authorize.js";

// Who has access to a program, poll, or business, and how an admin of it gives access to others.
// A person given access keeps their own space: they can be a viewer here and the admin of their
// own, separate things, and the access works across accounts.

type Kind = "program" | "poll" | "business";
type Role = "admin" | "viewer";

interface Resource {
  id: string;
  name: string;
  tenantId: string;
}

interface Adapter {
  label: string;
  find(id: string): Promise<Resource | null>;
  members(id: string): Promise<{ userId: string; role: Role; addedAt: Date }[]>;
  upsert(userId: string, id: string, role: Role): Promise<void>;
  remove(userId: string, id: string): Promise<void>;
  path(id: string): string;
}

const ADAPTERS: Record<Kind, Adapter> = {
  program: {
    label: "program",
    async find(id) {
      const [row] = await db
        .select({ id: programs.id, name: programs.name, tenantId: programs.tenantId })
        .from(programs)
        .where(and(eq(programs.id, id), isNull(programs.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async members(id) {
      const rows = await db
        .select({ userId: programMembers.userId, role: programMembers.roleOnProgram, addedAt: programMembers.createdAt })
        .from(programMembers)
        .where(eq(programMembers.programId, id));
      return rows;
    },
    async upsert(userId, id, role) {
      await db
        .insert(programMembers)
        .values({ userId, programId: id, roleOnProgram: role })
        .onConflictDoUpdate({ target: [programMembers.userId, programMembers.programId], set: { roleOnProgram: role } });
    },
    async remove(userId, id) {
      await db.delete(programMembers).where(and(eq(programMembers.userId, userId), eq(programMembers.programId, id)));
    },
    path: (id) => `/admin/programs/${id}`,
  },
  poll: {
    label: "voting poll",
    async find(id) {
      const [row] = await db
        .select({ id: polls.id, name: polls.name, tenantId: polls.tenantId })
        .from(polls)
        .where(and(eq(polls.id, id), isNull(polls.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async members(id) {
      return db
        .select({ userId: pollMembers.userId, role: pollMembers.roleOnPoll, addedAt: pollMembers.createdAt })
        .from(pollMembers)
        .where(eq(pollMembers.pollId, id));
    },
    async upsert(userId, id, role) {
      await db
        .insert(pollMembers)
        .values({ userId, pollId: id, roleOnPoll: role })
        .onConflictDoUpdate({ target: [pollMembers.userId, pollMembers.pollId], set: { roleOnPoll: role } });
    },
    async remove(userId, id) {
      await db.delete(pollMembers).where(and(eq(pollMembers.userId, userId), eq(pollMembers.pollId, id)));
    },
    path: (id) => `/admin/polls/${id}`,
  },
  business: {
    label: "business",
    async find(id) {
      const [row] = await db
        .select({ id: businesses.id, name: businesses.name, tenantId: businesses.tenantId })
        .from(businesses)
        .where(and(eq(businesses.id, id), isNull(businesses.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async members(id) {
      return db
        .select({ userId: businessMembers.userId, role: businessMembers.roleOnBusiness, addedAt: businessMembers.createdAt })
        .from(businessMembers)
        .where(eq(businessMembers.businessId, id));
    },
    async upsert(userId, id, role) {
      await db
        .insert(businessMembers)
        .values({ userId, businessId: id, roleOnBusiness: role })
        .onConflictDoUpdate({ target: [businessMembers.userId, businessMembers.businessId], set: { roleOnBusiness: role } });
    },
    async remove(userId, id) {
      await db.delete(businessMembers).where(and(eq(businessMembers.userId, userId), eq(businessMembers.businessId, id)));
    },
    path: (id) => `/admin/businesses/${id}`,
  },
};

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  name: z.string().trim().min(2).max(200).optional(),
  role: z.enum(["admin", "viewer"]),
});
const roleSchema = z.object({ role: z.enum(["admin", "viewer"]) });

/** A password that is easy to type from an email once, and never reused: letters and digits, no look-alikes. */
const temporaryPassword = () => `${generateVerificationCode()}${generateVerificationCode()}`.replace(/\s/g, "") + "!7";

async function resourceOr404(kind: Kind, id: string): Promise<Resource> {
  const resource = await ADAPTERS[kind].find(id);
  if (!resource) throw AppError.notFound(`${ADAPTERS[kind].label[0]!.toUpperCase()}${ADAPTERS[kind].label.slice(1)} not found`);
  return resource;
}

/** Everyone with access: the account's own admins (always full access) and the people given access. */
export async function listAccess(kind: Kind, id: string) {
  const resource = await resourceOr404(kind, id);
  const [given, owners] = await Promise.all([
    ADAPTERS[kind].members(id),
    db
      .select({ id: users.id, name: users.name, email: users.email, status: users.status })
      .from(users)
      .where(and(eq(users.tenantId, resource.tenantId), eq(users.role, "admin")))
      .orderBy(asc(users.createdAt)),
  ]);
  const ownerIds = new Set(owners.map((o) => o.id));
  const people = given.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, status: users.status })
        .from(users)
        .where(inArray(users.id, given.map((m) => m.userId)))
    : [];
  const byId = new Map(people.map((u) => [u.id, u]));
  const rows = [
    ...owners.map((o) => ({ userId: o.id, name: o.name, email: o.email, role: "admin" as Role, status: o.status, inherited: true, addedAt: null as Date | null })),
    ...given
      .filter((m) => !ownerIds.has(m.userId) && byId.has(m.userId))
      .map((m) => {
        const u = byId.get(m.userId)!;
        return { userId: m.userId, name: u.name, email: u.email, role: m.role, status: u.status, inherited: false, addedAt: m.addedAt as Date | null };
      }),
  ];
  return rows;
}

export async function inviteMember(
  kind: Kind,
  id: string,
  actor: { id: string; name: string; email: string },
  input: z.infer<typeof inviteSchema>,
) {
  const adapter = ADAPTERS[kind];
  const resource = await resourceOr404(kind, id);
  if (input.email === actor.email.toLowerCase()) throw AppError.validation("You already have access to this " + adapter.label);

  let [person] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  let password: string | null = null;
  if (person) {
    if (person.role === "super_admin") throw AppError.validation("That email can't be given access");
    if (person.role === "admin" && person.tenantId === resource.tenantId) {
      throw AppError.conflict("That person already has full access to this " + adapter.label + " as an account admin");
    }
  } else {
    // A new person gets an account with a space of its own, so they can use the platform for their
    // own work as well as for what they were invited to.
    password = temporaryPassword();
    const displayName = input.name ?? input.email.split("@")[0]!.replace(/[._-]+/g, " ");
    const spaceName = `${displayName.split(/\s+/)[0]}'s space`;
    const created = await authRepo.createTenantAndAdmin({
      organizationName: spaceName,
      slug: await generateUniqueTenantSlug(spaceName),
      name: displayName,
      email: input.email,
      passwordHash: await hashPassword(password),
      termsAccepted: false,
    });
    person = created.user;
  }

  await adapter.upsert(person.id, id, input.role);
  // They also appear under Users, with the role they were invited into (people already inside the account already do).
  if (person.tenantId !== resource.tenantId) await usersRepo.ensureTeamLink(resource.tenantId, person.id, input.role === "admin" ? "program_admin" : "viewer");

  const message = resourceAccessEmail({
    name: person.name,
    email: person.email,
    inviterName: actor.name,
    resourceLabel: adapter.label,
    resourceName: resource.name,
    role: input.role,
    temporaryPassword: password,
    url: `${env.APP_URL.replace(/\/+$/, "")}${password ? "/login" : adapter.path(id)}`,
  });
  // Access is already saved; a mail outage must not undo it.
  void queueEmail({ to: person.email, toName: person.name, subject: message.subject, html: message.html });
  return listAccess(kind, id);
}

export async function changeRole(kind: Kind, id: string, userId: string, role: Role) {
  const resource = await resourceOr404(kind, id);
  const current = (await ADAPTERS[kind].members(id)).find((m) => m.userId === userId);
  if (!current) throw AppError.notFound("That person doesn't have access through an invitation");
  void resource;
  await ADAPTERS[kind].upsert(userId, id, role);
  return listAccess(kind, id);
}

export async function removeMember(kind: Kind, id: string, userId: string) {
  await resourceOr404(kind, id);
  await ADAPTERS[kind].remove(userId, id);
  return listAccess(kind, id);
}

type IdParams = { id: string };

/** Mounts the access routes for programs, polls, and businesses: /<kind>s/:id/members. */
export async function accessRoutes(app: FastifyInstance) {
  const guards: Record<Kind, { admin: (r: FastifyRequest, ...a: never[]) => Promise<void> }> = {
    program: { admin: requireProgramAccess("admin") as never },
    poll: { admin: requirePollAccess("admin") as never },
    business: { admin: requireBusinessAccess("admin") as never },
  };
  const defs: { kind: Kind; base: string; param: string }[] = [
    { kind: "program", base: "/programs", param: "programId" },
    { kind: "poll", base: "/polls", param: "pollId" },
    { kind: "business", base: "/businesses", param: "businessId" },
  ];

  for (const { kind, base, param } of defs) {
    const path = `${base}/:${param}/members`;
    const idOf = (request: FastifyRequest) => (request.params as Record<string, string>)[param]!;
    const preHandler = guards[kind].admin as never;

    app.get(path, { preHandler }, async (request, reply) => {
      return sendSuccess(reply, await listAccess(kind, idOf(request)));
    });

    app.post(path, { preHandler, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
      const input = inviteSchema.parse(request.body);
      const people = await inviteMember(kind, idOf(request), request.user!, input);
      await recordAudit({ actorUserId: request.user!.id, action: `${kind}.member_invite`, entityType: kind, entityId: idOf(request), metadata: { role: input.role }, ipAddress: request.ip });
      return sendSuccess(reply, people, "Access given");
    });

    app.patch<{ Params: IdParams & { userId: string } }>(`${path}/:userId`, { preHandler }, async (request, reply) => {
      const { role } = roleSchema.parse(request.body);
      const people = await changeRole(kind, idOf(request), request.params.userId, role);
      await recordAudit({ actorUserId: request.user!.id, action: `${kind}.member_role`, entityType: kind, entityId: idOf(request), metadata: { role }, ipAddress: request.ip });
      return sendSuccess(reply, people, "Role updated");
    });

    app.delete<{ Params: IdParams & { userId: string } }>(`${path}/:userId`, { preHandler }, async (request, reply) => {
      const people = await removeMember(kind, idOf(request), request.params.userId);
      await recordAudit({ actorUserId: request.user!.id, action: `${kind}.member_remove`, entityType: kind, entityId: idOf(request), ipAddress: request.ip });
      return sendSuccess(reply, people, "Access removed");
    });
  }
}
