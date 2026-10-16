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
vi.mock("../../src/modules/email/service.js", async (original) => ({ ...(await original<Record<string, unknown>>()), sendEmail: vi.fn(async () => undefined), queueEmail: vi.fn(async () => undefined) }));
// Monime is never reached: starting a payment just reports what it was asked to charge.
const startPayment = vi.hoisted(() => vi.fn(async (input: { totalMinor: number }) => ({ token: "pay-token", status: "pending", redirectUrl: null, amountMinor: input.totalMinor, currency: "SLE" })));
vi.mock("../../src/modules/payments/service.js", async (original) => ({ ...(await original<Record<string, unknown>>()), startPayment, assertPaymentsAvailable: () => undefined }));
vi.mock("../../src/modules/payments/fraud.js", () => ({ assertPaymentAllowed: async () => undefined }));

const auth = await import("../../src/modules/auth/service.js");
const programsService = await import("../../src/modules/programs/service.js");
const formsService = await import("../../src/modules/forms/service.js");
const registrationsService = await import("../../src/modules/registrations/service.js");
const paymentsService = await import("../../src/modules/payments/service.js");
const idCards = await import("../../src/modules/idcards/service.js");
const clientModule = (await import("../../src/db/client.js")) as unknown as { __pg: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } };
const q = async (text: string, params: unknown[] = []) => (await clientModule.__pg.query(text, params)).rows;

const acceptedFee = { percent: 100, at: "2026-10-01T00:00:00Z", by: "test" };

describe("registering now and buying the ID card in person", () => {
  let adminId = "";
  let slug = "";
  let programId = "";
  let counter = 0;

  const setPrices = (registrationFeeMinor: number, allowPayInPerson = true) =>
    q("update programs set payment_config = $1::jsonb where id = $2", [
      JSON.stringify({ enabled: true, registrationFeeMinor, idCardPriceMinor: 2_000, ticketPriceMinor: 0, allowPayInPerson, feeAccepted: acceptedFee }),
      programId,
    ]);
  const register = (extra: Record<string, unknown> = {}) =>
    registrationsService.submitRegistration(slug, { responses: { full_name: `Person ${++counter}`, email: `p${counter}@example.test` }, files: [], ...extra } as never);

  beforeAll(async () => {
    const result = await auth.register({ organizationName: "Bright Futures Foundation", name: "Ada Admin", email: "ada@example.test", password: "Sunrise2026x", acceptTerms: true }, {});
    adminId = result.user.id;
    const program = await programsService.createProgram(
      { id: adminId, role: "admin", tenantId: result.user.tenantId } as never,
      { name: "Youth Summit" } as never,
    );
    programId = program.id;
    slug = program.slug;
    await programsService.updateProgram(programId, { registrationEnabled: true, idCardEnabled: true } as never);
    await programsService.publishProgram(programId);
    await formsService.saveDraft(programId, {
      title: "Registration",
      sections: [],
      fields: [
        { fieldKey: "full_name", sectionKey: null, type: "short_text", label: "Full Name", required: true, orderIndex: 0, config: {} },
        { fieldKey: "email", sectionKey: null, type: "email", label: "Email", required: true, orderIndex: 1, config: {} },
      ],
    } as never);
    await formsService.publishForm(programId);
  }, 60_000);

  it("charges everything online when they do not choose to buy in person", async () => {
    await setPrices(5_000);
    startPayment.mockClear();
    const result = await registrationsService.submitRegistration(slug, { responses: { full_name: "Online Olu", email: "olu@example.test" }, files: [] } as never);
    expect(startPayment).toHaveBeenCalledOnce();
    expect(result.payment?.amountMinor).toBe(7_000);
    expect(result.documentsInPerson).toBe(false);
    const [row] = await q("select payment_status, amount_due_minor, documents_in_person from registrations where registration_number = $1", [result.registration.registrationNumber]);
    expect(row).toMatchObject({ payment_status: "pending", documents_in_person: false });
  });

  it("charges only the registration fee when they will buy the ID card in person, and keeps the card locked", async () => {
    await setPrices(5_000);
    startPayment.mockClear();
    const result = await register({ documentsInPerson: true });
    expect(result.payment?.amountMinor).toBe(5_000);
    expect(result.documentsInPerson).toBe(true);
    expect(result.idCardAvailable).toBe(false);
    const [row] = await q("select payment_status, amount_due_minor, documents_in_person from registrations where registration_number = $1", [result.registration.registrationNumber]);
    expect(Number(row!.amount_due_minor)).toBe(5_000);
    expect(row!.documents_in_person).toBe(true);
    // Even after the registration fee is paid, the ID card stays locked.
    await q("update registrations set payment_status = 'paid' where registration_number = $1", [result.registration.registrationNumber]);
    await expect(idCards.generateForPublicRegistration(slug, result.registration.registrationNumber)).rejects.toThrow(/in person/);
  });

  it("with no registration fee they are simply registered: no payment, a normal success, card locked until an admin confirms", async () => {
    await setPrices(0);
    startPayment.mockClear();
    const result = await register({ documentsInPerson: true });
    expect(startPayment).not.toHaveBeenCalled();
    expect(result.payment).toBeNull();
    expect(result.documentsInPerson).toBe(true);
    const number = result.registration.registrationNumber;
    const [row] = await q("select id, payment_status, documents_in_person from registrations where registration_number = $1", [number]);
    expect(row).toMatchObject({ payment_status: "none", documents_in_person: true });
    await expect(idCards.generateForPublicRegistration(slug, number)).rejects.toThrow(/in person/);

    // The organizer confirms they paid at the program: the lock is lifted.
    await paymentsService.confirmDocumentsPaidInPerson(programId, row!.id as string, adminId);
    const [after] = await q("select documents_in_person from registrations where id = $1", [row!.id]);
    expect(after!.documents_in_person).toBe(false);
    await expect(idCards.generateForPublicRegistration(slug, number)).resolves.toBeTruthy();
    await expect(paymentsService.confirmDocumentsPaidInPerson(programId, row!.id as string, adminId)).rejects.toThrow(/not chosen/);
  });

  it("refuses the choice when the admin does not allow it, and when there is no priced ID card or ticket", async () => {
    await setPrices(0, false);
    await expect(register({ documentsInPerson: true })).rejects.toThrow(/not available/);
    await q("update programs set payment_config = $1::jsonb where id = $2", [JSON.stringify({ enabled: true, registrationFeeMinor: 5_000, idCardPriceMinor: 0, ticketPriceMinor: 0, feeAccepted: acceptedFee }), programId]);
    await expect(register({ documentsInPerson: true })).rejects.toThrow(/not available/);
    // Without the choice, registering still works as before.
    await q("update programs set payment_config = $1::jsonb where id = $2", [JSON.stringify({ enabled: false }), programId]);
    const plain = await register();
    expect(plain.documentsInPerson).toBe(false);
  });

  it("an admin cannot confirm for a registration of another program", async () => {
    await setPrices(0);
    const result = await register({ documentsInPerson: true });
    const [row] = await q("select id from registrations where registration_number = $1", [result.registration.registrationNumber]);
    await expect(paymentsService.confirmDocumentsPaidInPerson("00000000-0000-0000-0000-000000000000", row!.id as string, adminId)).rejects.toThrow(/not found/i);
  });
});
