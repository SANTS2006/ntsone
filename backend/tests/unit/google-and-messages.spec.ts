import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL = "https://app.example.test";
process.env.API_URL = "https://app.example.test";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

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
vi.mock("../../src/modules/email/service.js", async (original) => ({ ...(await original<Record<string, unknown>>()), sendEmail: vi.fn(async () => undefined) }));
// Google is never reached: the "credential" is just the profile, spelled out.
const verifyGoogleCredential = vi.hoisted(() => vi.fn(async (credential: string) => JSON.parse(credential) as { googleId: string; email: string; name: string }));
vi.mock("../../src/modules/voters/google.js", () => ({ verifyGoogleCredential }));

const lastCodeFor = (spy: { mock: { calls: unknown[][] } }, email: string) => {
  const line = spy.mock.calls.map((c) => String(c[0])).reverse().find((l) => l.includes(`signup for ${email}`));
  return /: ([A-Z0-9]{6})$/.exec(line ?? "")?.[1] ?? "";
};

const auth = await import("../../src/modules/auth/service.js");
const { authenticate } = await import("../../src/middleware/authenticate.js");
const { completeSetupSchema } = await import("../../src/modules/auth/schemas.js");
const { describeIssue, issuesByField } = await import("../../src/lib/zodMessages.js");
const clientModule = (await import("../../src/db/client.js")) as unknown as { __pg: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } };
const q = async (text: string, params: unknown[] = []) => (await clientModule.__pg.query(text, params)).rows;

const google = (email: string, name = "Grace Hopper") => JSON.stringify({ googleId: `g-${email}`, email, name }) + " ".repeat(20);
const request = (token: string, url: string) => ({ headers: { authorization: `Bearer ${token}` }, url }) as never;

describe("saying exactly what is wrong when signing in", () => {
  beforeAll(async () => {
    await auth.register({ organizationName: "Bright Futures", name: "Ada Admin", email: "ada@example.test", password: "Sunrise2026x", acceptTerms: true }, {});
  }, 60_000);

  it("tells the person when the email is not registered, pointing at the email box", async () => {
    await expect(auth.login({ email: "nobody@example.test", password: "whatever-1" }, {})).rejects.toMatchObject({
      code: "ACCOUNT_NOT_FOUND",
      statusCode: 401,
      details: { field: "email" },
      message: expect.stringMatching(/couldn't find an account with this email/),
    });
  });

  it("tells the person when the password is wrong, pointing at the password box", async () => {
    await expect(auth.login({ email: "ada@example.test", password: "Wrong-Pass-1" }, {})).rejects.toMatchObject({
      code: "WRONG_PASSWORD",
      details: { field: "password" },
      message: expect.stringMatching(/password is incorrect/),
    });
  });

  it("names the email box when registering with an address already in use, and when asking for a reset for an unknown one", async () => {
    await expect(auth.register({ organizationName: "Again", name: "Ada Two", email: "ada@example.test", password: "Sunrise2026x", acceptTerms: true }, {})).rejects.toMatchObject({
      details: { field: "email" },
      message: expect.stringMatching(/already exists/),
    });
    await expect(auth.forgotPassword({ email: "ghost@example.test" }, "https://app.example.test")).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND", details: { field: "email" } });
    await expect(auth.forgotPassword({ email: "ada@example.test" }, "https://app.example.test")).resolves.toBeUndefined();
  });

  it("says the current password is wrong when changing it", async () => {
    const ada = await auth.login({ email: "ada@example.test", password: "Sunrise2026x" }, {});
    await expect(auth.changePassword(ada.user.id, { currentPassword: "nope-Nope-1", newPassword: "Another2026pw" })).rejects.toMatchObject({
      details: { field: "currentPassword" },
      message: expect.stringMatching(/current password is not correct/),
    });
  });
});

describe("Continue with Google", () => {
  it("registers someone new, makes them confirm the email with the emailed code, then name their organization", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const session = await auth.googleSignIn(google("grace@example.test"), {});
    expect(session.created).toBe(true);
    // Google's word is not enough: the address is not confirmed yet.
    expect(session.user).toMatchObject({ email: "grace@example.test", name: "Grace Hopper", role: "admin", emailVerified: false, organizationSetupPending: true });
    const code = lastCodeFor(log, "grace@example.test");
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    log.mockRestore();

    // Naming the organization has to wait for the confirmation.
    await expect(auth.completeOrganizationSetup(session.user.id, { organizationName: "Hopper Labs" })).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    // The confirmation step itself is reachable meanwhile.
    await expect(authenticate(request(session.accessToken, "/api/auth/verify-email"), {} as never)).resolves.toBeUndefined();
    await expect(authenticate(request(session.accessToken, "/api/auth/verify-email/resend"), {} as never)).resolves.toBeUndefined();
    await expect(auth.verifyEmail(session.user.id, "ZZZZZZ")).rejects.toThrow(/Incorrect code/);
    expect((await auth.verifyEmail(session.user.id, code)).emailVerified).toBe(true);

    // Until the organization is set up, only their own profile and the setup step are open.
    await expect(authenticate(request(session.accessToken, "/api/programs"), {} as never)).rejects.toMatchObject({ code: "SETUP_REQUIRED", statusCode: 403 });
    await expect(authenticate(request(session.accessToken, "/api/users"), {} as never)).rejects.toMatchObject({ code: "SETUP_REQUIRED" });
    await expect(authenticate(request(session.accessToken, "/api/auth/me"), {} as never)).resolves.toBeUndefined();
    await expect(authenticate(request(session.accessToken, "/api/auth/me/complete-setup"), {} as never)).resolves.toBeUndefined();

    expect(completeSetupSchema.safeParse({ organizationName: "A", acceptTerms: true }).success).toBe(false);
    expect(completeSetupSchema.safeParse({ organizationName: "Hopper Labs", acceptTerms: false }).success).toBe(false);

    const done = await auth.completeOrganizationSetup(session.user.id, { organizationName: "Hopper Labs" });
    expect(done.organizationSetupPending).toBe(false);
    const [tenant] = await q("select name from tenants where id = $1", [session.user.tenantId]);
    expect(tenant!.name).toBe("Hopper Labs");
    const [row] = await q("select terms_accepted_at from users where email = 'grace@example.test'");
    expect(row!.terms_accepted_at).not.toBeNull();
    await expect(authenticate(request(session.accessToken, "/api/programs"), {} as never)).resolves.toBeUndefined();
    await expect(auth.completeOrganizationSetup(session.user.id, { organizationName: "Again" })).rejects.toThrow(/already set up/);
  });

  it("never opens a platform administrator's account, even with a valid Google sign-in", async () => {
    await q("insert into users (name, email, password_hash, role, email_verified_at) values ('Root', 'root@example.test', 'x', 'super_admin', now())");
    await expect(auth.googleSignIn(google("root@example.test"), {})).rejects.toThrow(/Platform administrator/);
  });

  it("signs an existing person straight in, without creating anything", async () => {
    const before = (await q("select count(*)::int as n from users"))[0]!.n;
    const session = await auth.googleSignIn(google("grace@example.test"), {});
    expect(session.created).toBe(false);
    expect(session.user.organizationSetupPending).toBe(false);
    expect((await q("select count(*)::int as n from users"))[0]!.n).toBe(before);
  });

  it("takes over an address that was registered by password but never confirmed, so that password stops working", async () => {
    await auth.register({ organizationName: "Squatter Inc", name: "Sam Squatter", email: "victim@example.test", password: "Squatter2026pw", acceptTerms: true }, {});
    const session = await auth.googleSignIn(google("victim@example.test", "Vic Tim"), {});
    expect(session.created).toBe(false);
    expect(session.user.emailVerified).toBe(true);
    await expect(auth.login({ email: "victim@example.test", password: "Squatter2026pw" }, {})).rejects.toMatchObject({ code: "WRONG_PASSWORD" });
  });

  it("refuses a suspended account", async () => {
    await q("update users set status = 'suspended' where email = 'grace@example.test'");
    await expect(auth.googleSignIn(google("grace@example.test"), {})).rejects.toThrow(/suspended/);
  });
});

describe("plain-language messages for badly filled forms", () => {
  const messageFor = (schema: z.ZodTypeAny, value: unknown) => {
    const result = schema.safeParse(value);
    if (result.success) return "";
    return describeIssue(result.error.issues[0]!);
  };

  it("names the field and says what to do", () => {
    const schema = z.object({ email: z.string().email(), organizationName: z.string().min(2), count: z.number().int().min(1).max(5), kind: z.enum(["a", "b"]) });
    expect(messageFor(schema, { organizationName: "Ok", count: 1, kind: "a" })).toBe("Email is required");
    expect(messageFor(schema, { email: "nope", organizationName: "Ok", count: 1, kind: "a" })).toBe("Email: enter a valid email address, like name@example.com");
    expect(messageFor(schema, { email: "a@b.co", organizationName: "x", count: 1, kind: "a" })).toBe("Organization name must be at least 2 characters");
    expect(messageFor(schema, { email: "a@b.co", organizationName: "Ok", count: 9, kind: "a" })).toBe("Count must be at most 5");
    expect(messageFor(schema, { email: "a@b.co", organizationName: "Ok", count: 1, kind: "z" })).toBe("Kind must be one of: a, b");
    expect(messageFor(schema, { email: "a@b.co", organizationName: "", count: 1, kind: "a" })).toBe("Organization name must be at least 2 characters");
  });

  it("keeps messages somebody wrote on purpose, and reports every field for the form to place", () => {
    const schema = z.object({ password: z.string().min(10, "Use at least 10 characters"), email: z.string().email() });
    const result = schema.safeParse({ password: "short", email: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issuesByField(result.error.issues)).toEqual({
        password: "Use at least 10 characters",
        email: "Email: enter a valid email address, like name@example.com",
      });
    }
  });
});
