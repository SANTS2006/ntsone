import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL = "https://app.example.test";
process.env.API_URL = "https://app.example.test";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

// The real service, run against a real (in-memory, throwaway) Postgres built from the project's own migrations.
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

const auth = await import("../../src/modules/auth/service.js");
const { contributionsService: svc } = await import("../../src/modules/contributions/service.js");
const { contributionInputSchema, recordInputSchema, withdrawalInputSchema } = await import("../../src/modules/contributions/schemas.js");
const { cellStatus, currentMonth, monthIndex, monthsDue } = await import("../../src/modules/contributions/rules.js");

describe("the calendar rules", () => {
  const now = { year: 2026, month: 10 };
  it("tells paid, partly paid, unpaid, upcoming and not-yet-started months apart", () => {
    const start = { year: 2026, month: 7 };
    const s = (cell: { year: number; month: number }, paidMinor: number | null, expectedMinor: number | null = null) => cellStatus({ start, cell, now, paidMinor, expectedMinor });
    expect(s({ year: 2026, month: 8 }, 5000)).toBe("paid");
    expect(s({ year: 2026, month: 8 }, 2000, 5000)).toBe("partial");
    expect(s({ year: 2026, month: 8 }, null)).toBe("unpaid");
    expect(s({ year: 2026, month: 10 }, null)).toBe("unpaid");
    expect(s({ year: 2026, month: 11 }, null)).toBe("upcoming");
    expect(s({ year: 2026, month: 6 }, null)).toBe("na");
    expect(s({ year: 2026, month: 6 }, 100)).toBe("paid"); // money paid before the start month is still shown
  });
  it("counts months across years", () => {
    expect(monthIndex({ year: 2027, month: 1 }) - monthIndex({ year: 2026, month: 12 })).toBe(1);
    expect(monthsDue({ year: 2025, month: 11 }, now)).toBe(12);
    expect(monthsDue({ year: 2027, month: 1 }, now)).toBe(0);
  });
});

describe("what people may type", () => {
  it("asks for sensible things, in plain words", () => {
    expect(contributionInputSchema.safeParse({ name: "Funeral", purpose: "Support the family", kind: "one_time", fields: ["Name", "Gender"] }).success).toBe(true);
    const bad = contributionInputSchema.safeParse({ name: "F", purpose: "x", kind: "weekly", fields: [] });
    expect(bad.success).toBe(false);
    const dup = contributionInputSchema.safeParse({ name: "Funeral", purpose: "Support", kind: "one_time", fields: ["Name", "name"] });
    expect(JSON.stringify(dup)).toMatch(/same name/);
    expect(JSON.stringify(contributionInputSchema.safeParse({ name: "Funeral", purpose: "Support", kind: "one_time", fields: ["Amount"] }))).toMatch(/Amount column is added for you/);
    expect(withdrawalInputSchema.safeParse({ amountMinor: 0, note: "fuel" }).success).toBe(false);
    expect(recordInputSchema.safeParse({ values: { "not-an-id": "x" }, amountMinor: 100 }).success).toBe(false);
  });
});

describe("contributions on a real database", () => {
  let ada = { id: "", tenantId: "" as string | null };
  let bob = { id: "", tenantId: "" as string | null };

  beforeAll(async () => {
    const a = await auth.register({ organizationName: "Ada Org", name: "Ada", email: "ada@example.test", password: "Sunrise2026x", acceptTerms: true }, {});
    const b = await auth.register({ organizationName: "Bob Org", name: "Bob", email: "bob@example.test", password: "Sunrise2026x", acceptTerms: true }, {});
    ada = { id: a.user.id, tenantId: a.user.tenantId };
    bob = { id: b.user.id, tenantId: b.user.tenantId };
  }, 60_000);

  it("one-time: columns the owner types, an amount column always there, a running total, and dates on every row", async () => {
    const c = await svc.create(ada, { name: "Funeral support", purpose: "Help the Kamara family", kind: "one_time", fields: ["Name", "Gender"] });
    expect(c).toMatchObject({ kind: "one_time", collectedMinor: 0, takenMinor: 0, balanceMinor: 0 });
    const detail = await svc.get(ada, c.id);
    const [name, gender] = detail.fields;
    expect(detail.fields.map((f) => f.label)).toEqual(["Name", "Gender"]);

    const first = await svc.addRecord(ada, c.id, { values: { [name!.id]: "Musa", [gender!.id]: "Male" }, amountMinor: 50_000 });
    await svc.addRecord(ada, c.id, { values: { [name!.id]: "Fatmata" }, amountMinor: 25_050 });
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(first.updatedAt).toBeInstanceOf(Date);

    let rows = await svc.listRecords(ada, c.id);
    expect(rows.items).toHaveLength(2);
    expect(rows.totalMinor).toBe(75_050);

    // Changing a row moves its "last changed" time, keeps its entered time, and the total follows.
    await new Promise((r) => setTimeout(r, 15));
    const changed = await svc.updateRecord(ada, c.id, first.id, { amountMinor: 60_000 });
    expect(changed.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(changed.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    rows = await svc.listRecords(ada, c.id);
    expect(rows.totalMinor).toBe(85_050);

    // A row needs an amount and at least one answer; answers must be for real columns.
    await expect(svc.addRecord(ada, c.id, { values: { [name!.id]: "No amount" } })).rejects.toThrow(/Enter the amount/);
    await expect(svc.addRecord(ada, c.id, { values: {}, amountMinor: 100 })).rejects.toThrow(/at least one column/);
    await expect(svc.addRecord(ada, c.id, { values: { "11111111-1111-4111-8111-111111111111": "x" }, amountMinor: 100 })).rejects.toThrow(/no longer exists/);

    await svc.removeRecord(ada, c.id, first.id);
    expect((await svc.listRecords(ada, c.id)).totalMinor).toBe(25_050);

    const history = await svc.activity(ada, c.id);
    expect(history.map((e) => e.type)).toEqual(expect.arrayContaining(["created", "record_added", "record_updated", "record_removed"]));
    const update = history.find((e) => e.type === "record_updated")!;
    expect((update.detail as { before: { amountMinor: number } }).before.amountMinor).toBe(50_000);
  });

  it("keeps a note and a running total of money taken out, and the balance left", async () => {
    const c = await svc.create(ada, { name: "Building fund", purpose: "Roof repairs", kind: "one_time", fields: ["Name"] });
    const [name] = (await svc.get(ada, c.id)).fields;
    await svc.addRecord(ada, c.id, { values: { [name!.id]: "A" }, amountMinor: 100_000 });
    const t1 = await svc.addWithdrawal(ada, c.id, { amountMinor: 20_000, note: "Bought cement", takenAt: new Date("2026-03-01T10:00:00Z") });
    expect(t1.balanceMinor).toBe(80_000);
    const t2 = await svc.addWithdrawal(ada, c.id, { amountMinor: 5_000, note: "Transport", takenAt: new Date("2026-04-01T10:00:00Z") });
    expect(t2.balanceMinor).toBe(75_000);
    const list = await svc.listWithdrawals(ada, c.id);
    expect(list.totalTakenMinor).toBe(25_000);
    expect(list.items.map((w) => [w.note, w.cumulativeMinor])).toEqual([["Transport", 25_000], ["Bought cement", 20_000]]);
    await svc.updateWithdrawal(ada, c.id, t2.withdrawal.id, { amountMinor: 8_000 });
    expect((await svc.listWithdrawals(ada, c.id)).totalTakenMinor).toBe(28_000);
    await svc.removeWithdrawal(ada, c.id, t1.withdrawal.id);
    const after = await svc.get(ada, c.id);
    expect(after).toMatchObject({ collectedMinor: 100_000, takenMinor: 8_000, balanceMinor: 92_000 });
  });

  it("recurring: tracked by month and year, who paid and who did not", async () => {
    const now = currentMonth();
    const startIdx = monthIndex(now) - 2; // two months ago
    const start = { year: Math.floor(startIdx / 12), month: (startIdx % 12) + 1 };
    const c = await svc.create(ada, { name: "Monthly dues", purpose: "Association dues", kind: "recurring", fields: ["Name", "Phone"], startYear: start.year, startMonth: start.month, expectedMonthlyMinor: 10_000 });
    const [name] = (await svc.get(ada, c.id)).fields;
    const paidAll = await svc.addRecord(ada, c.id, { values: { [name!.id]: "Paid Pat" } });
    const missing = await svc.addRecord(ada, c.id, { values: { [name!.id]: "Late Lou" } });

    // Pat pays the first month in full, the second partly; Lou pays only the first.
    const first = start;
    const second = { year: Math.floor((startIdx + 1) / 12), month: ((startIdx + 1) % 12) + 1 };
    await svc.setPayment(ada, c.id, paidAll.id, { ...first, amountMinor: 10_000 });
    await svc.setPayment(ada, c.id, paidAll.id, { ...second, amountMinor: 4_000 });
    await svc.setPayment(ada, c.id, missing.id, { ...first, amountMinor: 10_000 });

    const t = await svc.tracker(ada, c.id, first.year);
    const pat = t.members.find((m) => m.id === paidAll.id)!;
    const lou = t.members.find((m) => m.id === missing.id)!;
    expect(pat.cells[first.month - 1]!.status).toBe("paid");
    expect(lou.paidMonths).toBeGreaterThanOrEqual(1);
    expect(pat.totalMinor + lou.totalMinor).toBe(t.yearTotalMinor);
    expect(t.monthTotals[first.month - 1]).toMatchObject({ collectedMinor: 20_000, paidCount: 2 });
    // Lou missed the second and the current month (if they fall in this year); the grid says so.
    const summary = await svc.summary(ada, c.id);
    expect(summary.collectedMinor).toBe(24_000);
    expect(summary.behind.find((b) => b.id === missing.id)!.missingMonths).toBe(2);
    expect(summary.behind.find((b) => b.id === paidAll.id)!.missingMonths).toBe(1);
    expect(summary.years.reduce((s, y) => s + y.collectedMinor, 0)).toBe(24_000);
    expect(summary.bestMonth).toMatchObject({ collectedMinor: 20_000 });

    // Once a month has passed, a payment recorded for it can no longer be changed or removed...
    await expect(svc.setPayment(ada, c.id, paidAll.id, { ...second, amountMinor: 10_000 })).rejects.toThrow(/has passed/);
    await expect(svc.removePayment(ada, c.id, paidAll.id, second.year, second.month)).rejects.toThrow(/has passed/);
    expect((await svc.summary(ada, c.id)).collectedMinor).toBe(24_000);
    // ...but a past month with no payment can still be filled in.
    await svc.setPayment(ada, c.id, missing.id, { ...second, amountMinor: 10_000 });
    expect((await svc.summary(ada, c.id)).collectedMinor).toBe(34_000);
    expect((await svc.summary(ada, c.id)).behind.find((b) => b.id === missing.id)!.missingMonths).toBe(1);

    // The current month can still be changed or removed, one payment per month.
    const created = await svc.setPayment(ada, c.id, paidAll.id, { ...now, amountMinor: 5_000 });
    const changed = await svc.setPayment(ada, c.id, paidAll.id, { ...now, amountMinor: 6_000 });
    expect(changed.id).toBe(created.id);
    expect(changed.updatedAt.getTime()).toBeGreaterThanOrEqual(created.createdAt.getTime());
    expect((await svc.summary(ada, c.id)).collectedMinor).toBe(40_000);
    const grid = await svc.tracker(ada, c.id, now.year);
    expect(grid.members.find((m) => m.id === paidAll.id)!.cells[now.month - 1]).toMatchObject({ status: "partial", locked: false });
    expect(grid.members.find((m) => m.id === paidAll.id)!.cells[second.month - 1]).toMatchObject({ locked: second.year === now.year });
    await svc.removePayment(ada, c.id, paidAll.id, now.year, now.month);
    expect((await svc.summary(ada, c.id)).collectedMinor).toBe(34_000);
    await expect(svc.removePayment(ada, c.id, paidAll.id, now.year, now.month)).rejects.toThrow(/no payment recorded/);
    await expect(svc.setPayment(ada, (await svc.create(ada, { name: "One", purpose: "Once", kind: "one_time", fields: ["Name"] })).id, paidAll.id, { ...first, amountMinor: 100 })).rejects.toThrow(/recurring/);
  });

  it("a closed contribution cannot be changed until it is reopened", async () => {
    const c = await svc.create(ada, { name: "Closed one", purpose: "Finished", kind: "one_time", fields: ["Name"] });
    const [name] = (await svc.get(ada, c.id)).fields;
    await svc.update(ada, c.id, { status: "closed" });
    await expect(svc.addRecord(ada, c.id, { values: { [name!.id]: "X" }, amountMinor: 100 })).rejects.toThrow(/closed/);
    await svc.update(ada, c.id, { status: "active" });
    await expect(svc.addRecord(ada, c.id, { values: { [name!.id]: "X" }, amountMinor: 100 })).resolves.toBeTruthy();
  });

  it("columns can be added, renamed and removed, but never duplicated or emptied", async () => {
    const c = await svc.create(ada, { name: "Cols", purpose: "Testing columns", kind: "one_time", fields: ["Name"] });
    const phone = await svc.addField(ada, c.id, "Phone");
    await expect(svc.addField(ada, c.id, "phone")).rejects.toThrow(/already a column/);
    await expect(svc.addField(ada, c.id, "Amount")).rejects.toThrow(/already a column/);
    await svc.renameField(ada, c.id, phone.id, "Phone number");
    await svc.removeField(ada, c.id, phone.id);
    const [only] = (await svc.get(ada, c.id)).fields;
    await expect(svc.removeField(ada, c.id, only!.id)).rejects.toThrow(/at least one column/);
  });

  it("is private: someone else cannot see, change or list another person's contribution", async () => {
    const c = await svc.create(ada, { name: "Private", purpose: "Only mine", kind: "one_time", fields: ["Name"] });
    await expect(svc.get(bob, c.id)).rejects.toThrow(/couldn't find/);
    await expect(svc.update(bob, c.id, { name: "Stolen" })).rejects.toThrow(/couldn't find/);
    await expect(svc.addWithdrawal(bob, c.id, { amountMinor: 100, note: "steal" })).rejects.toThrow(/couldn't find/);
    await expect(svc.listRecords(bob, c.id)).rejects.toThrow(/couldn't find/);
    expect((await svc.list(bob)).items).toHaveLength(0);
    await svc.remove(ada, c.id);
    await expect(svc.get(ada, c.id)).rejects.toThrow(/couldn't find/);
  });
});
