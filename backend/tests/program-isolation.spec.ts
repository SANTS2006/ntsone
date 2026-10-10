import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import {
  addMembership,
  createPublishedForm,
  createTestProgram,
  createTestRegistration,
  createTestUser,
  deleteTestProgram,
  deleteTestUser,
} from "./helpers.js";

/**
 * Proves the core data-isolation guarantee (spec §6/§56): a program_admin scoped
 * to Program A must never be able to read Program B's registrations, whether by
 * listing B directly, fetching B's registration by id, or by swapping the
 * programId in the URL while requesting a registration that actually belongs
 * to the other program.
 */
describe("program isolation", () => {
  let app: FastifyInstance;
  let ownerId: string;
  let scopedAdminId: string;
  let scopedAdminEmail: string;
  let programAId: string;
  let programBId: string;
  let registrationAId: string;
  let registrationBId: string;
  let scopedAdminToken: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    const owner = await createTestUser("super_admin", "isolation-owner");
    ownerId = owner.user.id;

    const scopedAdmin = await createTestUser("program_admin", "isolation-scoped");
    scopedAdminId = scopedAdmin.user.id;
    scopedAdminEmail = scopedAdmin.user.email;

    const programA = await createTestProgram(ownerId, "Isolation Program A");
    const programB = await createTestProgram(ownerId, "Isolation Program B");
    programAId = programA.id;
    programBId = programB.id;

    const formA = await createPublishedForm(programAId);
    const formB = await createPublishedForm(programBId);

    const regA = await createTestRegistration(programAId, formA.id, `REG-ISOA-${Date.now()}`);
    const regB = await createTestRegistration(programBId, formB.id, `REG-ISOB-${Date.now()}`);
    registrationAId = regA.id;
    registrationBId = regB.id;

    await addMembership(scopedAdminId, programAId, "admin");

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: scopedAdminEmail, password: scopedAdmin.password },
    });
    scopedAdminToken = loginRes.json().data.accessToken;
  });

  afterAll(async () => {
    await deleteTestProgram(programAId);
    await deleteTestProgram(programBId);
    await deleteTestUser(scopedAdminId);
    await deleteTestUser(ownerId);
    await app.close();
    await pool.end();
  });

  const authHeader = () => ({ authorization: `Bearer ${scopedAdminToken}` });

  it("allows the scoped admin to list registrations for their own program", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/programs/${programAId}/registrations`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.items.map((r: { id: string }) => r.id);
    expect(ids).toContain(registrationAId);
    expect(ids).not.toContain(registrationBId);
  });

  it("allows the scoped admin to fetch their own registration by id", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/programs/${programAId}/registrations/${registrationAId}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.registration.id).toBe(registrationAId);
  });

  it("denies listing registrations for a program the scoped admin has no access to", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/programs/${programBId}/registrations`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies fetching a specific registration from a program the scoped admin has no access to", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/programs/${programBId}/registrations/${registrationBId}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns not found when the registration id belongs to a different program than the URL, even for an authorized program", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/programs/${programAId}/registrations/${registrationBId}`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("never returns program B in the scoped admin's program list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/programs?pageSize=100", headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(programAId);
    expect(ids).not.toContain(programBId);
  });

  it("denies status updates on a registration outside the scoped admin's program", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/programs/${programBId}/registrations/${registrationBId}/status`,
      headers: authHeader(),
      payload: { status: "approved" },
    });
    expect(res.statusCode).toBe(403);
  });
});
