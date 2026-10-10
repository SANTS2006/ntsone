import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  program: { id: "p1", oneRegistrationPerEmail: true } as Record<string, unknown>,
  existing: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
}));

vi.mock("../../src/modules/programs/repository.js", () => ({ findProgramById: async () => state.program }));
vi.mock("../../src/modules/forms/service.js", () => ({
  getPublishedFormWithContent: async () => ({
    form: { id: "f1" },
    sections: [],
    fields: [
      { id: "1", fieldKey: "full_name", type: "short_text", label: "Full name", required: true, orderIndex: 0, config: {}, conditionalLogic: null, sectionId: null },
      { id: "2", fieldKey: "email", type: "email", label: "Email", required: true, orderIndex: 1, config: {}, conditionalLogic: null, sectionId: null },
      { id: "3", fieldKey: "city", type: "short_text", label: "City", required: true, orderIndex: 2, config: {}, conditionalLogic: null, sectionId: null },
    ],
  }),
}));
vi.mock("../../src/modules/registrations/repository.js", () => ({
  listRegisteredEmails: async () => new Set(state.existing.map((r) => String(r.applicantEmail).toLowerCase())),
  findRegistrationsForImport: async () => state.existing,
  updateRegistrationFromImport: async (reg: Record<string, unknown>, values: Record<string, unknown>) => {
    state.updated.push({ id: reg.id, ...values });
    return { ...reg, applicantEmail: values.applicantEmail, responses: values.responses };
  },
}));
vi.mock("../../src/modules/registrations/service.js", () => ({
  createRegistrationWithNumber: async (_p: unknown, _f: unknown, contact: Record<string, unknown>, responses: Record<string, unknown>) => {
    state.created.push({ contact, responses });
    return { registrationNumber: "REG-NEW" };
  },
}));

const { runImport } = await import("../../src/modules/registrations/importService.js");

const csv = (text: string) => Buffer.from(text);
const mapping = { "0": "full_name", "1": "email", "2": "city" };

beforeEach(() => {
  state.created.length = 0;
  state.updated.length = 0;
  state.existing = [
    { id: "r1", registrationNumber: "REG-001", applicantEmail: "ama@example.com", status: "approved", responses: { full_name: "Ama K", email: "ama@example.com", city: "Freetown" } },
  ];
});

describe("importing registrations from a document", () => {
  it("adds new rows and skips emails that are already registered", async () => {
    const file = csv("Name,Email,City\nMusa B,musa@example.com,Bo\nAma K,ama@example.com,Kono\n");
    const r = await runImport("p1", "people.csv", file, mapping, false, "skip");
    expect(r.imported).toBe(1);
    expect(r.skipped).toHaveLength(1);
    expect(state.updated).toHaveLength(0);
  });

  it("reports rows that fail the form's rules and imports the rest", async () => {
    const file = csv("Name,Email,City\nMusa B,not-an-email,Bo\nKadi S,kadi@example.com,Makeni\n");
    const r = await runImport("p1", "people.csv", file, mapping, false, "skip");
    expect(r.imported).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.row).toBe(2);
  });

  it("imports a row even when required answers are empty, and lists it as incomplete", async () => {
    const file = csv("Name,Email,City\nMusa B,musa@example.com,\n,kadi@example.com,Makeni\n");
    const r = await runImport("p1", "people.csv", file, mapping, false, "skip");
    expect(r.imported).toBe(2);
    expect(r.errors).toHaveLength(0);
    expect(r.incomplete.map((i) => i.row)).toEqual([2, 3]);
    expect(r.incomplete[0]!.messages.join(" ")).toMatch(/City/);
  });

  it("updates the registration an email matches, changing only what the file supplies", async () => {
    const file = csv("Name,Email,City\n,ama@example.com,Kono\n");
    const r = await runImport("p1", "people.csv", file, mapping, false, "update");
    expect(r.updated).toBe(1);
    expect(r.imported).toBe(0);
    const saved = state.updated[0]!;
    expect((saved.responses as Record<string, unknown>).city).toBe("Kono");
    expect((saved.responses as Record<string, unknown>).full_name).toBe("Ama K");
  });

  it("finds a registration by its number", async () => {
    const file = csv("Number,City\nREG-001,Lungi\n");
    const r = await runImport("p1", "people.csv", file, { "0": "__registration_number", "1": "city" }, false, "update_only");
    expect(r.updated).toBe(1);
    expect((state.updated[0]!.responses as Record<string, unknown>).city).toBe("Lungi");
  });

  it("with update only, leaves rows with no match alone", async () => {
    const file = csv("Name,Email,City\nNew P,new@example.com,Bo\n");
    const r = await runImport("p1", "people.csv", file, mapping, false, "update_only");
    expect(r.imported).toBe(0);
    expect(r.skipped).toHaveLength(1);
    expect(state.created).toHaveLength(0);
  });

  it("with update, adds rows that match nothing", async () => {
    const file = csv("Name,Email,City\nNew P,new@example.com,Bo\n");
    const r = await runImport("p1", "people.csv", file, mapping, false, "update");
    expect(r.imported).toBe(1);
  });

  it("a check changes nothing", async () => {
    const file = csv("Name,Email,City\n,ama@example.com,Kono\nNew P,new@example.com,Bo\n");
    const r = await runImport("p1", "people.csv", file, mapping, true, "update");
    expect(r.willUpdate).toBe(1);
    expect(r.willCreate).toBe(1);
    expect(state.updated).toHaveLength(0);
    expect(state.created).toHaveLength(0);
  });

  it("a check lists every row with what would happen to it", async () => {
    const file = csv("Name,Email,City\nMusa B,musa@example.com,\nBad,not-an-email,Bo\n,ama@example.com,Kono\nAma K,ama@example.com,Kono\n");
    const r = await runImport("p1", "people.csv", file, mapping, true, "update");
    const byRow = Object.fromEntries(r.rows.map((x) => [x.row, x]));
    expect(r.rows).toHaveLength(4);
    expect(byRow[2]!.action).toBe("create");
    expect(byRow[2]!.incomplete.join(" ")).toMatch(/City/);
    expect(byRow[3]!.action).toBe("error");
    expect(byRow[3]!.messages.length).toBeGreaterThan(0);
    expect(byRow[4]!.action).toBe("update");
    expect(byRow[4]!.matches).toBe("REG-001");
    expect(byRow[4]!.values.city).toBe("Kono");
    // The row as it was in the document, so it can be exported, fixed and imported again.
    expect(byRow[3]!.cells).toEqual(["Bad", "not-an-email", "Bo"]);
    // A real import does not carry the preview.
    const real = await runImport("p1", "people.csv", file, mapping, false, "update");
    expect(real.rows).toHaveLength(0);
  });

  it("a file of rows to fix, with the notes columns added, imports again", async () => {
    const fixed = csv("﻿Name,Email,City,Original row,Import notes\nBad,bad@example.com,Bo,3,Email must be valid\n");
    const r = await runImport("p1", "fix.csv", fixed, mapping, false, "skip");
    expect(r.imported).toBe(1);
    expect(r.errors).toHaveLength(0);
  });

  it("will not update without a way to find the registration", async () => {
    const file = csv("Name,City\nAma,Kono\n");
    await expect(runImport("p1", "people.csv", file, { "0": "full_name", "1": "city" }, false, "update")).rejects.toThrow(/registration number|email/);
  });
});
