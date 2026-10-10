import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL ||= "http://localhost:4000";
process.env.API_URL ||= "http://localhost:4000";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const rules = await import("../../src/modules/wishlists/rules.js");
const schemas = await import("../../src/modules/wishlists/schemas.js");
const { wishlistService } = await import("../../src/modules/wishlists/service.js");

describe("wish list rules", () => {
  it("works out what an item is expected to cost, and what to record when no price is typed", () => {
    expect(rules.proposedTotal(3, 15_000)).toBe(45_000);
    expect(rules.proposedTotal(3, null)).toBeNull();
    expect(rules.defaultPaid(2, 500)).toBe(1000);
    expect(rules.defaultPaid(2, null)).toBe(0);
  });

  it("accepts only real dates that are not in the future", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    expect(rules.validGottenDay("2026-05-10", now)).toBe(true);
    expect(rules.validGottenDay("2026-05-11", now)).toBe(true); // a person already on tomorrow's date
    expect(rules.validGottenDay("2026-05-12", now)).toBe(false);
    expect(rules.validGottenDay("2026-02-30", now)).toBe(false);
    expect(rules.validGottenDay("not a date", now)).toBe(false);
    expect(rules.validGottenDay("1980-01-01", now)).toBe(false);
  });

  it("describes where a list stands against its budget", () => {
    expect(rules.budgetPosition(null, 100, 100).state).toBe("none");
    expect(rules.budgetPosition(1000, 200, 300)).toMatchObject({ state: "ok", remainingMinor: 800, overBudgetBy: 0 });
    expect(rules.budgetPosition(1000, 500, 450).state).toBe("warning");
    expect(rules.budgetPosition(1000, 700, 500)).toMatchObject({ state: "over", overBudgetBy: 200 });
    expect(rules.budgetPosition(0, 0, 0).state).toBe("ok");
  });

  it("keeps only web links", () => {
    expect(rules.safeLink("https://shop.example/item?id=1")).toBe("https://shop.example/item?id=1");
    expect(rules.safeLink("javascript:alert(1)")).toBeNull();
    expect(rules.safeLink("data:text/html,x")).toBeNull();
    expect(rules.safeLink("  ")).toBeNull();
  });
});

describe("wish list input checks", () => {
  it("lets quantity and price be left out, and refuses negatives and nonsense", () => {
    expect(schemas.addItemsSchema.safeParse({ items: [{ name: "Rice" }] }).success).toBe(true);
    expect(schemas.addItemsSchema.safeParse({ items: [{ name: "Rice", quantity: 3, unitPriceMinor: 15000 }] }).success).toBe(true);
    expect(schemas.addItemsSchema.safeParse({ items: [{ name: "Rice", quantity: -1 }] }).success).toBe(false);
    expect(schemas.addItemsSchema.safeParse({ items: [{ name: "Rice", quantity: 1.5 }] }).success).toBe(false);
    expect(schemas.addItemsSchema.safeParse({ items: [{ name: "Rice", unitPriceMinor: -5 }] }).success).toBe(false);
    expect(schemas.addItemsSchema.safeParse({ items: [{ name: "  " }] }).success).toBe(false);
    expect(schemas.addItemsSchema.safeParse({ items: [] }).success).toBe(false);
    expect(schemas.addItemsSchema.safeParse({ items: [{ name: "x", link: "javascript:alert(1)" }] }).success).toBe(false);
    expect(schemas.addItemsSchema.safeParse({ items: Array.from({ length: 101 }, () => ({ name: "x" })) }).success).toBe(false);
  });
});

// The whole service against a real (throwaway, in-memory) Postgres built from the project's own migrations.
describe("the wish list service on a real database", () => {
  let pg: PGlite;
  let svc: ReturnType<typeof wishlistService>;
  let q: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
  const ann = { id: "", tenantId: "" as string | null };
  const bob = { id: "", tenantId: "" as string | null };

  beforeAll(async () => {
    pg = new PGlite();
    const orm = drizzle(pg);
    await migrate(orm, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
    svc = wishlistService(orm as never);
    q = async (text, params = []) => (await pg.query(text, params as never)).rows as never;
    const tenant = (await q<{ id: string }>("insert into tenants (name, slug) values ('Acme', 'acme') returning id"))[0]!.id;
    const mk = async (email: string) =>
      (await q<{ id: string }>("insert into users (tenant_id, name, email, password_hash, role, status, email_verified_at) values ($1, $2, $3, 'x', 'admin', 'active', now()) returning id", [tenant, email, email]))[0]!.id;
    ann.id = await mk("ann@x.test");
    bob.id = await mk("bob@x.test");
    ann.tenantId = bob.tenantId = tenant;
  }, 60_000);
  afterAll(async () => {
    await pg.close();
  });

  let listId = "";
  const items: { id: string; name: string }[] = [];

  it("creates a list and adds several items at once, quantity and price optional", async () => {
    const list = await svc.createWishlist(ann, { name: "Home", budgetMinor: 1_000_000, color: "green" });
    listId = list.id;
    const added = await svc.addItems(ann, listId, {
      items: [
        { name: "Sofa", quantity: 1, unitPriceMinor: 400_000, priority: "high", category: "Furniture" },
        { name: "Chairs", quantity: 4, unitPriceMinor: 50_000, category: "Furniture" },
        { name: "Curtains" },
      ],
    });
    items.push(...added.map((i) => ({ id: i.id, name: i.name })));
    expect(added.map((i) => [i.name, i.quantity, i.proposedTotalMinor])).toEqual([["Sofa", 1, 400_000], ["Chairs", 4, 200_000], ["Curtains", 1, null]]);
    const all = await svc.listItems(ann, listId, { status: "wished", page: 1, pageSize: 50 });
    expect(all.totals).toEqual({ count: 3, proposedMinor: 600_000, paidMinor: 0 });
    expect(all.items[0]!.name).toBe("Sofa"); // high priority first
  });

  it("marks items as gotten with price paid and date, and moves them to the gotten list", async () => {
    const result = await svc.markGotten(ann, listId, {
      items: [
        { itemId: items[0]!.id, paidMinor: 380_000, gottenAt: "2026-01-15", store: "City Furniture" },
        { itemId: items[1]!.id }, // price falls back to the expected total
      ],
      gottenAt: "2026-01-20",
    });
    expect(result.skipped).toEqual([]);
    const gotten = await svc.listItems(ann, listId, { status: "gotten", page: 1, pageSize: 50 });
    expect(gotten.totals).toEqual({ count: 2, proposedMinor: 600_000, paidMinor: 580_000 });
    const sofa = gotten.items.find((i) => i.name === "Sofa")!;
    expect(sofa).toMatchObject({ paidMinor: 380_000, gottenAt: "2026-01-15", store: "City Furniture", savedMinor: 20_000 });
    expect(gotten.items.find((i) => i.name === "Chairs")).toMatchObject({ paidMinor: 200_000, gottenAt: "2026-01-20" });
    expect((await svc.listItems(ann, listId, { status: "wished", page: 1, pageSize: 50 })).totals.count).toBe(1);
  });

  it("is safe to press twice: an item already gotten is skipped, not counted again", async () => {
    const again = await svc.markGotten(ann, listId, { items: [{ itemId: items[0]!.id, paidMinor: 1 }, { itemId: items[2]!.id, paidMinor: 5_000 }] });
    expect(again.items.map((i) => i.name)).toEqual(["Curtains"]);
    expect(again.skipped).toEqual([{ itemId: items[0]!.id, reason: "already_gotten" }]);
    const sofa = (await svc.listItems(ann, listId, { status: "gotten", page: 1, pageSize: 50 })).items.find((i) => i.name === "Sofa")!;
    expect(sofa.paidMinor).toBe(380_000);
  });

  it("two requests at the same moment cannot both mark the same item", async () => {
    const [mk] = await svc.addItems(ann, listId, { items: [{ name: "Lamp", unitPriceMinor: 10_000 }] });
    const results = await Promise.all([1, 2, 3].map(() => svc.markGotten(ann, listId, { items: [{ itemId: mk!.id, paidMinor: 9_000 }] })));
    expect(results.filter((r) => r.items.length === 1)).toHaveLength(1);
    const events = await q<{ n: number }>("select count(*)::int as n from wish_events where item_id = $1 and type = 'item_gotten'", [mk!.id]);
    expect(events[0]!.n).toBe(1);
    await svc.removeItem(ann, listId, mk!.id);
  });

  it("summarises spending against the budget, by category and by month", async () => {
    const s = await svc.summary(ann, listId);
    expect(s).toMatchObject({ wishedCount: 0, gottenCount: 3, spentMinor: 585_000, plannedMinor: 0, savedMinor: 20_000, percentGotten: 100 });
    expect(s.budget).toMatchObject({ budgetMinor: 1_000_000, remainingMinor: 415_000, state: "ok" });
    expect(s.byCategory.find((c) => c.category === "Furniture")).toMatchObject({ gottenCount: 2, spentMinor: 580_000 });
    expect(s.byMonth.map((m) => [m.month, m.spentMinor])).toEqual([["2026-01", 580_000], [rules.today().slice(0, 7), 5_000]]);
  });

  it("filters the gotten list by date", async () => {
    const jan = await svc.listItems(ann, listId, { status: "gotten", from: "2026-01-01", to: "2026-01-31", page: 1, pageSize: 50 });
    expect(jan.items.map((i) => i.name).sort()).toEqual(["Chairs", "Sofa"]);
    const search = await svc.listItems(ann, listId, { status: "gotten", search: "sof", page: 1, pageSize: 50 });
    expect(search.items.map((i) => i.name)).toEqual(["Sofa"]);
    // Characters with a special meaning in a search are treated as plain text.
    expect((await svc.listItems(ann, listId, { status: "gotten", search: "%", page: 1, pageSize: 50 })).items).toHaveLength(0);
  });

  it("moves an item back to the wish list and keeps what was recorded in the activity", async () => {
    const back = await svc.unmarkGotten(ann, listId, items[0]!.id);
    expect(back).toMatchObject({ status: "wished", paidMinor: null, gottenAt: null });
    const act = await svc.activity(ann, listId, 1, 50);
    const undo = act.items.find((e) => e.type === "item_ungotten")!;
    expect(undo.details).toMatchObject({ paidMinor: 380_000, gottenAt: "2026-01-15", store: "City Furniture" });
    await expect(svc.unmarkGotten(ann, listId, items[0]!.id)).rejects.toThrow(/not marked as gotten/);
  });

  it("edits items, but only items that are gotten can have a price paid", async () => {
    const edited = await svc.updateItem(ann, listId, items[0]!.id, { name: "Corner sofa", unitPriceMinor: 420_000 });
    expect(edited).toMatchObject({ name: "Corner sofa", unitPriceMinor: 420_000 });
    await expect(svc.updateItem(ann, listId, items[0]!.id, { paidMinor: 100 })).rejects.toThrow(/Mark the item as gotten first/);
    const fixed = await svc.updateItem(ann, listId, items[1]!.id, { paidMinor: 190_000, gottenAt: "2026-01-21" });
    expect(fixed).toMatchObject({ paidMinor: 190_000, gottenAt: "2026-01-21" });
    const act = await svc.activity(ann, listId, 1, 50);
    expect(act.items.find((e) => e.type === "item_updated" && e.itemName === "Chairs")!.details).toMatchObject({ paidMinor: { from: 200_000, to: 190_000 } });
  });

  it("removes and restores an item without losing it", async () => {
    await svc.removeItem(ann, listId, items[0]!.id);
    expect((await svc.listItems(ann, listId, { status: "wished", page: 1, pageSize: 50 })).items.some((i) => i.id === items[0]!.id)).toBe(false);
    expect((await svc.listItems(ann, listId, { status: "removed", page: 1, pageSize: 50 })).items.map((i) => i.id)).toContain(items[0]!.id);
    await expect(svc.updateItem(ann, listId, items[0]!.id, { name: "x" })).rejects.toThrow(/Restore this item/);
    await svc.restoreItem(ann, listId, items[0]!.id);
    expect((await svc.listItems(ann, listId, { status: "wished", page: 1, pageSize: 50 })).items.some((i) => i.id === items[0]!.id)).toBe(true);
  });

  it("keeps lists private: another person gets 'not found' for everything", async () => {
    await expect(svc.getWishlist(bob, listId)).rejects.toThrow(/not found/);
    await expect(svc.listItems(bob, listId, { status: "wished", page: 1, pageSize: 50 })).rejects.toThrow(/not found/);
    await expect(svc.addItems(bob, listId, { items: [{ name: "x" }] })).rejects.toThrow(/not found/);
    await expect(svc.markGotten(bob, listId, { items: [{ itemId: items[0]!.id }] })).rejects.toThrow(/not found/);
    await expect(svc.removeItem(bob, listId, items[0]!.id)).rejects.toThrow(/not found/);
    await expect(svc.summary(bob, listId)).rejects.toThrow(/not found/);
    await expect(svc.activity(bob, listId, 1, 10)).rejects.toThrow(/not found/);
    expect((await svc.listWishlists(bob, false)).items).toEqual([]);
    // An item id from one list is not reachable through another list of the same person.
    const other = await svc.createWishlist(ann, { name: "Other" });
    await expect(svc.updateItem(ann, other.id, items[0]!.id, { name: "x" })).rejects.toThrow(/Item not found/);
  });

  it("shows list totals, archives and removes lists but keeps the records", async () => {
    const lists = await svc.listWishlists(ann, false);
    const home = lists.items.find((l) => l.id === listId)!;
    expect(home).toMatchObject({ gottenCount: 2, wishedCount: 1, spentMinor: 195_000 });
    await svc.updateWishlist(ann, listId, { archived: true, name: "Home 2026" });
    expect((await svc.listWishlists(ann, false)).items.some((l) => l.id === listId)).toBe(false);
    expect((await svc.listWishlists(ann, true)).items.map((l) => l.name)).toContain("Home 2026");
    await svc.updateWishlist(ann, listId, { archived: false });
    const other = (await svc.listWishlists(ann, false)).items.find((l) => l.name === "Other")!;
    await svc.removeWishlist(ann, other.id);
    await expect(svc.getWishlist(ann, other.id)).rejects.toThrow(/not found/);
    expect(await q("select id from wishlists where id = $1", [other.id])).toHaveLength(1); // still in the records
    const events = await q<{ type: string }>("select type from wish_events where wishlist_id = $1", [other.id]);
    expect(events.map((e) => e.type).sort()).toEqual(["list_created", "list_removed"]);
  });

  it("the database refuses impossible rows even if the code were wrong", async () => {
    const bad = (sql: string) => expect(pg.query(sql)).rejects.toThrow();
    await bad(`insert into wish_items (wishlist_id, owner_id, name, quantity) values ('${listId}', '${ann.id}', 'x', 0)`);
    await bad(`insert into wish_items (wishlist_id, owner_id, name, unit_price_minor) values ('${listId}', '${ann.id}', 'x', -1)`);
    await bad(`insert into wish_items (wishlist_id, owner_id, name, status) values ('${listId}', '${ann.id}', 'x', 'gotten')`); // gotten needs a date and a price
    await bad(`insert into wish_items (wishlist_id, owner_id, name, priority) values ('${listId}', '${ann.id}', 'x', 'urgent')`);
    await bad(`insert into wish_items (wishlist_id, owner_id, name) values ('${listId}', '${ann.id}', '   ')`);
  });

  it("limits how many items a list holds, even for simultaneous requests", async () => {
    const big = await svc.createWishlist(bob, { name: "Big" });
    const chunk = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ name: `Item ${i}` })) });
    for (let i = 0; i < 9; i += 1) await svc.addItems(bob, big.id, chunk(100));
    const racing = await Promise.allSettled([svc.addItems(bob, big.id, chunk(60)), svc.addItems(bob, big.id, chunk(60)), svc.addItems(bob, big.id, chunk(60))]);
    expect(racing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const n = await q<{ n: number }>("select count(*)::int as n from wish_items where wishlist_id = $1", [big.id]);
    expect(n[0]!.n).toBe(960);
  }, 60_000);
});
