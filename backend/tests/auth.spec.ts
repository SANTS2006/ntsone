import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { createTestUser, deleteTestUser } from "./helpers.js";

describe("auth", () => {
  let app: FastifyInstance;
  let userId: string;
  let email: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    const { user } = await createTestUser("viewer", "auth-login");
    userId = user.id;
    email = user.email;
  });

  afterAll(async () => {
    await deleteTestUser(userId);
    await app.close();
    await pool.end();
  });

  it("rejects an invalid password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });

  it("logs in with correct credentials and returns an access token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "TestPassword123!" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTypeOf("string");
    expect(body.data.user.email).toBe(email);
  });

  it("rejects protected routes without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects protected routes with a garbage token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns the current user for a valid token", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "TestPassword123!" },
    });
    const { accessToken } = loginRes.json().data;

    const meRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.email).toBe(email);
  });
});
