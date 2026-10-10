import { apiFetch } from "@/lib/api";

export type Priority = "low" | "medium" | "high";
export type ItemStatus = "wished" | "gotten" | "removed";

export interface BudgetPosition {
  budgetMinor: number | null;
  spentMinor: number;
  plannedMinor: number;
  remainingMinor: number | null;
  overBudgetBy: number;
  percentSpent: number | null;
  state: "none" | "ok" | "warning" | "over";
}

export interface Wishlist {
  id: string;
  name: string;
  description: string | null;
  budgetMinor: number | null;
  targetDate: string | null;
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistWithStats extends Wishlist {
  wishedCount: number;
  gottenCount: number;
  plannedMinor: number;
  spentMinor: number;
  budget: BudgetPosition;
  lastActivityAt: string;
}

export interface WishItem {
  id: string;
  wishlistId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number | null;
  proposedTotalMinor: number | null;
  priority: Priority;
  category: string | null;
  notes: string | null;
  link: string | null;
  status: ItemStatus;
  paidMinor: number | null;
  gottenAt: string | null;
  store: string | null;
  gottenNote: string | null;
  savedMinor: number | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ItemsPage extends Paged<WishItem> {
  totals: { count: number; proposedMinor: number; paidMinor: number };
}

export interface WishSummary {
  wishedCount: number;
  unpricedCount: number;
  plannedMinor: number;
  gottenCount: number;
  spentMinor: number;
  removedCount: number;
  savedMinor: number;
  percentGotten: number;
  budget: BudgetPosition;
  byCategory: { category: string | null; wishedCount: number; gottenCount: number; plannedMinor: number; spentMinor: number }[];
  byMonth: { month: string; items: number; spentMinor: number }[];
  byPriority: { priority: Priority; items: number; plannedMinor: number }[];
}

export interface WishEvent {
  id: string;
  type: string;
  itemId: string | null;
  itemName: string | null;
  details: Record<string, unknown> | null;
  /** The name the owner gave the person, when someone with a shared link did it. */
  byShare: string | null;
  createdAt: string;
}

export interface NewItem {
  name: string;
  quantity?: number;
  unitPriceMinor?: number | null;
  priority?: Priority;
  category?: string | null;
  notes?: string | null;
  link?: string | null;
}

export interface GotInput {
  items: { itemId: string; paidMinor?: number; gottenAt?: string; store?: string | null; note?: string | null }[];
  gottenAt?: string;
  store?: string | null;
  note?: string | null;
}

export interface ListInput {
  name?: string;
  description?: string | null;
  budgetMinor?: number | null;
  targetDate?: string | null;
  color?: string;
  archived?: boolean;
}

export const wishKeys = {
  all: ["wishlists"] as const,
  lists: (archived: boolean) => ["wishlists", "lists", archived] as const,
  list: (id: string) => ["wishlists", "list", id] as const,
  items: (id: string, params: unknown) => ["wishlists", "items", id, params] as const,
  summary: (id: string) => ["wishlists", "summary", id] as const,
  activity: (id: string, page: number) => ["wishlists", "activity", id, page] as const,
  categories: (id: string) => ["wishlists", "categories", id] as const,
};

/**
 * A list is addressed by its id (the owner, signed in) or by `s:<token>` (someone using a shared link, no account). The
 * same screens work for both because every call here goes through root().
 */
export const SHARED_PREFIX = "s:";
export const sharedScope = (token: string) => `${SHARED_PREFIX}${token}`;
export const isSharedScope = (id: string) => id.startsWith(SHARED_PREFIX);
export const root = (id: string) => (isSharedScope(id) ? `/public/wish/${id.slice(SHARED_PREFIX.length)}` : `/wishlists/${id}`);

const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const text = s.toString();
  return text ? `?${text}` : "";
};

export const listWishlists = (archived: boolean) => apiFetch<{ items: WishlistWithStats[]; totals: { lists: number; wished: number; gotten: number; planned: number; spent: number } }>(`/wishlists${qs({ archived: archived ? "true" : "false" })}`);
export const getWishlist = (id: string) => apiFetch<Wishlist>(`/wishlists/${id}`);
export const createWishlist = (body: ListInput) => apiFetch<Wishlist>("/wishlists", { method: "POST", body });
export const updateWishlist = (id: string, body: ListInput) => apiFetch<Wishlist>(`/wishlists/${id}`, { method: "PATCH", body });
export const removeWishlist = (id: string) => apiFetch<{ removed: boolean }>(`/wishlists/${id}`, { method: "DELETE" });

export const listItems = (id: string, params: Record<string, string | number | undefined | null>) => apiFetch<ItemsPage>(`${root(id)}/items${qs(params)}`);
export const listCategories = (id: string) => apiFetch<string[]>(`${root(id)}/categories`);
export const addItems = (id: string, items: NewItem[]) => apiFetch<{ items: WishItem[] }>(`${root(id)}/items`, { method: "POST", body: { items } });
export const updateItem = (id: string, itemId: string, body: Record<string, unknown>) => apiFetch<WishItem>(`${root(id)}/items/${itemId}`, { method: "PATCH", body });
export const markGotten = (id: string, body: GotInput) => apiFetch<{ items: WishItem[]; skipped: { itemId: string; reason: string }[] }>(`${root(id)}/items/gotten`, { method: "POST", body });
export const unmarkGotten = (id: string, itemId: string) => apiFetch<WishItem>(`${root(id)}/items/${itemId}/ungot`, { method: "POST" });
export const removeItem = (id: string, itemId: string) => apiFetch<WishItem>(`${root(id)}/items/${itemId}`, { method: "DELETE" });
export const restoreItem = (id: string, itemId: string) => apiFetch<WishItem>(`${root(id)}/items/${itemId}/restore`, { method: "POST" });
export const getSummary = (id: string) => apiFetch<WishSummary>(`${root(id)}/summary`);
export const getActivity = (id: string, page: number) => apiFetch<Paged<WishEvent>>(`${root(id)}/activity${qs({ page, pageSize: 30 })}`);

/** Several items typed or pasted as lines ("Rice, 3, 150" = name, quantity, price in Leones). */
export function parseLines(text: string): { name: string; quantity?: number; priceText?: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((line) => {
      const [name = "", q, p] = line.split(/\s*[,;\t|]\s*/);
      const quantity = q && /^\d+$/.test(q) ? Number(q) : undefined;
      return { name: name.trim().slice(0, 200), quantity, priceText: p };
    })
    .filter((row) => row.name);
}

// ---- sharing

export type ShareLevel = "read" | "write";
export type ShareStatus = "active" | "expired" | "revoked";

export interface WishShare {
  id: string;
  label: string;
  email: string | null;
  level: ShareLevel;
  status: ShareStatus;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
  /** The private link, only while it works. */
  url: string | null;
}

export interface ShareInput {
  label: string;
  email?: string | null;
  level: ShareLevel;
  expiresInDays?: number | null;
  sendEmail?: boolean;
}

export interface SharedView {
  wishlist: Wishlist;
  sharedBy: string;
  you: string;
  access: { level: ShareLevel; canWrite: boolean };
}

export const shareKeys = {
  shares: (id: string) => ["wishlists", "shares", id] as const,
  shared: (token: string) => ["wishlists", "shared", token] as const,
};

export const listShares = (id: string) => apiFetch<WishShare[]>(`/wishlists/${id}/shares`);
export const createShare = (id: string, body: ShareInput) => apiFetch<WishShare & { emailed: boolean }>(`/wishlists/${id}/shares`, { method: "POST", body });
export const updateShare = (id: string, shareId: string, body: { label?: string; level?: ShareLevel; expiresInDays?: number | null }) =>
  apiFetch<WishShare>(`/wishlists/${id}/shares/${shareId}`, { method: "PATCH", body });
export const revokeShare = (id: string, shareId: string) => apiFetch<WishShare>(`/wishlists/${id}/shares/${shareId}`, { method: "DELETE" });
export const resetShare = (id: string, shareId: string) => apiFetch<WishShare>(`/wishlists/${id}/shares/${shareId}/reset`, { method: "POST" });
export const emailShare = (id: string, shareId: string) => apiFetch<{ sent: boolean }>(`/wishlists/${id}/shares/${shareId}/email`, { method: "POST" });
export const getSharedView = (token: string) => apiFetch<SharedView>(`/public/wish/${token}`);
