import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { listCategories, listItems, removeItem, restoreItem, root, wishKeys, type WishItem } from "./api";
import { AddItemsDialog, EditItemDialog, GotDialog } from "./dialogs";
import { useWishlistContext } from "./WishlistLayout";
import { EmptyState, money, PriorityBadge } from "./ui";

/** Hook: a search box value that only reaches the server after the person pauses typing. */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Everything still wished for. People tick items and press "I got these", or press "Got it" on one. */
export function WishItemsPage() {
  const { wishlist, canWrite } = useWishlistContext();
  // People with a view-only link (and everyone, on an archived list) see no buttons that change anything.
  const editable = canWrite && !wishlist.archived;
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [priority, setPriority] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [sort, setSort] = React.useState("priority");
  const [removedView, setRemovedView] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<WishItem | null>(null);
  const [got, setGot] = React.useState<WishItem[] | null>(null);
  const [selected, setSelected] = React.useState<Map<string, WishItem>>(new Map());
  const q = useDebounced(search.trim());

  const params = { status: removedView ? "removed" : "wished", search: q || undefined, priority: priority === "all" ? undefined : priority, category: category === "all" ? undefined : category, sort, page, pageSize: 50 };
  const items = useQuery({ queryKey: wishKeys.items(wishlist.id, params), queryFn: () => listItems(wishlist.id, params), placeholderData: (prev) => prev });
  const categories = useQuery({ queryKey: wishKeys.categories(wishlist.id), queryFn: () => listCategories(wishlist.id) });
  React.useEffect(() => setPage(1), [q, priority, category, sort, removedView]);
  React.useEffect(() => setSelected(new Map()), [removedView]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: wishKeys.all });
  const remove = useMutation({
    mutationFn: (id: string) => removeItem(wishlist.id, id),
    onSuccess: (_i, id) => {
      toast.success("Removed. You can bring it back from Show removed.");
      setSelected((m) => {
        const next = new Map(m);
        next.delete(id);
        return next;
      });
      void refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not remove the item"),
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreItem(wishlist.id, id),
    onSuccess: () => {
      toast.success("Item restored");
      void refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not restore the item"),
  });

  const rows = items.data?.items ?? [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (item: WishItem, on: boolean) =>
    setSelected((m) => {
      const next = new Map(m);
      if (on) next.set(item.id, item);
      else next.delete(item.id);
      return next;
    });
  const filtering = Boolean(q) || priority !== "all" || category !== "all";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add items
            </Button>
          )}
          {editable && selected.size > 0 && !removedView && (
            <Button variant="outline" onClick={() => setGot([...selected.values()])}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />I got these ({selected.size})
            </Button>
          )}
        </div>
        <ExportButtons path={`${root(wishlist.id)}/export`} params={{ status: "wished" }} fileLabel={`Wish list ${wishlist.name}`} />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_9rem_10rem_10rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search items" className="pl-9" placeholder="Search this list" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any category</SelectItem>
            <SelectItem value="__none__">No category</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Most important</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
            <SelectItem value="price_high">Price, high to low</SelectItem>
            <SelectItem value="price_low">Price, low to high</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {items.isLoading ? (
        <Loading label="Loading items" />
      ) : items.isError && !items.data ? (
        <EmptyState title="The items could not be loaded.">
          <Button size="sm" variant="outline" onClick={() => void items.refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={removedView ? "No removed items." : filtering ? "Nothing matches." : "Nothing on this list yet."}>
          {!removedView && !filtering && (editable ? <p>Press Add items to write down what you wish for. You can add many at once.</p> : <p>Nothing has been added to this list yet.</p>)}
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0">
            {!removedView && (
              <div className="flex items-center gap-3 border-b border-border/70 px-4 py-2.5 text-sm">
                {editable && (
                <Checkbox
                  aria-label="Select all items on this page"
                  checked={allOnPage}
                  onCheckedChange={(on) => setSelected((m) => {
                    const next = new Map(m);
                    for (const r of rows) {
                      if (on === true) next.set(r.id, r);
                      else next.delete(r.id);
                    }
                    return next;
                  })}
                />
                )}
                <span className="text-muted-foreground">
                  {items.data!.totals.count} item{items.data!.totals.count === 1 ? "" : "s"}
                  {items.data!.totals.proposedMinor > 0 ? `, expected ${money(items.data!.totals.proposedMinor)}` : ""}
                </span>
              </div>
            )}
            <ul className="divide-y divide-border/70">
              {rows.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {editable && !removedView && <Checkbox aria-label={`Select ${item.name}`} className="mt-1" checked={selected.has(item.id)} onCheckedChange={(on) => toggle(item, on === true)} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-medium">{item.name}</span>
                        <PriorityBadge priority={item.priority} />
                        {item.category && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.category}</span>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity > 1 ? `${item.quantity} ` : ""}
                        {item.unitPriceMinor !== null
                          ? item.quantity > 1
                            ? `at ${money(item.unitPriceMinor)} each = ${money(item.proposedTotalMinor)}`
                            : money(item.unitPriceMinor)
                          : item.quantity > 1
                            ? "(no price yet)"
                            : "No price yet"}
                      </p>
                      {item.notes && <p className="line-clamp-2 text-sm text-muted-foreground">{item.notes}</p>}
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          Open link
                        </a>
                      )}
                    </div>
                  </div>
                  <div className={cn("flex shrink-0 flex-wrap gap-1.5", removedView ? "" : "sm:justify-end")}>
                    {removedView ? (
                      <Button size="sm" variant="outline" loading={restore.isPending && restore.variables === item.id} onClick={() => restore.mutate(item.id)}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Restore
                      </Button>
                    ) : editable ? (
                      <>
                        <Button size="sm" onClick={() => setGot([item])}>
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Got it
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={`Edit ${item.name}`} onClick={() => setEditing(item)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={`Remove ${item.name}`} loading={remove.isPending && remove.variables === item.id} onClick={() => remove.mutate(item.id)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {items.data && items.data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {items.data.page} of {items.data.totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= items.data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {editable && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setRemovedView((v) => !v)}>
            {removedView ? "Back to the wish list" : "Show removed items"}
          </Button>
        </div>
      )}

      {adding && <AddItemsDialog wishlistId={wishlist.id} categories={categories.data ?? []} onClose={() => setAdding(false)} />}
      {editing && <EditItemDialog wishlistId={wishlist.id} item={editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />}
      {got && (
        <GotDialog
          wishlistId={wishlist.id}
          items={got}
          onClose={() => {
            setGot(null);
            setSelected(new Map());
          }}
        />
      )}
    </div>
  );
}
