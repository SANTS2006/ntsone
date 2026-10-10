import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { createTestProgram, createTestUser, deleteTestProgram, deleteTestUser } from "./helpers.js";

describe("registration submission flow", () => {
  let app: FastifyInstance;
  let ownerId: string;
  let ownerToken: string;
  let programId: string;
  let programSlug: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    const owner = await createTestUser("super_admin", "regflow-owner");
    ownerId = owner.user.id;

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: owner.user.email, password: owner.password },
    });
    ownerToken = loginRes.json().data.accessToken;

    const createRes = await app.inject({
      method: "POST",
      url: "/api/programs",
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: `Registration Flow Test ${Date.now()}` },
    });
    const program = createRes.json().data;
    programId = program.id;
    programSlug = program.slug;

    await app.inject({
      method: "PATCH",
      url: `/api/programs/${programId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { registrationEnabled: true },
    });
    await app.inject({
      method: "POST",
      url: `/api/programs/${programId}/publish`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    await app.inject({
      method: "POST",
      url: `/api/programs/${programId}/form`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        title: "Test Registration Form",
        sections: [],
        fields: [
          {
            fieldKey: "full_name",
            sectionKey: null,
            type: "short_text",
            label: "Full Name",
            required: true,
            orderIndex: 0,
            config: {},
          },
          {
            fieldKey: "email",
            sectionKey: null,
            type: "email",
            label: "Email",
            required: true,
            orderIndex: 1,
            config: {},
          },
        ],
      },
    });
    await app.inject({
      method: "POST",
      url: `/api/programs/${programId}/form/publish`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
  });

  afterAll(async () => {
    await deleteTestProgram(programId);
    await deleteTestUser(ownerId);
    await app.close();
    await pool.end();
  });

  it("rejects a submission missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/public/programs/${programSlug}/registrations`,
      payload: { responses: { full_name: "" } },
    });
    expect(res.statusCode).toBe(400);
  });

  let registrationId: string;
  let registrationNumber: string;

  it("accepts a valid submission and returns a formatted registration number", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/public/programs/${programSlug}/registrations`,
      payload: { responses: { full_name: "Ada Lovelace", email: "ada@test.local" } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    registrationNumber = body.registrationNumber;
    expect(registrationNumber).toMatch(/^REG-\d{4}-\d{6}$/);
  });

  it("records the submission with a 'submitted' history entry", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/api/programs/${programId}/registrations`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const match = listRes.json().data.items.find((r: { registrationNumber: string }) => r.registrationNumber === registrationNumber);
    expect(match).toBeDefined();
    registrationId = match.id;

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/programs/${programId}/registrations/${registrationId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const history = detailRes.json().data.history;
    expect(history.some((h: { toStatus: string }) => h.toStatus === "submitted")).toBe(true);
  });

  it("updates status and appends a new history entry", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/programs/${programId}/registrations/${registrationId}/status`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { status: "approved", note: "Looks good" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("approved");

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/programs/${programId}/registrations/${registrationId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const history = detailRes.json().data.history;
    expect(history.some((h: { toStatus: string }) => h.toStatus === "approved")).toBe(true);
  });

  it("rejects submissions once registration is closed", async () => {
    await app.inject({
      method: "POST",
      url: `/api/programs/${programId}/registration/close`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/public/programs/${programSlug}/registrations`,
      payload: { responses: { full_name: "Late Comer", email: "late@test.local" } },
    });
    expect(res.statusCode).toBe(409);
  });
});
