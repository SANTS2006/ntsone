import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { sendSuccess } from "../../lib/response.js";
import { MONEY_FORMAT, sendTableExport } from "../../lib/tableExport.js";
import {
  activityQuerySchema,
  addItemsSchema,
  exportQuerySchema,
  itemsQuerySchema,
  listInputSchema,
  listsQuerySchema,
  listUpdateSchema,
  markGottenSchema,
  shareInputSchema,
  shareUpdateSchema,
  updateItemSchema,
} from "./schemas.js";
import { wishlistsService as svc, type Actor } from "./service.js";

const listParams = z.object({ wishlistId: z.string().uuid() });
const itemParam = z.object({ itemId: z.string().uuid() });
const shareParams = listParams.extend({ shareId: z.string().uuid() });
const tokenParams = z.object({ token: z.string().min(40).max(120) });

const actorOf = (request: FastifyRequest): Actor => {
  if (!request.user) throw AppError.unauthorized();
  return { id: request.user.id, tenantId: request.user.tenantId };
};
const noStore = (reply: { header: (name: string, value: string) => unknown }) => reply.header("Cache-Control", "no-store");

/** Who is asking and which list: the signed-in owner (and the list in the address), or the holder of a shared link. */
type Resolve = (request: FastifyRequest) => Promise<{ actor: Actor; wishlistId: string }>;

/**
 * Everything inside a list: items, gotten, summary, activity, export. Mounted twice with the same handlers: for the
 * signed-in owner (`/wishlists/:wishlistId/...`) and for people with a shared link (`/public/wish/:token/...`).
 * What a link holder may change is decided in the service (view-only links are refused there), not here.
 */
function mountListContent(app: FastifyInstance, base: string, resolve: Resolve, writeLimit: number) {
  const write = { config: { rateLimit: { max: writeLimit, timeWindow: "1 minute" } } };

  app.get(`${base}/items`, async (request, reply) => {
    noStore(reply);
    const { actor, wishlistId } = await resolve(request);
    return sendSuccess(reply, await svc.listItems(actor, wishlistId, itemsQuerySchema.parse(request.query)));
  });

  app.get(`${base}/categories`, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    return sendSuccess(reply, await svc.categories(actor, wishlistId));
  });

  // One or many items in one go.
  app.post(`${base}/items`, write, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    const items = await svc.addItems(actor, wishlistId, addItemsSchema.parse(request.body));
    reply.status(201);
    return sendSuccess(reply, { items }, items.length === 1 ? "Item added" : `${items.length} items added`);
  });

  // Declared before /items/:itemId so "gotten" is never read as an id.
  app.post(`${base}/items/gotten`, write, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    const result = await svc.markGotten(actor, wishlistId, markGottenSchema.parse(request.body));
    if (result.items.length === 0) throw AppError.conflict("These items were already marked as gotten, or were removed.", { skipped: result.skipped });
    return sendSuccess(reply, result, result.items.length === 1 ? "Marked as gotten" : `${result.items.length} items marked as gotten`);
  });

  app.patch(`${base}/items/:itemId`, write, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    const { itemId } = itemParam.parse(request.params);
    return sendSuccess(reply, await svc.updateItem(actor, wishlistId, itemId, updateItemSchema.parse(request.body)), "Saved");
  });

  app.post(`${base}/items/:itemId/ungot`, write, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    const { itemId } = itemParam.parse(request.params);
    return sendSuccess(reply, await svc.unmarkGotten(actor, wishlistId, itemId), "Moved back to the wish list");
  });

  app.post(`${base}/items/:itemId/restore`, write, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    const { itemId } = itemParam.parse(request.params);
    return sendSuccess(reply, await svc.restoreItem(actor, wishlistId, itemId), "Item restored");
  });

  app.delete(`${base}/items/:itemId`, write, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    const { itemId } = itemParam.parse(request.params);
    return sendSuccess(reply, await svc.removeItem(actor, wishlistId, itemId), "Item removed");
  });

  app.get(`${base}/summary`, async (request, reply) => {
    noStore(reply);
    const { actor, wishlistId } = await resolve(request);
    return sendSuccess(reply, await svc.summary(actor, wishlistId));
  });

  app.get(`${base}/activity`, async (request, reply) => {
    noStore(reply);
    const { actor, wishlistId } = await resolve(request);
    const q = activityQuerySchema.parse(request.query);
    return sendSuccess(reply, await svc.activity(actor, wishlistId, q.page, q.pageSize));
  });

  app.get(`${base}/export`, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    const { format, status } = exportQuerySchema.parse(request.query);
    const { list, items } = await svc.exportRows(actor, wishlistId, status);
    const money = (minor: number | null) => (minor === null ? null : minor / 100);
    return sendTableExport(reply, format, `Wish list ${list.name}`, [
      {
        name: "Items",
        rows: items,
        columns: [
          { label: "Item", value: (i) => i.name },
          { label: "Status", value: (i) => (i.status === "gotten" ? "Gotten" : "Wished") },
          { label: "Quantity", value: (i) => i.quantity },
          { label: "Expected price each", value: (i) => money(i.unitPriceMinor), numFmt: MONEY_FORMAT },
          { label: "Expected total", value: (i) => money(i.proposedTotalMinor), numFmt: MONEY_FORMAT },
          { label: "Price paid (total)", value: (i) => money(i.paidMinor), numFmt: MONEY_FORMAT },
          { label: "Saved (+) or extra (-)", value: (i) => money(i.savedMinor), numFmt: MONEY_FORMAT },
          { label: "Date gotten", value: (i) => i.gottenAt },
          { label: "Where", value: (i) => i.store },
          { label: "Priority", value: (i) => i.priority },
          { label: "Category", value: (i) => i.category },
          { label: "Notes", value: (i) => i.notes },
          { label: "Link", value: (i) => i.link },
          { label: "Added", value: (i) => i.createdAt },
        ],
      },
    ]);
  });
}

/**
 * The Wish List module for signed-in people. Every signed-in person can keep their own lists; each list is private to
 * its owner unless the owner invites someone (see the sharing routes below). Nothing is ever really deleted.
 */
export async function wishlistRoutes(app: FastifyInstance) {
  const write = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };

  app.get("/", async (request, reply) => {
    noStore(reply);
    const { archived } = listsQuerySchema.parse(request.query);
    return sendSuccess(reply, await svc.listWishlists(actorOf(request), archived));
  });

  app.post("/", write, async (request, reply) => {
    const created = await svc.createWishlist(actorOf(request), listInputSchema.parse(request.body));
    reply.status(201);
    return sendSuccess(reply, created, "Wish list created");
  });

  app.get("/:wishlistId", async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await svc.getWishlist(actorOf(request), listParams.parse(request.params).wishlistId));
  });

  app.patch("/:wishlistId", write, async (request, reply) => {
    const { wishlistId } = listParams.parse(request.params);
    return sendSuccess(reply, await svc.updateWishlist(actorOf(request), wishlistId, listUpdateSchema.parse(request.body)), "Saved");
  });

  app.delete("/:wishlistId", write, async (request, reply) => {
    await svc.removeWishlist(actorOf(request), listParams.parse(request.params).wishlistId);
    return sendSuccess(reply, { removed: true }, "Wish list removed");
  });

  // ---- sharing: invite people (no account needed) with a private link and QR code
  const shareWrite = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

  app.get("/:wishlistId/shares", async (request, reply) => {
    noStore(reply);
    return sendSuccess(reply, await svc.listShares(actorOf(request), listParams.parse(request.params).wishlistId));
  });

  app.post("/:wishlistId/shares", shareWrite, async (request, reply) => {
    const { wishlistId } = listParams.parse(request.params);
    const share = await svc.createShare(actorOf(request), wishlistId, shareInputSchema.parse(request.body));
    reply.status(201);
    return sendSuccess(reply, share, share.emailed ? "Invitation created and emailed" : "Invitation created");
  });

  app.patch("/:wishlistId/shares/:shareId", shareWrite, async (request, reply) => {
    const { wishlistId, shareId } = shareParams.parse(request.params);
    return sendSuccess(reply, await svc.updateShare(actorOf(request), wishlistId, shareId, shareUpdateSchema.parse(request.body)), "Saved");
  });

  app.delete("/:wishlistId/shares/:shareId", shareWrite, async (request, reply) => {
    const { wishlistId, shareId } = shareParams.parse(request.params);
    return sendSuccess(reply, await svc.revokeShare(actorOf(request), wishlistId, shareId), "Access removed");
  });

  app.post("/:wishlistId/shares/:shareId/reset", shareWrite, async (request, reply) => {
    const { wishlistId, shareId } = shareParams.parse(request.params);
    return sendSuccess(reply, await svc.resetShare(actorOf(request), wishlistId, shareId), "A new link was made. The old one no longer works.");
  });

  app.post("/:wishlistId/shares/:shareId/email", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const { wishlistId, shareId } = shareParams.parse(request.params);
    return sendSuccess(reply, await svc.resendInvite(actorOf(request), wishlistId, shareId), "Invitation emailed");
  });

  mountListContent(app, "/:wishlistId", async (request) => ({ actor: actorOf(request), wishlistId: listParams.parse(request.params).wishlistId }), 120);
}

/**
 * Shared wish lists for people WITHOUT an account (`/api/public/wish/:token`). The token in the address is the only
 * credential: it identifies one invitation to one list, with the access the owner set. Nothing here can reach anything
 * else in the system. Responses are never cached or indexed.
 */
export async function sharedWishlistRoutes(app: FastifyInstance) {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Robots-Tag", "noindex, nofollow");
    reply.header("Referrer-Policy", "no-referrer");
  });

  const resolve: Resolve = async (request) => svc.resolveShare(tokenParams.parse(request.params).token);

  app.get("/:token", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { actor, wishlistId } = await resolve(request);
    return sendSuccess(reply, await svc.sharedView(actor, wishlistId));
  });

  mountListContent(app, "/:token", resolve, 60);
}
