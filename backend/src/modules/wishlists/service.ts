import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db, type Database } from "../../db/client.js";
import { env } from "../../config/env.js";
import { users, wishEvents, wishItems, wishlists, wishlistShares } from "../../db/schema/index.js";
import { AppError } from "../../lib/errors.js";
import { buildPaginatedResult } from "../../lib/pagination.js";
import { queueEmail } from "../email/outbox.js";
import { wishlistInviteEmail } from "../email/templates.js";
import type { AuthenticatedUser } from "../users/types.js";
import { budgetPosition, defaultPaid, LIMITS, MAX_ACTIVE_SHARES, proposedTotal, safeLink, shareStatus, today, type ShareLevel } from "./rules.js";
import type { AddItemsInput, ItemsQuery, ListInput, ListUpdateInput, MarkGottenInput, ShareInput, ShareUpdateInput, UpdateItemInput } from "./schemas.js";

/**
 * Who is acting. For the owner, their own id. For someone using a shared link, `id` is the list's OWNER (so the data
 * belongs to the owner) and `via` says it is really a link holder, with the level the owner chose. Anything only the
 * owner may do refuses an actor that has `via`.
 */
export type Actor = Pick<AuthenticatedUser, "id" | "tenantId"> & { via?: { shareId: string; wishlistId: string; label: string; level: ShareLevel } };
type ListRow = typeof wishlists.$inferSelect;
type ItemRow = typeof wishItems.$inferSelect;
type EventType =
  | "list_created"
  | "list_updated"
  | "list_archived"
  | "list_restored"
  | "list_removed"
  | "item_added"
  | "item_updated"
  | "item_gotten"
  | "item_ungotten"
  | "item_removed"
  | "item_restored"
  | "share_created"
  | "share_updated"
  | "share_revoked"
  | "share_reset"
  | "share_emailed";

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const live = and(isNull(wishItems.removedAt));

// A person's wish lists are private: every query below is limited to the signed-in person's own lists, and a list that
// belongs to someone else answers exactly like one that does not exist.
export interface ServiceDeps {
  sendInvite(to: string, mail: { subject: string; html: string }): Promise<void>;
}

const defaultDeps: ServiceDeps = { sendInvite: (to, mail) => queueEmail({ to, subject: mail.subject, html: mail.html }) };

// Links are not stored: the token is the invitation id plus a signature only the server can make (and "reset" changes it).
const SHARE_TOKEN = /^([0-9a-f]{32}).([A-Za-z0-9_-]{43})$/;
export function signShare(shareId: string, rotation: number, secret = env.JWT_SECRET): string {
  return createHmac("sha256", secret).update(`wish-share:v1:${shareId}:${rotation}`).digest("base64url");
}
export const shareToken = (shareId: string, rotation: number, secret?: string) => `${shareId.replace(/-/g, "")}.${signShare(shareId, rotation, secret)}`;
const uuidFromHex = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

export function wishlistService(d: Database, deps: ServiceDeps = defaultDeps) {
  const assertOwner = (actor: Actor) => {
    if (actor.via) throw AppError.forbidden("Only the owner of the list can do this");
  };
  const assertWrite = (actor: Actor) => {
    if (actor.via && actor.via.level !== "write") throw AppError.forbidden("You have view-only access to this list");
  };

  async function ownedList(actor: Actor, wishlistId: string, tx: Pick<Database, "select"> = d): Promise<ListRow> {
    // A link holder can only ever reach the one list their invitation is for.
    if (actor.via && actor.via.wishlistId !== wishlistId) throw AppError.notFound("Wish list not found");
    const [row] = await tx
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.id, wishlistId), eq(wishlists.ownerId, actor.id), isNull(wishlists.deletedAt)))
      .limit(1);
    if (!row) throw AppError.notFound("Wish list not found");
    return row;
  }

  const record = (tx: Pick<Database, "insert">, actor: Actor, wishlistId: string, events: { type: EventType; itemId?: string | null; itemName?: string | null; details?: Record<string, unknown> }[]) =>
    events.length === 0
      ? Promise.resolve()
      : tx.insert(wishEvents).values(events.map((e) => ({ wishlistId, actorId: actor.via ? null : actor.id, actorLabel: actor.via?.label ?? null, shareId: actor.via?.shareId ?? null, type: e.type, itemId: e.itemId ?? null, itemName: e.itemName ?? null, details: e.details ?? null })));

  const serializeItem = (i: ItemRow) => ({
    id: i.id,
    wishlistId: i.wishlistId,
    name: i.name,
    quantity: i.quantity,
    unitPriceMinor: i.unitPriceMinor,
    proposedTotalMinor: proposedTotal(i.quantity, i.unitPriceMinor),
    priority: i.priority,
    category: i.category,
    notes: i.notes,
    link: i.link,
    status: i.removedAt ? "removed" : i.status,
    paidMinor: i.paidMinor,
    gottenAt: i.gottenAt,
    store: i.store,
    gottenNote: i.gottenNote,
    // Positive: paid less than expected. Negative: paid more. Null when no price was expected.
    savedMinor: i.status === "gotten" && i.paidMinor !== null && proposedTotal(i.quantity, i.unitPriceMinor) !== null ? proposedTotal(i.quantity, i.unitPriceMinor)! - i.paidMinor : null,
    removedAt: i.removedAt,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  });

  const serializeList = (l: ListRow) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    budgetMinor: l.budgetMinor,
    targetDate: l.targetDate,
    color: l.color,
    archived: l.archivedAt !== null,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  });

  // ------------------------------------------------------------------ lists

  async function listWishlists(actor: Actor, archived: boolean) {
    assertOwner(actor);
    const rows = await d.execute<{
      id: string;
      wished: string;
      gotten: string;
      planned: string;
      spent: string;
      last_activity: Date | null;
    }>(sql`
      select w.id,
        count(i.id) filter (where i.status = 'wished' and i.removed_at is null) as wished,
        count(i.id) filter (where i.status = 'gotten' and i.removed_at is null) as gotten,
        coalesce(sum(i.quantity * i.unit_price_minor) filter (where i.status = 'wished' and i.removed_at is null), 0) as planned,
        coalesce(sum(i.paid_minor) filter (where i.status = 'gotten' and i.removed_at is null), 0) as spent,
        greatest(w.updated_at, max(i.updated_at)) as last_activity
      from wishlists w
      left join wish_items i on i.wishlist_id = w.id
      where w.owner_id = ${actor.id} and w.deleted_at is null and (w.archived_at is not null) = ${archived}
      group by w.id
    `);
    const stats = new Map(rows.rows.map((r) => [r.id, r]));
    const lists = await d
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.ownerId, actor.id), isNull(wishlists.deletedAt), archived ? isNotNull(wishlists.archivedAt) : isNull(wishlists.archivedAt)))
      .orderBy(desc(wishlists.updatedAt))
      .limit(LIMITS.listsPerPerson);
    const items = lists.map((l) => {
      const s = stats.get(l.id);
      const spent = num(s?.spent);
      const planned = num(s?.planned);
      return {
        ...serializeList(l),
        wishedCount: num(s?.wished),
        gottenCount: num(s?.gotten),
        plannedMinor: planned,
        spentMinor: spent,
        budget: budgetPosition(l.budgetMinor, spent, planned),
        lastActivityAt: s?.last_activity ?? l.updatedAt,
      };
    });
    const totals = items.reduce(
      (t, l) => ({ lists: t.lists + 1, wished: t.wished + l.wishedCount, gotten: t.gotten + l.gottenCount, planned: t.planned + l.plannedMinor, spent: t.spent + l.spentMinor }),
      { lists: 0, wished: 0, gotten: 0, planned: 0, spent: 0 },
    );
    return { items, totals };
  }

  async function createWishlist(actor: Actor, input: ListInput) {
    assertOwner(actor);
    return d.transaction(async (tx) => {
      // Two lists created at once must not both squeeze under the limit.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wishlists:${actor.id}`}))`);
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(wishlists).where(and(eq(wishlists.ownerId, actor.id), isNull(wishlists.deletedAt)));
      if (n >= LIMITS.listsPerPerson) throw AppError.validation(`You can have up to ${LIMITS.listsPerPerson} wish lists`);
      const [row] = await tx
        .insert(wishlists)
        .values({
          ownerId: actor.id,
          tenantId: actor.tenantId,
          name: input.name,
          description: input.description ?? null,
          budgetMinor: input.budgetMinor ?? null,
          targetDate: input.targetDate ?? null,
          color: input.color ?? "blue",
        })
        .returning();
      await record(tx, actor, row!.id, [{ type: "list_created", details: { name: row!.name } }]);
      return serializeList(row!);
    });
  }

  async function getWishlist(actor: Actor, wishlistId: string) {
    return serializeList(await ownedList(actor, wishlistId));
  }

  async function updateWishlist(actor: Actor, wishlistId: string, input: ListUpdateInput) {
    assertOwner(actor);
    return d.transaction(async (tx) => {
      const before = await ownedList(actor, wishlistId, tx);
      const patch: Partial<typeof wishlists.$inferInsert> = { updatedAt: new Date() };
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      const set = <K extends "name" | "description" | "budgetMinor" | "targetDate" | "color">(key: K, value: ListRow[K] | undefined) => {
        if (value === undefined || value === before[key]) return;
        changed[key] = { from: before[key], to: value };
        (patch as Record<string, unknown>)[key] = value;
      };
      set("name", input.name);
      set("description", input.description === undefined ? undefined : (input.description ?? null));
      set("budgetMinor", input.budgetMinor === undefined ? undefined : (input.budgetMinor ?? null));
      set("targetDate", input.targetDate === undefined ? undefined : (input.targetDate ?? null));
      set("color", input.color);
      const events: Parameters<typeof record>[3] = [];
      if (Object.keys(changed).length) events.push({ type: "list_updated", details: changed });
      if (input.archived !== undefined && input.archived !== (before.archivedAt !== null)) {
        patch.archivedAt = input.archived ? new Date() : null;
        events.push({ type: input.archived ? "list_archived" : "list_restored" });
      }
      if (events.length === 0) return serializeList(before);
      const [row] = await tx.update(wishlists).set(patch).where(eq(wishlists.id, wishlistId)).returning();
      await record(tx, actor, wishlistId, events);
      return serializeList(row!);
    });
  }

  /** The list disappears from the person's screens; it and everything in it stays in the records. */
  async function removeWishlist(actor: Actor, wishlistId: string) {
    assertOwner(actor);
    await d.transaction(async (tx) => {
      const before = await ownedList(actor, wishlistId, tx);
      await tx.update(wishlists).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
      await record(tx, actor, wishlistId, [{ type: "list_removed", details: { name: before.name } }]);
    });
  }

  // ------------------------------------------------------------------ items

  async function addItems(actor: Actor, wishlistId: string, input: AddItemsInput) {
    assertWrite(actor);
    return d.transaction(async (tx) => {
      await ownedList(actor, wishlistId, tx);
      // One at a time per list, so two requests together cannot pass the size limit between them.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wishitems:${wishlistId}`}))`);
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(wishItems).where(and(eq(wishItems.wishlistId, wishlistId), live));
      if (n + input.items.length > LIMITS.itemsPerList) throw AppError.validation(`A list can hold up to ${LIMITS.itemsPerList} items (this one has ${n})`);
      const rows = await tx
        .insert(wishItems)
        .values(
          input.items.map((i) => ({
            wishlistId,
            ownerId: actor.id,
            name: i.name,
            quantity: i.quantity ?? 1,
            unitPriceMinor: i.unitPriceMinor ?? null,
            priority: i.priority ?? "medium",
            category: i.category ?? null,
            notes: i.notes ?? null,
            link: i.link ?? null,
          })),
        )
        .returning();
      await record(
        tx,
        actor,
        wishlistId,
        rows.map((r) => ({ type: "item_added" as const, itemId: r.id, itemName: r.name, details: { quantity: r.quantity, unitPriceMinor: r.unitPriceMinor } })),
      );
      await tx.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
      return rows.map(serializeItem);
    });
  }

  function itemFilters(wishlistId: string, q: Pick<ItemsQuery, "status" | "search" | "priority" | "category" | "from" | "to">): SQL[] {
    const where: SQL[] = [eq(wishItems.wishlistId, wishlistId)];
    if (q.status === "removed") where.push(isNotNull(wishItems.removedAt));
    else {
      where.push(isNull(wishItems.removedAt), eq(wishItems.status, q.status));
    }
    if (q.search) where.push(ilike(wishItems.name, `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
    if (q.priority) where.push(eq(wishItems.priority, q.priority));
    if (q.category) where.push(q.category === "__none__" ? isNull(wishItems.category) : eq(wishItems.category, q.category));
    if (q.status === "gotten") {
      if (q.from) where.push(gte(wishItems.gottenAt, q.from));
      if (q.to) where.push(lte(wishItems.gottenAt, q.to));
    }
    return where;
  }

  const priorityRank = sql`case ${wishItems.priority} when 'high' then 0 when 'medium' then 1 else 2 end`;

  async function listItems(actor: Actor, wishlistId: string, q: ItemsQuery) {
    await ownedList(actor, wishlistId);
    const where = and(...itemFilters(wishlistId, q));
    const sort = q.sort ?? (q.status === "gotten" ? "gotten_newest" : q.status === "removed" ? "newest" : "priority");
    const order = {
      newest: [desc(wishItems.createdAt)],
      oldest: [asc(wishItems.createdAt)],
      name: [asc(sql`lower(${wishItems.name})`)],
      priority: [priorityRank, desc(wishItems.createdAt)],
      price_high: [sql`${wishItems.quantity} * ${wishItems.unitPriceMinor} desc nulls last`],
      price_low: [sql`${wishItems.quantity} * ${wishItems.unitPriceMinor} asc nulls last`],
      gotten_newest: [desc(wishItems.gottenAt), desc(wishItems.updatedAt)],
      gotten_oldest: [asc(wishItems.gottenAt), asc(wishItems.updatedAt)],
      paid_high: [desc(wishItems.paidMinor)],
    }[sort];
    const [totals] = await d
      .select({
        n: sql<number>`count(*)::int`,
        proposed: sql<string>`coalesce(sum(${wishItems.quantity} * ${wishItems.unitPriceMinor}), 0)`,
        paid: sql<string>`coalesce(sum(${wishItems.paidMinor}), 0)`,
      })
      .from(wishItems)
      .where(where);
    const rows = await d
      .select()
      .from(wishItems)
      .where(where)
      .orderBy(...order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return {
      ...buildPaginatedResult(rows.map(serializeItem), totals?.n ?? 0, { page: q.page, pageSize: q.pageSize }),
      totals: { count: totals?.n ?? 0, proposedMinor: num(totals?.proposed), paidMinor: num(totals?.paid) },
    };
  }

  /** The categories already used on this list, to offer as suggestions. */
  async function categories(actor: Actor, wishlistId: string) {
    await ownedList(actor, wishlistId);
    const rows = await d
      .selectDistinct({ category: wishItems.category })
      .from(wishItems)
      .where(and(eq(wishItems.wishlistId, wishlistId), isNotNull(wishItems.category)))
      .orderBy(asc(wishItems.category))
      .limit(100);
    return rows.map((r) => r.category!).filter(Boolean);
  }

  async function ownedItem(tx: Pick<Database, "select">, actor: Actor, wishlistId: string, itemId: string) {
    await ownedList(actor, wishlistId, tx);
    const [row] = await tx.select().from(wishItems).where(and(eq(wishItems.id, itemId), eq(wishItems.wishlistId, wishlistId))).limit(1);
    if (!row) throw AppError.notFound("Item not found");
    return row;
  }

  async function updateItem(actor: Actor, wishlistId: string, itemId: string, input: UpdateItemInput) {
    assertWrite(actor);
    return d.transaction(async (tx) => {
      const before = await ownedItem(tx, actor, wishlistId, itemId);
      if (before.removedAt) throw AppError.conflict("Restore this item before changing it");
      const gotten = before.status === "gotten";
      if (!gotten && (input.paidMinor !== undefined || input.gottenAt !== undefined || input.store !== undefined || input.gottenNote !== undefined)) {
        throw AppError.validation("Mark the item as gotten first to record the price paid and the date");
      }
      const patch: Partial<typeof wishItems.$inferInsert> = { updatedAt: new Date() };
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      const set = (key: keyof typeof wishItems.$inferInsert & keyof ItemRow, value: unknown) => {
        if (value === undefined || value === before[key]) return;
        changed[key] = { from: before[key], to: value };
        (patch as Record<string, unknown>)[key] = value;
      };
      set("name", input.name);
      set("quantity", input.quantity);
      set("unitPriceMinor", input.unitPriceMinor);
      set("priority", input.priority);
      set("category", input.category);
      set("notes", input.notes);
      set("link", input.link === undefined ? undefined : safeLink(input.link));
      set("paidMinor", input.paidMinor);
      set("gottenAt", input.gottenAt);
      set("store", input.store);
      set("gottenNote", input.gottenNote);
      if (Object.keys(changed).length === 0) return serializeItem(before);
      const [row] = await tx.update(wishItems).set(patch).where(eq(wishItems.id, itemId)).returning();
      await record(tx, actor, wishlistId, [{ type: "item_updated", itemId, itemName: row!.name, details: changed }]);
      await tx.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
      return serializeItem(row!);
    });
  }

  /**
   * Marks items as gotten, with the price paid and the date. Safe to press twice: an item that is already gotten (or
   * removed) is skipped and reported, never changed or counted again.
   */
  async function markGotten(actor: Actor, wishlistId: string, input: MarkGottenInput) {
    assertWrite(actor);
    return d.transaction(async (tx) => {
      await ownedList(actor, wishlistId, tx);
      const wanted = [...new Set(input.items.map((i) => i.itemId))];
      if (wanted.length !== input.items.length) throw AppError.validation("An item was chosen twice");
      // Lock the rows so two requests for the same item cannot both succeed.
      const rows = await tx
        .select()
        .from(wishItems)
        .where(and(eq(wishItems.wishlistId, wishlistId), inArray(wishItems.id, wanted)))
        .for("update");
      const byId = new Map(rows.map((r) => [r.id, r]));
      const updated: ItemRow[] = [];
      const skipped: { itemId: string; reason: string }[] = [];
      const events: Parameters<typeof record>[3] = [];
      for (const one of input.items) {
        const item = byId.get(one.itemId);
        if (!item) {
          skipped.push({ itemId: one.itemId, reason: "not_found" });
          continue;
        }
        if (item.removedAt || item.status !== "wished") {
          skipped.push({ itemId: one.itemId, reason: item.removedAt ? "removed" : "already_gotten" });
          continue;
        }
        const paidMinor = one.paidMinor ?? defaultPaid(item.quantity, item.unitPriceMinor);
        const gottenAt = one.gottenAt ?? input.gottenAt ?? today();
        const [row] = await tx
          .update(wishItems)
          .set({ status: "gotten", paidMinor, gottenAt, store: one.store ?? input.store ?? null, gottenNote: one.note ?? input.note ?? null, updatedAt: new Date() })
          .where(and(eq(wishItems.id, item.id), eq(wishItems.status, "wished"), isNull(wishItems.removedAt)))
          .returning();
        if (!row) {
          skipped.push({ itemId: one.itemId, reason: "already_gotten" });
          continue;
        }
        updated.push(row);
        events.push({ type: "item_gotten", itemId: row.id, itemName: row.name, details: { paidMinor, gottenAt, store: row.store, quantity: row.quantity, proposedTotalMinor: proposedTotal(row.quantity, row.unitPriceMinor) } });
      }
      await record(tx, actor, wishlistId, events);
      if (updated.length) await tx.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
      return { items: updated.map(serializeItem), skipped };
    });
  }

  /** Moves a gotten item back to the wish list. What was recorded (price, date, store) is kept in the activity record. */
  async function unmarkGotten(actor: Actor, wishlistId: string, itemId: string) {
    assertWrite(actor);
    return d.transaction(async (tx) => {
      const before = await ownedItem(tx, actor, wishlistId, itemId);
      if (before.removedAt) throw AppError.conflict("Restore this item first");
      const [row] = await tx
        .update(wishItems)
        .set({ status: "wished", paidMinor: null, gottenAt: null, store: null, gottenNote: null, updatedAt: new Date() })
        .where(and(eq(wishItems.id, itemId), eq(wishItems.status, "gotten")))
        .returning();
      if (!row) throw AppError.conflict("This item is not marked as gotten");
      await record(tx, actor, wishlistId, [{ type: "item_ungotten", itemId, itemName: row.name, details: { paidMinor: before.paidMinor, gottenAt: before.gottenAt, store: before.store, gottenNote: before.gottenNote } }]);
      await tx.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
      return serializeItem(row);
    });
  }

  async function removeItem(actor: Actor, wishlistId: string, itemId: string) {
    assertWrite(actor);
    return d.transaction(async (tx) => {
      const before = await ownedItem(tx, actor, wishlistId, itemId);
      if (before.removedAt) return serializeItem(before);
      const [row] = await tx.update(wishItems).set({ removedAt: new Date(), updatedAt: new Date() }).where(and(eq(wishItems.id, itemId), isNull(wishItems.removedAt))).returning();
      await record(tx, actor, wishlistId, [{ type: "item_removed", itemId, itemName: before.name, details: { status: before.status, paidMinor: before.paidMinor } }]);
      await tx.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
      return serializeItem(row ?? before);
    });
  }

  async function restoreItem(actor: Actor, wishlistId: string, itemId: string) {
    assertWrite(actor);
    return d.transaction(async (tx) => {
      const before = await ownedItem(tx, actor, wishlistId, itemId);
      if (!before.removedAt) return serializeItem(before);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wishitems:${wishlistId}`}))`);
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(wishItems).where(and(eq(wishItems.wishlistId, wishlistId), live));
      if (n >= LIMITS.itemsPerList) throw AppError.validation(`A list can hold up to ${LIMITS.itemsPerList} items`);
      const [row] = await tx.update(wishItems).set({ removedAt: null, updatedAt: new Date() }).where(eq(wishItems.id, itemId)).returning();
      await record(tx, actor, wishlistId, [{ type: "item_restored", itemId, itemName: before.name }]);
      await tx.update(wishlists).set({ updatedAt: new Date() }).where(eq(wishlists.id, wishlistId));
      return serializeItem(row!);
    });
  }

  // ------------------------------------------------------------------ summary and records

  async function summary(actor: Actor, wishlistId: string) {
    const list = await ownedList(actor, wishlistId);
    const [t] = (
      await d.execute<{ wished: string; unpriced: string; planned: string; gotten: string; spent: string; gotten_planned: string; gotten_priced: string; removed: string }>(sql`
        select
          count(*) filter (where status = 'wished' and removed_at is null) as wished,
          count(*) filter (where status = 'wished' and removed_at is null and unit_price_minor is null) as unpriced,
          coalesce(sum(quantity * unit_price_minor) filter (where status = 'wished' and removed_at is null), 0) as planned,
          count(*) filter (where status = 'gotten' and removed_at is null) as gotten,
          coalesce(sum(paid_minor) filter (where status = 'gotten' and removed_at is null), 0) as spent,
          coalesce(sum(quantity * unit_price_minor) filter (where status = 'gotten' and removed_at is null and unit_price_minor is not null), 0) as gotten_planned,
          coalesce(sum(paid_minor) filter (where status = 'gotten' and removed_at is null and unit_price_minor is not null), 0) as gotten_priced,
          count(*) filter (where removed_at is not null) as removed
        from wish_items where wishlist_id = ${wishlistId}`)
    ).rows;
    const byCategory = (
      await d.execute<{ category: string | null; wished: string; gotten: string; planned: string; spent: string }>(sql`
        select category,
          count(*) filter (where status = 'wished') as wished,
          count(*) filter (where status = 'gotten') as gotten,
          coalesce(sum(quantity * unit_price_minor) filter (where status = 'wished'), 0) as planned,
          coalesce(sum(paid_minor) filter (where status = 'gotten'), 0) as spent
        from wish_items where wishlist_id = ${wishlistId} and removed_at is null
        group by category order by (coalesce(sum(paid_minor) filter (where status = 'gotten'), 0) + coalesce(sum(quantity * unit_price_minor) filter (where status = 'wished'), 0)) desc limit 30`)
    ).rows;
    const byMonth = (
      await d.execute<{ month: string; items: string; spent: string }>(sql`
        select to_char(gotten_at, 'YYYY-MM') as month, count(*) as items, coalesce(sum(paid_minor), 0) as spent
        from wish_items where wishlist_id = ${wishlistId} and removed_at is null and status = 'gotten'
        group by 1 order by 1 desc limit 12`)
    ).rows;
    const byPriority = (
      await d.execute<{ priority: string; items: string; planned: string }>(sql`
        select priority, count(*) as items, coalesce(sum(quantity * unit_price_minor), 0) as planned
        from wish_items where wishlist_id = ${wishlistId} and removed_at is null and status = 'wished' group by priority`)
    ).rows;
    const spentMinor = num(t?.spent);
    const plannedMinor = num(t?.planned);
    const gotten = num(t?.gotten);
    const wished = num(t?.wished);
    return {
      wishedCount: wished,
      unpricedCount: num(t?.unpriced),
      plannedMinor,
      gottenCount: gotten,
      spentMinor,
      removedCount: num(t?.removed),
      // Among gotten items that had an expected price: how much less (positive) or more (negative) was paid.
      savedMinor: num(t?.gotten_planned) - num(t?.gotten_priced),
      percentGotten: wished + gotten === 0 ? 0 : Math.round((gotten / (wished + gotten)) * 100),
      budget: budgetPosition(list.budgetMinor, spentMinor, plannedMinor),
      byCategory: byCategory.map((r) => ({ category: r.category, wishedCount: num(r.wished), gottenCount: num(r.gotten), plannedMinor: num(r.planned), spentMinor: num(r.spent) })),
      byMonth: byMonth.map((r) => ({ month: r.month, items: num(r.items), spentMinor: num(r.spent) })).reverse(),
      byPriority: ["high", "medium", "low"].map((p) => {
        const r = byPriority.find((x) => x.priority === p);
        return { priority: p, items: num(r?.items), plannedMinor: num(r?.planned) };
      }),
    };
  }

  async function activity(actor: Actor, wishlistId: string, page: number, pageSize: number) {
    await ownedList(actor, wishlistId);
    const [{ n } = { n: 0 }] = await d.select({ n: sql<number>`count(*)::int` }).from(wishEvents).where(eq(wishEvents.wishlistId, wishlistId));
    const rows = await d
      .select()
      .from(wishEvents)
      .where(eq(wishEvents.wishlistId, wishlistId))
      .orderBy(desc(wishEvents.createdAt), desc(wishEvents.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return buildPaginatedResult(
      rows.map((e) => ({ id: e.id, type: e.type, itemId: e.itemId, itemName: e.itemName, details: e.details, byShare: e.actorLabel, createdAt: e.createdAt })),
      n,
      { page, pageSize },
    );
  }

  /** Everything on the list (for an export), capped. */
  async function exportRows(actor: Actor, wishlistId: string, status: "wished" | "gotten" | "all") {
    const list = await ownedList(actor, wishlistId);
    const where = and(eq(wishItems.wishlistId, wishlistId), isNull(wishItems.removedAt), status === "all" ? undefined : eq(wishItems.status, status));
    const rows = await d.select().from(wishItems).where(where).orderBy(asc(wishItems.status), desc(wishItems.gottenAt), desc(wishItems.createdAt)).limit(LIMITS.itemsPerList);
    return { list: serializeList(list), items: rows.map(serializeItem) };
  }

  // ------------------------------------------------------------------ sharing: owner manages invitations, link holders open them

  type ShareRow = typeof wishlistShares.$inferSelect;
  const appUrl = () => env.APP_URL.replace(/\/+$/, "");
  const linkFor = (s: ShareRow) => `${appUrl()}/wish/${shareToken(s.id, s.rotation)}`;
  const expiryFrom = (days: number | null | undefined) => (days ? new Date(Date.now() + days * 86_400_000) : null);

  const serializeShare = (s: ShareRow) => {
    const status = shareStatus(s);
    return {
      id: s.id,
      label: s.label,
      email: s.email,
      level: s.level as ShareLevel,
      status,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      lastAccessedAt: s.lastAccessedAt,
      accessCount: s.accessCount,
      createdAt: s.createdAt,
      // The link is only given out while it works.
      url: status === "active" ? linkFor(s) : null,
    };
  };

  async function ownedShare(tx: Pick<Database, "select">, actor: Actor, wishlistId: string, shareId: string) {
    await ownedList(actor, wishlistId, tx);
    const [row] = await tx.select().from(wishlistShares).where(and(eq(wishlistShares.id, shareId), eq(wishlistShares.wishlistId, wishlistId))).limit(1);
    if (!row) throw AppError.notFound("Invitation not found");
    return row;
  }

  async function listShares(actor: Actor, wishlistId: string) {
    assertOwner(actor);
    await ownedList(actor, wishlistId);
    const rows = await d.select().from(wishlistShares).where(eq(wishlistShares.wishlistId, wishlistId)).orderBy(desc(wishlistShares.createdAt)).limit(200);
    return rows.map(serializeShare);
  }

  async function sendInviteEmail(actor: Actor, list: ListRow, share: ShareRow) {
    if (!share.email) return false;
    const [owner] = await d.select({ name: users.name }).from(users).where(eq(users.id, actor.id)).limit(1);
    const mail = wishlistInviteEmail({ ownerName: owner?.name ?? "Someone", listName: list.name, canEdit: share.level === "write", url: linkFor(share), recipientName: share.label, expiresAt: share.expiresAt });
    await deps.sendInvite(share.email, mail);
    return true;
  }

  async function createShare(actor: Actor, wishlistId: string, input: ShareInput) {
    assertOwner(actor);
    const { share, list } = await d.transaction(async (tx) => {
      const list = await ownedList(actor, wishlistId, tx);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wishshares:${wishlistId}`}))`);
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(wishlistShares)
        .where(and(eq(wishlistShares.wishlistId, wishlistId), isNull(wishlistShares.revokedAt), sql`(${wishlistShares.expiresAt} is null or ${wishlistShares.expiresAt} > now())`));
      if (n >= MAX_ACTIVE_SHARES) throw AppError.validation(`A list can be shared with up to ${MAX_ACTIVE_SHARES} people at once. Remove an invitation you no longer need.`);
      const [share] = await tx
        .insert(wishlistShares)
        .values({ wishlistId, createdBy: actor.id, label: input.label, email: input.email ?? null, level: input.level, expiresAt: expiryFrom(input.expiresInDays) })
        .returning();
      await record(tx, actor, wishlistId, [{ type: "share_created", details: { label: share!.label, level: share!.level, expiresAt: share!.expiresAt } }]);
      return { share: share!, list };
    });
    let emailed = false;
    if (input.sendEmail && share.email) {
      try {
        emailed = await sendInviteEmail(actor, list, share);
        if (emailed) await record(d, actor, wishlistId, [{ type: "share_emailed", details: { label: share.label } }]);
      } catch (err) {
        console.error("Could not queue a wish list invitation email", err);
      }
    }
    return { ...serializeShare(share), emailed };
  }

  async function updateShare(actor: Actor, wishlistId: string, shareId: string, input: ShareUpdateInput) {
    assertOwner(actor);
    return d.transaction(async (tx) => {
      const before = await ownedShare(tx, actor, wishlistId, shareId);
      if (before.revokedAt) throw AppError.conflict("This invitation was removed");
      const patch: Partial<typeof wishlistShares.$inferInsert> = { updatedAt: new Date() };
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      if (input.label !== undefined && input.label !== before.label) {
        patch.label = input.label;
        changed.label = { from: before.label, to: input.label };
      }
      if (input.level !== undefined && input.level !== before.level) {
        patch.level = input.level;
        changed.level = { from: before.level, to: input.level };
      }
      if (input.expiresInDays !== undefined) {
        patch.expiresAt = expiryFrom(input.expiresInDays);
        changed.expiresAt = { from: before.expiresAt, to: patch.expiresAt };
      }
      if (Object.keys(changed).length === 0) return serializeShare(before);
      const [row] = await tx.update(wishlistShares).set(patch).where(eq(wishlistShares.id, shareId)).returning();
      await record(tx, actor, wishlistId, [{ type: "share_updated", details: { label: row!.label, ...changed } }]);
      return serializeShare(row!);
    });
  }

  /** Stops the link working for good. The record of what that person did stays. */
  async function revokeShare(actor: Actor, wishlistId: string, shareId: string) {
    assertOwner(actor);
    return d.transaction(async (tx) => {
      const before = await ownedShare(tx, actor, wishlistId, shareId);
      if (before.revokedAt) return serializeShare(before);
      const [row] = await tx.update(wishlistShares).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(wishlistShares.id, shareId)).returning();
      await record(tx, actor, wishlistId, [{ type: "share_revoked", details: { label: before.label } }]);
      return serializeShare(row!);
    });
  }

  /** Gives the invitation a new link and kills the old one (for a link that was passed on or posted by mistake). */
  async function resetShare(actor: Actor, wishlistId: string, shareId: string) {
    assertOwner(actor);
    return d.transaction(async (tx) => {
      const before = await ownedShare(tx, actor, wishlistId, shareId);
      if (before.revokedAt) throw AppError.conflict("This invitation was removed");
      const [row] = await tx.update(wishlistShares).set({ rotation: before.rotation + 1, updatedAt: new Date() }).where(eq(wishlistShares.id, shareId)).returning();
      await record(tx, actor, wishlistId, [{ type: "share_reset", details: { label: before.label } }]);
      return serializeShare(row!);
    });
  }

  async function resendInvite(actor: Actor, wishlistId: string, shareId: string) {
    assertOwner(actor);
    const list = await ownedList(actor, wishlistId);
    const share = await ownedShare(d, actor, wishlistId, shareId);
    if (share.revokedAt || shareStatus(share) !== "active") throw AppError.conflict("This invitation is not active");
    if (!share.email) throw AppError.validation("There is no email address for this invitation");
    await sendInviteEmail(actor, list, share);
    await record(d, actor, wishlistId, [{ type: "share_emailed", details: { label: share.label } }]);
    return { sent: true };
  }

  /**
   * Opens a shared link. Checks the signature (in constant time), that the invitation was not removed or has not
   * expired, and that the list still exists. The result acts as the list's owner but only on this one list.
   */
  async function resolveShare(token: string): Promise<{ actor: Actor; wishlistId: string }> {
    const invalid = () => AppError.notFound("This link is not valid. Ask the person who shared the list to send it again.");
    const m = SHARE_TOKEN.exec(token);
    if (!m) throw invalid();
    const shareId = uuidFromHex(m[1]!);
    const [row] = await d
      .select({ share: wishlistShares, ownerId: wishlists.ownerId, tenantId: wishlists.tenantId, deletedAt: wishlists.deletedAt })
      .from(wishlistShares)
      .innerJoin(wishlists, eq(wishlists.id, wishlistShares.wishlistId))
      .where(eq(wishlistShares.id, shareId))
      .limit(1);
    if (!row) throw invalid();
    const expected = Buffer.from(signShare(shareId, row.share.rotation));
    const given = Buffer.from(m[2]!);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw invalid();
    const status = shareStatus(row.share);
    if (row.deletedAt || status !== "active") throw AppError.notFound(status === "expired" ? "This link has expired. Ask the owner for a new one." : "This wish list is no longer shared with you.");
    // Counting every visit would write on every page load; once a minute is enough to show "last opened".
    await d
      .update(wishlistShares)
      .set({ lastAccessedAt: new Date(), accessCount: sql`${wishlistShares.accessCount} + 1` })
      .where(and(eq(wishlistShares.id, shareId), sql`(${wishlistShares.lastAccessedAt} is null or ${wishlistShares.lastAccessedAt} < now() - interval '1 minute')`));
    return {
      wishlistId: row.share.wishlistId,
      actor: { id: row.ownerId, tenantId: row.tenantId, via: { shareId, wishlistId: row.share.wishlistId, label: row.share.label, level: row.share.level as ShareLevel } },
    };
  }

  /** What someone with a link sees at the top: the list, who shared it, and what they may do. */
  async function sharedView(actor: Actor, wishlistId: string) {
    const list = await ownedList(actor, wishlistId);
    const [owner] = await d.select({ name: users.name }).from(users).where(eq(users.id, list.ownerId)).limit(1);
    return {
      wishlist: serializeList(list),
      sharedBy: (owner?.name ?? "").trim().split(/\s+/)[0] || "The owner",
      you: actor.via?.label ?? "",
      access: { level: actor.via?.level ?? "write", canWrite: !actor.via || actor.via.level === "write" },
    };
  }

  return { listShares, createShare, updateShare, revokeShare, resetShare, resendInvite, resolveShare, sharedView, listWishlists, createWishlist, getWishlist, updateWishlist, removeWishlist, addItems, listItems, categories, updateItem, markGotten, unmarkGotten, removeItem, restoreItem, summary, activity, exportRows };
}

export type WishlistService = ReturnType<typeof wishlistService>;
export const wishlistsService = wishlistService(db);
