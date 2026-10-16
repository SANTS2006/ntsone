import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL = "https://app.example.test";
process.env.API_URL = "https://app.example.test";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

// The real services, run against a real (in-memory, throwaway) Postgres built from the project's own migrations.
vi.mock("../../src/db/client.js", async () => {
  const path = await import("node:path");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("../../src/db/schema/index.js");
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  return { db, pool: { query: (text: string, params?: unknown[]) => pg.query(text, params as never), on: () => undefined, end: async () => undefined }, __pg: pg };
});
const sendEmail = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
vi.mock("../../src/modules/email/service.js", async (original) => ({ ...(await original<Record<string, unknown>>()), sendEmail }));

const { defaultTemporaryPassword, organizationPrefix, TEMPORARY_PASSWORD_DAYS } = await import("../../src/lib/temporaryPassword.js");
const auth = await import("../../src/modules/auth/service.js");
const authRepo = await import("../../src/modules/auth/repository.js");
const usersService = await import("../../src/modules/users/service.js");
const { createUserSchema } = await import("../../src/modules/users/schemas.js");
const { acceptInvitationSchema } = await import("../../src/modules/auth/schemas.js");
const { authenticate } = await import("../../src/middleware/authenticate.js");
const clientModule = (await import("../../src/db/client.js")) as unknown as { __pg: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } };
const q = async (text: string, params: unknown[] = []) => (await clientModule.__pg.query(text, params)).rows;

const YEAR = new Date().getUTCFullYear();

describe("the default temporary password", () => {
  it("is the first letters of the organization's name, then @ and the year", () => {
    expect(defaultTemporaryPassword("NTS Digital Solutions", new Date("2026-10-16T10:00:00Z"))).toBe("NDS@2026");
    expect(defaultTemporaryPassword("Bright Futures Foundation", new Date("2027-01-02T00:00:00Z"))).toBe("BFF@2027");
    expect(organizationPrefix("youth service unit of sierra leone and partners")).toBe("YSUOSL");
  });
  it("uses the first letters of the name when it is one word or very short", () => {
    expect(defaultTemporaryPassword("Acme", new Date("2026-05-01T00:00:00Z"))).toBe("Acme@2026");
    expect(defaultTemporaryPassword("Mo", new Date("2026-05-01T00:00:00Z"))).toBe("Mo@2026");
  });
  it("copes with accents, symbols and names with no usable letters", () => {
    expect(defaultTemporaryPassword("École Élite Ñandú", new Date("2026-05-01T00:00:00Z"))).toBe("EEN@2026");
    expect(defaultTemporaryPassword("  Food & Drink (Pty)  Ltd. ", new Date("2026-05-01T00:00:00Z"))).toBe("FDPL@2026");
    expect(defaultTemporaryPassword("!!!", new Date("2026-05-01T00:00:00Z"))).toBe("Welcome@2026");
    expect(defaultTemporaryPassword("", new Date("2026-05-01T00:00:00Z"))).toBe("Welcome@2026");
  });
});

describe("inviting a teammate, on a real database", () => {
  let adminTenantId = "";
  let adminId = "";

  beforeAll(async () => {
    const result = await auth.register(
      { organizationName: "Bright Futures Foundation", name: "Ada Admin", email: "ada@example.test", password: "Sunrise2026x", acceptTerms: true },
      {},
    );
    adminId = result.user.id;
    adminTenantId = result.user.tenantId!;
  }, 60_000);
  afterAll(() => undefined);

  const invite = (name: string, email: string, role: "viewer" | "program_admin" = "viewer") => usersService.createUser(adminTenantId, createUserSchema.parse({ name, email, role }), { name: "Ada Admin" });
  const lastMail = () => sendEmail.mock.calls[sendEmail.mock.calls.length - 1]![0] as { to: string; subject: string; html: string };

  it("needs no password from the person inviting, and ignores one if it is sent", () => {
    expect(createUserSchema.safeParse({ name: "Fatmata Kamara", email: "fat@example.test", role: "viewer" }).success).toBe(true);
    const parsed = createUserSchema.parse({ name: "Fatmata Kamara", email: "fat@example.test", role: "viewer", password: "ignored-Password-1" });
    expect(parsed).not.toHaveProperty("password");
  });

  it("creates the account with the default password, emails it with the link, and marks it temporary", async () => {
    sendEmail.mockClear();
    const member = await invite("Fatmata Kamara", "fat@example.test");
    expect(member).toMatchObject({ email: "fat@example.test", mustChangePassword: true });
    const mail = lastMail();
    expect(mail.to).toBe("fat@example.test");
    expect(mail.html).toContain(`BFF@${YEAR}`); // Bright Futures Foundation
    expect(mail.html).toContain("https://app.example.test/accept-invitation?email=fat%40example.test");
    expect(mail.html).toContain("Accept invitation");
    expect(mail.html).toContain(`${TEMPORARY_PASSWORD_DAYS} days`);
    const [row] = await q("select must_change_password, temp_password_expires_at from users where email = 'fat@example.test'");
    expect(row!.must_change_password).toBe(true);
    const days = (new Date(row!.temp_password_expires_at as string).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("lets them sign in with it, but nothing else is open to them until they choose their own password", async () => {
    const session = await auth.login({ email: "fat@example.test", password: `BFF@${YEAR}` }, {});
    expect(session.user.mustChangePassword).toBe(true);
    const request = (url: string) => ({ headers: { authorization: `Bearer ${session.accessToken}` }, url }) as never;
    await expect(authenticate(request("/api/programs"), {} as never)).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED", statusCode: 403 });
    await expect(authenticate(request("/api/wishlists?archived=false"), {} as never)).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    await expect(authenticate(request("/api/users"), {} as never)).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    // Only their own profile and the password change are reachable.
    await expect(authenticate(request("/api/auth/me"), {} as never)).resolves.toBeUndefined();
    await expect(authenticate(request("/api/auth/me/change-password"), {} as never)).resolves.toBeUndefined();
    await expect(auth.login({ email: "fat@example.test", password: `BFF@${YEAR + 1}` }, {})).rejects.toThrow(/Invalid email or password/);
  });

  it("opens everything once they have chosen their own password on first sign-in", async () => {
    const first = await auth.login({ email: "fat@example.test", password: `BFF@${YEAR}` }, {});
    await auth.changePassword(first.user.id, { currentPassword: `BFF@${YEAR}`, newPassword: "MyOwnSecret2026" });
    const second = await auth.login({ email: "fat@example.test", password: "MyOwnSecret2026" }, {});
    expect(second.user.mustChangePassword).toBe(false);
    await expect(authenticate({ headers: { authorization: `Bearer ${second.accessToken}` }, url: "/api/programs" } as never, {} as never)).resolves.toBeUndefined();
    await expect(auth.login({ email: "fat@example.test", password: `BFF@${YEAR}` }, {})).rejects.toThrow(/Invalid email or password/);
  });

  it("accepting the invitation: temporary password in, own password chosen, signed in, email confirmed", async () => {
    await invite("Musa Bangura", "musa@example.test", "program_admin");
    expect(acceptInvitationSchema.safeParse({ email: "musa@example.test", temporaryPassword: `BFF@${YEAR}`, newPassword: "short1" }).success).toBe(false);
    const session = await auth.acceptInvitation({ email: "musa@example.test", temporaryPassword: `BFF@${YEAR}`, newPassword: "Rainbow2026ok" }, {});
    expect(session.user).toMatchObject({ email: "musa@example.test", mustChangePassword: false, emailVerified: true });
    const [row] = await q("select must_change_password, temp_password_expires_at from users where email = 'musa@example.test'");
    expect(row).toMatchObject({ must_change_password: false, temp_password_expires_at: null });
    await expect(auth.login({ email: "musa@example.test", password: "Rainbow2026ok" }, {})).resolves.toBeTruthy();
    await expect(auth.login({ email: "musa@example.test", password: `BFF@${YEAR}` }, {})).rejects.toThrow(/Invalid email or password/);
  });

  it("refuses to accept with a wrong temporary password, the same password again, or an account that is already set up", async () => {
    await invite("Kadiatu Sesay", "kadi@example.test");
    await expect(auth.acceptInvitation({ email: "kadi@example.test", temporaryPassword: "wrong-Pass-1", newPassword: "Rainbow2026ok" }, {})).rejects.toThrow(/not correct/);
    await expect(auth.acceptInvitation({ email: "nobody@example.test", temporaryPassword: `BFF@${YEAR}`, newPassword: "Rainbow2026ok" }, {})).rejects.toThrow(/not correct/);
    await expect(auth.acceptInvitation({ email: "kadi@example.test", temporaryPassword: `BFF@${YEAR}`, newPassword: `BFF@${YEAR}` }, {})).rejects.toThrow(/different/);
    // An ordinary account (already on its own password) cannot be opened through the invitation link, even with the right password.
    await expect(auth.acceptInvitation({ email: "ada@example.test", temporaryPassword: "Sunrise2026x", newPassword: "Another2026pw" }, {})).rejects.toThrow(/not correct/);
    // Nothing changed for the person who was not accepted.
    await expect(auth.login({ email: "kadi@example.test", password: `BFF@${YEAR}` }, {})).resolves.toBeTruthy();
  });

  it("an unused temporary password stops working after its days, and a new invitation brings it back", async () => {
    await invite("Ibrahim Conteh", "ibrahim@example.test");
    const [created] = await q("select id from users where email = 'ibrahim@example.test'");
    await q("update users set temp_password_expires_at = now() - interval '1 minute' where email = 'ibrahim@example.test'");
    await expect(auth.login({ email: "ibrahim@example.test", password: `BFF@${YEAR}` }, {})).rejects.toThrow(/invitation has expired/);
    await expect(auth.acceptInvitation({ email: "ibrahim@example.test", temporaryPassword: `BFF@${YEAR}`, newPassword: "Rainbow2026ok" }, {})).rejects.toThrow(/invitation has expired/);
    // A wrong password still looks like any wrong password; expiry is only said to someone who knew the right one.
    await expect(auth.login({ email: "ibrahim@example.test", password: "nope-NOPE-1" }, {})).rejects.toThrow(/Invalid email or password/);

    sendEmail.mockClear();
    const renewed = await usersService.resendInvitation(adminTenantId, created!.id as string, { name: "Ada Admin" });
    expect(renewed.mustChangePassword).toBe(true);
    expect(lastMail().html).toContain(`BFF@${YEAR}`);
    await expect(auth.login({ email: "ibrahim@example.test", password: `BFF@${YEAR}` }, {})).resolves.toBeTruthy();
  });

  it("choosing a password with 'Forgot password' also ends the temporary state", async () => {
    await invite("Aminata Koroma", "aminata@example.test");
    const [row] = await q("select id from users where email = 'aminata@example.test'");
    await authRepo.updateUserPassword(row!.id as string, "hashed-by-the-reset-flow");
    const [after] = await q("select must_change_password, temp_password_expires_at from users where email = 'aminata@example.test'");
    expect(after).toMatchObject({ must_change_password: false, temp_password_expires_at: null });
  });

  it("only resends to people who have not accepted, and only within your own team", async () => {
    const [accepted] = await q("select id from users where email = 'musa@example.test'");
    await expect(usersService.resendInvitation(adminTenantId, accepted!.id as string, { name: "Ada Admin" })).rejects.toThrow(/already accepted/);
    const other = await auth.register({ organizationName: "Other Org", name: "Olu Owner", email: "olu@example.test", password: "Sunrise2026x", acceptTerms: true }, {});
    const [pending] = await q("select id from users where email = 'kadi@example.test'");
    await expect(usersService.resendInvitation(other.user.tenantId!, pending!.id as string, { name: "Olu Owner" })).rejects.toThrow(/not found/i);
    void adminId;
  });
});
