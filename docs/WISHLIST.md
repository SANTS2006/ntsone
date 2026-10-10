# Wish List module

A personal module, like Programs, Voting Polls and Businesses, for **keeping track of what you want to buy or have, and what you actually got**. Menu: **Wish List** (`/admin/wishlists`), available to every signed-in person, whatever their role.

## 1. What people can do
- **Make several wish lists** ("Home", "Wedding", "Shop equipment"), each with a colour, a description, an optional **budget** and an optional "want it all by" date. Lists can be edited, **archived** (and brought back) or removed.
- **Add items one at a time or many at once.** Two ways: type rows (item, quantity, price each) or **paste a list** (one item per line, for example `Rice, 5, 350`). Up to 100 items per go. **Quantity and price are optional**; quantity is 1 when left out. Every item can also have a priority (high, medium, low), a category, notes and a web link.
- **Mark items as gotten** ("Got it", or tick several and press "I got these"). For each item the person records the **total price actually paid** (pre-filled with the expected total), the **date**, where it came from and a note. Gotten items move to the **Gotten** list.
- **Move an item back** to the wish list if it was marked by mistake. What had been recorded is kept in the activity.
- **Edit** anything later, including the price paid and the date of a gotten item. **Remove** an item (it is hidden, never destroyed) and **restore** it from "Show removed items".
- **Search, filter and sort** the wish list (priority, category, price) and the gotten list (date range, most paid).
- **Export** the list to CSV or Excel.

## 2. Sub-modules (tabs inside a list)
| Tab | Shows |
|---|---|
| **Wish list** | Items still wanted, with expected prices and a running expected total. |
| **Gotten** | What was got: price paid, date, where from, how much was **saved** (or paid extra) compared with the expected price, total paid, date filter. |
| **Summary** | Still to get and its expected cost, gotten and spent, progress, **budget** position (ok, close to the limit, over budget), spending **by category**, **by month**, and what is still wished for **by priority**. |
| **Activity** | A record of everything: created, changed (old and new values), added, got (with price and date), moved back, removed, restored. It cannot be edited. |

The first screen lists all of a person's wish lists with totals (still wished for, expected cost, gotten, spent) and a budget bar on each.

## 3. Privacy and access
**Each wish list is private to the person who made it.** Not the account's admin, not a super admin, not teammates: the server only ever looks up lists by the signed-in person's own id, and someone else's list answers exactly like one that does not exist. The owner can choose to share a list (section 3a).

## 3a. Sharing a list (people with no account)
In a list, **Share** (or the **Sharing** tab) invites someone:
- The owner gives each person a **name** (only the owner sees it, and it labels what they change), chooses **Can view** or **Can edit**, optionally an **email** (to send the link) and how long the link works (never, 7, 30, 90 days or a year).
- Each invitation has its **own private link and QR code**. The dialog offers copy, the device share sheet, WhatsApp, X, Facebook, LinkedIn, email and a QR download.
- **The invited person needs no account and cannot sign in to anything.** Opening the link (`/wish/<token>`) shows only that one list, on a plain page with no menu. They cannot reach any other list, the owner's account or any other part of the system.
- **Can view:** items, gotten list, summary, activity, and download. Nothing can be changed.
- **Can edit:** also add items, change them, mark gotten, move back, remove and restore. They can **not** change the list itself (name, budget, colour, archive, remove) or who it is shared with.
- The owner can **change the level** at any time (it works at once on the same link), **extend or end the expiry**, **make a new link** (the old link and QR stop working), **email the link again**, or **remove access** for good. They see when each link was last opened and how many times.
- What an editor does is recorded in the Activity under the name the owner gave them, for example "Got Sofa for NLe 3,800 by Fatmata (shared link)".
- A list can be shared with up to 50 people at once. Removing a list ends all its links.

### How the links stay safe
- A link is the invitation id plus a **signature only the server can make** (HMAC-SHA-256 with a server secret, checked in constant time). Links are **not stored** in the database, so a database leak exposes none of them. Making a new link changes the signature; changing `JWT_SECRET` would end every link.
- Every request re-checks that the invitation is active, not expired and that the list still exists; the permission level is read from the database each time, not from the link.
- Link holders act only on the one list their invitation names. The service refuses any other list even if a route made a mistake.
- Responses are never cached and carry `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`; `/wish/` is disallowed in robots.txt; and the token is **masked in the server log and the audit log**.
- Public routes are rate limited: changes to 60 a minute per address, opening the list to 120 a minute, and everything else under the platform's general limit. Invalid links all answer with the same message.
- Anyone who has a link can open the list, so send it only to the person it is for and use **New link** if it spreads.

## 4. Rules the system enforces
- Money is stored as whole cents (never decimals). Prices cannot be negative; a unit price is limited to NLe 100,000,000 and a total paid to NLe 100,000,000,000; quantity is a whole number from 1 to 100,000.
- A gotten date must be a real date, not before 1990 and not in the future (one day of leeway for time zones).
- Limits: 100 lists per person, 1,000 items per list, 100 items per request. Two requests at the same moment cannot get past a limit.
- **Safe to press twice.** Marking an item gotten is atomic: if two requests arrive together only one succeeds, the other is reported as "already gotten", and the item is never counted twice.
- Web links are only kept if they start with `http://` or `https://`.
- The database itself refuses impossible rows: non-positive quantities, negative prices, unknown priorities or statuses, blank names, and a "gotten" item without a date and a price (or a "wished" item with them).
- Nothing is really deleted. Removed items and lists stay in the database; the activity record cannot be changed.

## 5. Data (migration `0031`)
| Table | Purpose |
|---|---|
| `wishlists` | A list: owner, name, description, budget, target date, colour, archived and removed marks. |
| `wish_items` | An item: name, quantity, expected price each, priority, category, notes, link, status (`wished`/`gotten`), price paid, date gotten, store, note, removed mark. |
| `wish_events` | The activity record: who, what, when, the item's name at the time and the details that changed. For a shared link it stores the name the owner gave the person (`actor_label`) and the invitation (`share_id`). |
| `wishlist_shares` (`0032`) | One invitation: list, name, optional email, `read` or `write`, link generation (`rotation`), expiry, removal, last opened and count. The link itself is not stored. |

Indexes support the lists screen (by owner), the item lists (by list, status) and the gotten date filter. The backup module includes these tables automatically.

## 6. API
All routes are under `/api/wishlists`, need a signed-in user, and respond with the usual `{ success, data }` envelope.

| Method and URL | Purpose |
|---|---|
| `GET /wishlists?archived=false` | My lists with counts, expected cost, spent and budget position, plus overall totals |
| `POST /wishlists` | Create a list (`name`, optional `description`, `budgetMinor`, `targetDate`, `color`) |
| `GET /wishlists/:wishlistId` | One list |
| `PATCH /wishlists/:wishlistId` | Change a list, or `archived: true/false` |
| `DELETE /wishlists/:wishlistId` | Remove a list (kept in the records) |
| `GET /wishlists/:wishlistId/items` | Items. Query: `status` (`wished`/`gotten`/`removed`), `search`, `priority`, `category`, `sort`, `from`, `to` (gotten dates), `page`, `pageSize` (max 100). Returns the page and `totals` for the whole filter |
| `GET /wishlists/:wishlistId/categories` | Categories already used (for suggestions) |
| `POST /wishlists/:wishlistId/items` | Add one or many: `{ items: [{ name, quantity?, unitPriceMinor?, priority?, category?, notes?, link? }] }` |
| `PATCH /wishlists/:wishlistId/items/:itemId` | Edit an item; `paidMinor`, `gottenAt`, `store`, `gottenNote` only for gotten items |
| `POST /wishlists/:wishlistId/items/gotten` | Mark one or many as gotten: `{ items: [{ itemId, paidMinor?, gottenAt?, store?, note? }], gottenAt?, store?, note? }`. 409 if none could be marked |
| `POST /wishlists/:wishlistId/items/:itemId/ungot` | Move back to the wish list |
| `DELETE /wishlists/:wishlistId/items/:itemId` | Remove (hide) an item |
| `POST /wishlists/:wishlistId/items/:itemId/restore` | Bring a removed item back |
| `GET /wishlists/:wishlistId/summary` | Totals, budget, by category, month and priority |
| `GET /wishlists/:wishlistId/activity` | The record (paged) |
| `GET /wishlists/:wishlistId/export?format=csv|xlsx&status=wished|gotten|all` | Download |
| `GET /wishlists/:wishlistId/shares` | The invitations (with the link while it works) |
| `POST /wishlists/:wishlistId/shares` | Invite: `{ label, level: "read"|"write", email?, expiresInDays?, sendEmail? }`, answers with the link |
| `PATCH /wishlists/:wishlistId/shares/:shareId` | Change name, level or expiry |
| `DELETE /wishlists/:wishlistId/shares/:shareId` | Remove access for good |
| `POST /wishlists/:wishlistId/shares/:shareId/reset` | New link; the old one stops working |
| `POST /wishlists/:wishlistId/shares/:shareId/email` | Email the link again |

### Public routes for people with a link (no account)
`/api/public/wish/:token` answers with the list, who shared it and the access; under it the same item, summary, activity, categories and export routes as above (`/items`, `/items/gotten`, `/items/:itemId`, `/items/:itemId/ungot`, `/items/:itemId/restore`, `/summary`, `/activity`, `/export`). Changing routes are refused with 403 for view-only links. The token is never accepted for anything outside this list.

Prices in the API are whole minor units (`unitPriceMinor: 15000` = NLe 150.00). Wrong input answers 400 with the reason; someone else's list or item answers 404.

## 7. Code
- Backend: `backend/src/modules/wishlists` (`rules.ts` plain rules, `schemas.ts` validation, `service.ts` all database work, `routes.ts`), `backend/src/db/schema/wishlists.ts`, `backend/drizzle/0031_wishlist_module.sql`.
- Front end: `frontend/src/features/wishlists` (list page, list layout with tabs, the four tab pages, dialogs, shared pieces).
- Tests: `backend/tests/unit/wishlists.spec.ts` runs the whole service against a real in-memory Postgres built from the project's own migrations (privacy, double-marking, simultaneous requests, limits, database rules, summaries, records); `backend/tests/unit/wishlists-sharing.spec.ts` (links, signatures, view and edit levels, owner-only actions, expiry, new links, removal, emails, limits, records), `frontend/src/features/wishlists/api.test.ts`.

## 8. Ideas not built yet
Reminders when a link is about to expire, comments between people on the same list, recurring wishes, photos, moving an item between lists, price history reminders, a dashboard card.
