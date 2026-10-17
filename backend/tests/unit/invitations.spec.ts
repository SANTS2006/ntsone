import { beforeAll, describe, expect, it, vi } from "vitest";

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

const auth = await import("../../src/modules/auth/service.js");
const authRepo = await import("../../src/modules/auth/repository.js");
const usersService = await import("../../src/modules/users/service.js");
const { createUserSchema } = await import("../../src/modules/users/schemas.js");
const { acceptInvitationSchema } = await import("../../src/modules/auth/schemas.js");
const clientModule = (await import("../../src/db/client.js")) as unknown as { __pg: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } };
const q = async (text: string, params: unknown[] = []) => (await clientModule.__pg.query(text, params)).rows;

describe("inviting a teammate, on a real database", () => {
  let adminTenantId = "";

  beforeAll(async () => {
    const result = await auth.register(
      { organizationName: "Bright Futures Foundation", name: "Ada Admin", email: "ada@example.test", password: "Sunrise2026x", acceptTerms: true },
      {},
    );
    adminTenantId = result.user.tenantId!;
  }, 60_000);

  const invite = (name: string, email: string, role: "viewer" | "program_admin" = "viewer") => usersService.createUser(adminTenantId, createUserSchema.parse({ name, email, role }), { name: "Ada Admin" });
  const lastMail = () => sendEmail.mock.calls[sendEmail.mock.calls.length - 1]![0] as { to: string; subject: string; html: string };
  const tokenFrom = (html: string) => /accept-invitation\?token=([A-Za-z0-9_-]+)/.exec(html)?.[1] ?? "";

  it("needs no password from the person inviting, and ignores one if it is sent", () => {
    expect(createUserSchema.safeParse({ name: "Fatmata Kamara", email: "fat@example.test", role: "viewer" }).success).toBe(true);
    expect(createUserSchema.parse({ name: "Fatmata Kamara", email: "fat@example.test", role: "viewer", password: "ignored-Password-1" })).not.toHaveProperty("password");
  });

  it("emails a private link and no password at all, and the account cannot be signed into yet", async () => {
    sendEmail.mockClear();
    const member = await invite("Fatmata Kamara", "fat@example.test");
    expect(member).toMatchObject({ email: "fat@example.test", mustChangePassword: true });
    const mail = lastMail();
    expect(mail.to).toBe("fat@example.test");
    expect(mail.html).toContain("Accept invitation");
    expect(tokenFrom(mail.html).length).toBeGreaterThan(20);
    expect(mail.html).not.toMatch(/temporary password|@20\d\d/i);
    // Nobody knows the password that was set, including the default pattern.
    await expect(auth.login({ email: "fat@example.test", password: `BFF@${new Date().getUTCFullYear()}` }, {})).rejects.toMatchObject({ code: "WRONG_PASSWORD" });
    await expect(auth.login({ email: "fat@example.test", password: "Sunrise2026x" }, {})).rejects.toMatchObject({ code: "WRONG_PASSWORD" });
  });

  it("accepting with the link: they choose their own password and are signed in, email confirmed; the link works once", async () => {
    sendEmail.mockClear();
    await invite("Musa Bangura", "musa@example.test", "program_admin");
    const token = tokenFrom(lastMail().html);
    expect(acceptInvitationSchema.safeParse({ token, newPassword: "short1" }).success).toBe(false);
    const session = await auth.acceptInvitation({ token, newPassword: "Rainbow2026ok" }, {});
    expect(session.user).toMatchObject({ email: "musa@example.test", mustChangePassword: false, emailVerified: true });
    const [row] = await q("select must_change_password from users where email = 'musa@example.test'");
    expect(row!.must_change_password).toBe(false);
    await expect(auth.login({ email: "musa@example.test", password: "Rainbow2026ok" }, {})).resolves.toBeTruthy();
    await expect(auth.acceptInvitation({ token, newPassword: "Another2026pw" }, {})).rejects.toMatchObject({ details: { field: "token" } });
  });

  it("refuses a made-up or expired link", async () => {
    sendEmail.mockClear();
    await invite("Kadiatu Sesay", "kadi@example.test");
    const token = tokenFrom(lastMail().html);
    await expect(auth.acceptInvitation({ token: "x".repeat(40), newPassword: "Rainbow2026ok" }, {})).rejects.toThrow(/invalid or has expired/);
    await q("update password_reset_tokens set expires_at = now() - interval '1 minute'");
    await expect(auth.acceptInvitation({ token, newPassword: "Rainbow2026ok" }, {})).rejects.toThrow(/invalid or has expired/);
  });

  it("a link from a normal password reset cannot be used to take over an account that already accepted", async () => {
    await authRepo.storePasswordResetToken({ userId: (await q("select id from users where email = 'ada@example.test'"))[0]!.id as string, tokenHash: (await import("../../src/lib/tokens.js")).hashToken("reset-token-for-ada-123456"), expiresAt: new Date(Date.now() + 600_000) });
    await expect(auth.acceptInvitation({ token: "reset-token-for-ada-123456", newPassword: "Another2026pw" }, {})).rejects.toThrow(/invalid or has expired/);
  });

  it("resending gives a fresh link and cancels nothing else; only for people who have not accepted, within your team", async () => {
    sendEmail.mockClear();
    await invite("Ibrahim Conteh", "ibrahim@example.test");
    const first = tokenFrom(lastMail().html);
    const [created] = await q("select id from users where email = 'ibrahim@example.test'");
    await q("update password_reset_tokens set expires_at = now() - interval '1 minute'");
    sendEmail.mockClear();
    const renewed = await usersService.resendInvitation(adminTenantId, created!.id as string, { name: "Ada Admin" });
    expect(renewed.mustChangePassword).toBe(true);
    const second = tokenFrom(lastMail().html);
    expect(second).not.toBe(first);
    await expect(auth.acceptInvitation({ token: second, newPassword: "Rainbow2026ok" }, {})).resolves.toBeTruthy();

    const [accepted] = await q("select id from users where email = 'musa@example.test'");
    await expect(usersService.resendInvitation(adminTenantId, accepted!.id as string, { name: "Ada Admin" })).rejects.toThrow(/already accepted/);
    const other = await auth.register({ organizationName: "Other Org", name: "Olu Owner", email: "olu@example.test", password: "Sunrise2026x", acceptTerms: true }, {});
    const [pending] = await q("select id from users where email = 'kadi@example.test'");
    await expect(usersService.resendInvitation(other.user.tenantId!, pending!.id as string, { name: "Olu Owner" })).rejects.toThrow(/not found/i);
  });

  it("choosing a password with 'Forgot password' also ends the invited state", async () => {
    await invite("Aminata Koroma", "aminata@example.test");
    const [row] = await q("select id from users where email = 'aminata@example.test'");
    await authRepo.updateUserPassword(row!.id as string, "hashed-by-the-reset-flow");
    const [after] = await q("select must_change_password from users where email = 'aminata@example.test'");
    expect(after!.must_change_password).toBe(false);
  });
});
