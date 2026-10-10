import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "postgres://nobody:nobody@127.0.0.1:1/none";
process.env.APP_URL = "https://app.example.test";
process.env.API_URL = "https://app.example.test";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-test-secret";

const { wishlistService, shareToken, signShare } = await import("../../src/modules/wishlists/service.js");
const { shareInputSchema, shareUpdateSchema } = await import("../../src/modules/wishlists/schemas.js");
const { maskSecretsInUrl } = await import("../../src/lib/logRedact.js");

describe("share input checks", () => {
  it("needs a name and a level, and accepts an optional email and expiry", () => {
    expect(shareInputSchema.safeParse({ label: "Mama", level: "read" }).success).toBe(true);
    expect(shareInputSchema.safeParse({ label: "Mama", level: "write", email: "Mama@Example.com", expiresInDays: 30 })).toMatchObject({ success: true, data: { email: "mama@example.com" } });
    expect(shareInputSchema.safeParse({ label: "", level: "read" }).success).toBe(false);
    expect(shareInputSchema.safeParse({ label: "x", level: "admin" }).success).toBe(false);
    expect(shareInputSchema.safeParse({ label: "x", level: "read", email: "not an email" }).success).toBe(false);
    expect(shareInputSchema.safeParse({ label: "x", level: "read", expiresInDays: 0 }).success).toBe(false);
    expect(shareInputSchema.safeParse({ label: "x", level: "read", expiresInDays: 400 }).success).toBe(false);
    expect(shareUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("keeping link tokens out of the logs", () => {
  it("masks the token in shared-list and payment addresses", () => {
    const token = shareToken("11111111-1111-4111-8111-111111111111", 0);
    expect(maskSecretsInUrl(`/api/public/wish/${token}/items?page=2`)).toBe("/api/public/wish/:token/items?page=2");
    expect(maskSecretsInUrl(`/wish/${token}`)).toBe("/wish/:token");
    expect(maskSecretsInUrl("/payment/abc.def.ghi")).toBe("/payment/:token");
    expect(maskSecretsInUrl("/api/programs/123")).toBe("/api/programs/123");
  });
});

describe("sharing a wish list, on a real database", () => {
  let pg: PGlite;
  let svc: ReturnType<typeof wishlistService>;
  let q: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
  const sendInvite = vi.fn(async () => undefined);
  const ann = { id: "", tenantId: "" as string | null };
  const bob = { id: "", tenantId: "" as string | null };
  let listId = "";
  let otherListId = "";
  let itemId = "";

  const open = async (token: string) => (await svc.resolveShare(token)).actor;
  const tokenOf = (url: string | null) => url!.split("/wish/")[1]!;

  beforeAll(async () => {
    pg = new PGlite();
    const orm = drizzle(pg);
    await migrate(orm, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
    svc = wishlistService(orm as never, { sendInvite });
    q = async (text, params = []) => (await pg.query(text, params as never)).rows as never;
    const tenant = (await q<{ id: string }>("insert into tenants (name, slug) values ('Acme', 'acme') returning id"))[0]!.id;
    const mk = async (name: string, email: string) =>
      (await q<{ id: string }>("insert into users (tenant_id, name, email, password_hash, role, status, email_verified_at) values ($1, $2, $3, 'x', 'admin', 'active', now()) returning id", [tenant, name, email]))[0]!.id;
    ann.id = await mk("Ann Tester", "ann@x.test");
    bob.id = await mk("Bob Other", "bob@x.test");
    ann.tenantId = bob.tenantId = tenant;
    listId = (await svc.createWishlist(ann, { name: "Home" })).id;
    otherListId = (await svc.createWishlist(ann, { name: "Private list" })).id;
    itemId = (await svc.addItems(ann, listId, { items: [{ name: "Sofa", quantity: 1, unitPriceMinor: 400_000 }, { name: "Chairs", quantity: 4, unitPriceMinor: 50_000 }] }))[0]!.id;
  }, 60_000);
  afterAll(async () => {
    await pg.close();
  });

  let viewer = { id: "", url: "" as string | null, token: "" };
  let editor = { id: "", url: "" as string | null, token: "" };

  it("creates invitations with private links and no account", async () => {
    const a = await svc.createShare(ann, listId, { label: "Mama", level: "read" });
    const b = await svc.createShare(ann, listId, { label: "Fatmata", level: "write" });
    viewer = { id: a.id, url: a.url, token: tokenOf(a.url) };
    editor = { id: b.id, url: b.url, token: tokenOf(b.url) };
    expect(a.url).toMatch(/^https:\/\/app\.example\.test\/wish\/[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/);
    expect(a.url).not.toBe(b.url);
    expect(a).toMatchObject({ level: "read", status: "active", accessCount: 0 });
    // Nothing secret is stored: the link cannot be read back out of the table.
    const stored = JSON.stringify(await q("select * from wishlist_shares"));
    expect(stored).not.toContain(viewer.token.split(".")[1]);
  });

  it("opens a link as that list's owner, limited to that one list", async () => {
    const actor = await open(viewer.token);
    expect(actor).toMatchObject({ id: ann.id, via: { label: "Mama", level: "read", wishlistId: listId } });
    const view = await svc.sharedView(actor, listId);
    expect(view).toMatchObject({ sharedBy: "Ann", you: "Mama", access: { level: "read", canWrite: false }, wishlist: { name: "Home" } });
    // The same person cannot reach the owner's other list, even by asking for it.
    await expect(svc.listItems(actor, otherListId, { status: "wished", page: 1, pageSize: 10 })).rejects.toThrow(/not found/);
    await expect(svc.summary(actor, otherListId)).rejects.toThrow(/not found/);
  });

  it("rejects altered, wrong, unknown and malformed links", async () => {
    const [id, sig] = viewer.token.split(".") as [string, string];
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    await expect(open(`${id}.${flipped}`)).rejects.toThrow(/not valid/);
    await expect(open(`${id}.${signShare("11111111-1111-4111-8111-111111111111", 0)}`)).rejects.toThrow(/not valid/);
    await expect(open(`${"0".repeat(32)}.${sig}`)).rejects.toThrow(/not valid/);
    await expect(open("garbage")).rejects.toThrow(/not valid/);
    await expect(open(`${id}.${signShare(`${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`, 0, "another-secret-another-secret-123")}`)).rejects.toThrow(/not valid/);
  });

  it("view-only links can read everything but change nothing", async () => {
    const v = await open(viewer.token);
    expect((await svc.listItems(v, listId, { status: "wished", page: 1, pageSize: 10 })).items).toHaveLength(2);
    expect((await svc.summary(v, listId)).wishedCount).toBe(2);
    expect((await svc.activity(v, listId, 1, 10)).total).toBeGreaterThan(0);
    expect((await svc.exportRows(v, listId, "all")).items).toHaveLength(2);
    const denied = /view-only/;
    await expect(svc.addItems(v, listId, { items: [{ name: "x" }] })).rejects.toThrow(denied);
    await expect(svc.updateItem(v, listId, itemId, { name: "x" })).rejects.toThrow(denied);
    await expect(svc.markGotten(v, listId, { items: [{ itemId }] })).rejects.toThrow(denied);
    await expect(svc.unmarkGotten(v, listId, itemId)).rejects.toThrow(denied);
    await expect(svc.removeItem(v, listId, itemId)).rejects.toThrow(denied);
    await expect(svc.restoreItem(v, listId, itemId)).rejects.toThrow(denied);
    expect((await q<{ n: number }>("select count(*)::int as n from wish_items where wishlist_id = $1", [listId]))[0]!.n).toBe(2);
  });

  it("nobody with a link can manage the list or who it is shared with", async () => {
    for (const token of [viewer.token, editor.token]) {
      const a = await open(token);
      const owner = /Only the owner/;
      await expect(svc.listShares(a, listId)).rejects.toThrow(owner);
      await expect(svc.createShare(a, listId, { label: "x", level: "write" })).rejects.toThrow(owner);
      await expect(svc.updateShare(a, listId, viewer.id, { level: "write" })).rejects.toThrow(owner);
      await expect(svc.revokeShare(a, listId, viewer.id)).rejects.toThrow(owner);
      await expect(svc.resetShare(a, listId, viewer.id)).rejects.toThrow(owner);
      await expect(svc.updateWishlist(a, listId, { name: "Hijacked", budgetMinor: 1 })).rejects.toThrow(owner);
      await expect(svc.removeWishlist(a, listId)).rejects.toThrow(owner);
      await expect(svc.listWishlists(a, false)).rejects.toThrow(owner);
      await expect(svc.createWishlist(a, { name: "x" })).rejects.toThrow(owner);
    }
  });

  it("edit links can add, change, mark gotten, move back, remove and restore, and it all belongs to the owner", async () => {
    const e = await open(editor.token);
    const [lamp] = await svc.addItems(e, listId, { items: [{ name: "Lamp", unitPriceMinor: 10_000 }] });
    expect((await q<{ owner_id: string }>("select owner_id from wish_items where id = $1", [lamp!.id]))[0]!.owner_id).toBe(ann.id);
    await svc.updateItem(e, listId, lamp!.id, { name: "Floor lamp" });
    const got = await svc.markGotten(e, listId, { items: [{ itemId: lamp!.id, paidMinor: 9_000 }], gottenAt: "2026-01-10", store: "Market" });
    expect(got.items[0]).toMatchObject({ status: "gotten", paidMinor: 9_000 });
    await svc.unmarkGotten(e, listId, lamp!.id);
    await svc.removeItem(e, listId, lamp!.id);
    await svc.restoreItem(e, listId, lamp!.id);
    const owner = await svc.listItems(ann, listId, { status: "wished", page: 1, pageSize: 10 });
    expect(owner.items.map((i) => i.name)).toContain("Floor lamp");
  });

  it("records what a link holder did under the name the owner gave them", async () => {
    const rows = await q<{ type: string; actor_id: string | null; actor_label: string | null; share_id: string | null }>(
      "select type, actor_id, actor_label, share_id from wish_events where wishlist_id = $1 and actor_label is not null order by created_at",
      [listId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const r of rows) expect(r).toMatchObject({ actor_id: null, actor_label: "Fatmata", share_id: editor.id });
    const feed = await svc.activity(ann, listId, 1, 50);
    expect(feed.items.find((e) => e.type === "item_gotten")).toMatchObject({ byShare: "Fatmata" });
    expect(feed.items.find((e) => e.type === "list_created")).toMatchObject({ byShare: null });
  });

  it("only the owner can see and manage the invitations; another person cannot even find them", async () => {
    expect((await svc.listShares(ann, listId)).map((s) => s.label).sort()).toEqual(["Fatmata", "Mama"]);
    await expect(svc.listShares(bob, listId)).rejects.toThrow(/not found/);
    await expect(svc.createShare(bob, listId, { label: "x", level: "write" })).rejects.toThrow(/not found/);
    await expect(svc.revokeShare(bob, listId, viewer.id)).rejects.toThrow(/not found/);
    // An invitation id from one list does not work through another list.
    await expect(svc.revokeShare(ann, otherListId, viewer.id)).rejects.toThrow(/Invitation not found/);
  });

  it("changing the level takes effect at once on the same link", async () => {
    const updated = await svc.updateShare(ann, listId, viewer.id, { level: "write" });
    expect(updated.url).toBe(viewer.url);
    const v = await open(viewer.token);
    await svc.addItems(v, listId, { items: [{ name: "Rug" }] });
    await svc.updateShare(ann, listId, viewer.id, { level: "read" });
    await expect(svc.addItems(await open(viewer.token), listId, { items: [{ name: "Again" }] })).rejects.toThrow(/view-only/);
  });

  it("resetting a link kills the old one and gives a new one with the same access", async () => {
    const reset = await svc.resetShare(ann, listId, viewer.id);
    expect(reset.url).not.toBe(viewer.url);
    await expect(open(viewer.token)).rejects.toThrow(/not valid/);
    const actor = await open(tokenOf(reset.url));
    expect(actor.via).toMatchObject({ label: "Mama", level: "read" });
    viewer.token = tokenOf(reset.url);
  });

  it("an expired link stops working, and a longer expiry brings it back", async () => {
    await q("update wishlist_shares set expires_at = now() - interval '1 minute' where id = $1", [editor.id]);
    await expect(open(editor.token)).rejects.toThrow(/expired/);
    const listed = (await svc.listShares(ann, listId)).find((s) => s.id === editor.id)!;
    expect(listed).toMatchObject({ status: "expired", url: null });
    const extended = await svc.updateShare(ann, listId, editor.id, { expiresInDays: 7 });
    expect(extended.status).toBe("active");
    await expect(open(editor.token)).resolves.toBeTruthy();
  });

  it("removing access ends it for good and keeps the record", async () => {
    const before = (await svc.activity(ann, listId, 1, 100)).total;
    const gone = await svc.revokeShare(ann, listId, editor.id);
    expect(gone).toMatchObject({ status: "revoked", url: null });
    await expect(open(editor.token)).rejects.toThrow(/no longer shared/);
    await expect(svc.resetShare(ann, listId, editor.id)).rejects.toThrow(/removed/);
    await expect(svc.updateShare(ann, listId, editor.id, { level: "read" })).rejects.toThrow(/removed/);
    expect((await svc.activity(ann, listId, 1, 100)).total).toBe(before + 1);
    expect((await q("select id from wishlist_shares where id = $1", [editor.id])).length).toBe(1);
  });

  it("a link stops working when the owner removes the list", async () => {
    const temp = await svc.createWishlist(ann, { name: "Temp" });
    const s = await svc.createShare(ann, temp.id, { label: "Visitor", level: "write" });
    await expect(open(tokenOf(s.url))).resolves.toBeTruthy();
    await svc.removeWishlist(ann, temp.id);
    await expect(open(tokenOf(s.url))).rejects.toThrow(/no longer shared/);
  });

  it("emails the link only when asked, and never stores the address in the record", async () => {
    sendInvite.mockClear();
    const quiet = await svc.createShare(ann, listId, { label: "No email", level: "read", email: "quiet@example.com" });
    expect(sendInvite).not.toHaveBeenCalled();
    expect(quiet.emailed).toBe(false);
    const loud = await svc.createShare(ann, listId, { label: "Aunty", level: "write", email: "aunty@example.com", sendEmail: true, expiresInDays: 14 });
    expect(loud.emailed).toBe(true);
    expect(sendInvite).toHaveBeenCalledTimes(1);
    const [to, mail] = sendInvite.mock.calls[0] as unknown as [string, { subject: string; html: string }];
    expect(to).toBe("aunty@example.com");
    expect(mail.subject).toContain("Ann Tester");
    expect(mail.html).toContain(loud.url);
    expect(mail.html).toContain("make changes");
    await svc.resendInvite(ann, listId, quiet.id);
    expect(sendInvite).toHaveBeenCalledTimes(2);
    const noAddress = await svc.createShare(ann, listId, { label: "Link only", level: "read" });
    await expect(svc.resendInvite(ann, listId, noAddress.id)).rejects.toThrow(/no email address/);
    const events = JSON.stringify(await q("select details from wish_events where wishlist_id = $1", [listId]));
    expect(events).not.toContain("aunty@example.com");
    expect(events).not.toContain("quiet@example.com");
  });

  it("counts a visit at most once a minute", async () => {
    const s = await svc.createShare(ann, listId, { label: "Counter", level: "read" });
    const t = tokenOf(s.url);
    await open(t);
    await open(t);
    await open(t);
    const row = (await svc.listShares(ann, listId)).find((x) => x.id === s.id)!;
    expect(row.accessCount).toBe(1);
    expect(row.lastAccessedAt).toBeTruthy();
  });

  it("limits how many people a list can be shared with at once, even for simultaneous invitations", async () => {
    const big = await svc.createWishlist(bob, { name: "Big" });
    const results = await Promise.allSettled(Array.from({ length: 55 }, (_, i) => svc.createShare(bob, big.id, { label: `P${i}`, level: "read" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(50);
    const n = await q<{ n: number }>("select count(*)::int as n from wishlist_shares where wishlist_id = $1", [big.id]);
    expect(n[0]!.n).toBe(50);
  }, 60_000);

  it("the database refuses an unknown level or a blank name", async () => {
    await expect(pg.query(`insert into wishlist_shares (wishlist_id, label, level) values ('${listId}', 'x', 'admin')`)).rejects.toThrow();
    await expect(pg.query(`insert into wishlist_shares (wishlist_id, label, level) values ('${listId}', '  ', 'read')`)).rejects.toThrow();
  });
});
