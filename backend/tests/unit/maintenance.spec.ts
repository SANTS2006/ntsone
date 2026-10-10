import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const { maintenanceInputSchema } = await import("../../src/modules/maintenance/service.js");

describe("maintenance settings", () => {
  const base = { enabled: true, message: "We are upgrading the system." };

  it("accepts a notice for the whole site", () => {
    expect(maintenanceInputSchema.parse(base)).toMatchObject({ mode: "banner", scope: "all", notifyStaff: true, notifyVoters: false });
  });

  it("needs at least one part of the site when only some are chosen", () => {
    expect(maintenanceInputSchema.safeParse({ ...base, scope: "selected", areas: [] }).success).toBe(false);
    expect(maintenanceInputSchema.safeParse({ ...base, scope: "selected", areas: ["voting"] }).success).toBe(true);
    expect(maintenanceInputSchema.safeParse({ ...base, scope: "selected", areas: ["not-a-part"] }).success).toBe(false);
  });

  it("needs a real message and an end time in the future", () => {
    expect(maintenanceInputSchema.safeParse({ ...base, message: "hi" }).success).toBe(false);
    expect(maintenanceInputSchema.safeParse({ ...base, message: "x".repeat(601) }).success).toBe(false);
    expect(maintenanceInputSchema.safeParse({ ...base, endsAt: new Date(Date.now() - 3_600_000).toISOString() }).success).toBe(false);
    expect(maintenanceInputSchema.safeParse({ ...base, endsAt: new Date(Date.now() + 3_600_000).toISOString() }).success).toBe(true);
    // Switching it off never fails because of an old end time.
    expect(maintenanceInputSchema.safeParse({ ...base, enabled: false, endsAt: new Date(Date.now() - 3_600_000).toISOString() }).success).toBe(true);
  });
});
