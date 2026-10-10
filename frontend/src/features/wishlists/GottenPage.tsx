import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, RefreshCw, Search, Undo2 } from "lucide-react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { Loading } from "@/components/Loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { listCategories, listItems, unmarkGotten, root, wishKeys, type WishItem } from "./api";
import { ConfirmDialog, EditItemDialog } from "./dialogs";
import { useWishlistContext } from "./WishlistLayout";
import { useDebounced } from "./WishItemsPage";
import { dayText, EmptyState, money } from "./ui";

/** The gotten list: what was bought, what was paid, when and where. Filter by date, search, export, or move an item back. */
export function GottenPage() {
  const { wishlist, canWrite } = useWishlistContext();
  const editable = canWrite && !wishlist.archived;
  const queryClient = useQueryClient();
  const range = useDateRange();
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState("gotten_newest");
  const [page, setPage] = React.useState(1);
  const [editing, setEditing] = React.useState<WishItem | null>(null);
  const [undoing, setUndoing] = React.useState<WishItem | null>(null);
  const q = useDebounced(search.trim());
  const params = { status: "gotten", search: q || undefined, sort, from: range.fromDay || undefined, to: range.toDay || undefined, page, pageSize: 50 };
  const items = useQuery({ queryKey: wishKeys.items(wishlist.id, params), queryFn: () => listItems(wishlist.id, params), placeholderData: (prev) => prev });
  const categories = useQuery({ queryKey: wishKeys.categories(wishlist.id), queryFn: () => listCategories(wishlist.id) });
  React.useEffect(() => setPage(1), [q, sort, range.fromDay, range.toDay]);

  const undo = useMutation({
    mutationFn: (id: string) => unmarkGotten(wishlist.id, id),
    onSuccess: () => {
      toast.success("Moved back to the wish list. What you recorded is kept in the activity.");
      setUndoing(null);
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not move the item back"),
  });

  const rows = items.data?.items ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter range={range} label="Date gotten" />
        <ExportButtons path={`${root(wishlist.id)}/export`} params={{ status: "gotten" }} fileLabel={`Gotten ${wishlist.name}`} />
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search gotten items" className="pl-9" placeholder="Search what you got" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gotten_newest">Newest first</SelectItem>
            <SelectItem value="gotten_oldest">Oldest first</SelectItem>
            <SelectItem value="paid_high">Most paid first</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {items.isLoading ? (
        <Loading label="Loading gotten items" />
      ) : items.isError && !items.data ? (
        <EmptyState title="The gotten items could not be loaded.">
          <Button size="sm" variant="outline" onClick={() => void items.refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={q || range.active ? "Nothing matches." : "Nothing gotten yet."}>
          {!q && !range.active && <p>When you get something from your wish list, press Got it on the Wish list tab. It will appear here with the price and date.</p>}
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5 text-sm text-muted-foreground">
              <span>
                {items.data!.totals.count} item{items.data!.totals.count === 1 ? "" : "s"}
              </span>
              <span className="font-medium text-foreground">Total paid: {money(items.data!.totals.paidMinor)}</span>
            </div>
            <ul className="divide-y divide-border/70">
              {rows.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words font-medium">{item.name}</span>
                      {item.quantity > 1 && <span className="text-sm text-muted-foreground">x {item.quantity}</span>}
                      {item.savedMinor !== null && item.savedMinor !== 0 && (
                        <Badge variant={item.savedMinor > 0 ? "success" : "warning"}>{item.savedMinor > 0 ? `Saved ${money(item.savedMinor)}` : `${money(-item.savedMinor)} more than expected`}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Got on {dayText(item.gottenAt)}
                      {item.store ? ` from ${item.store}` : ""}
                      {item.proposedTotalMinor !== null ? `. Expected ${money(item.proposedTotalMinor)}` : ""}
                    </p>
                    {item.gottenNote && <p className="line-clamp-2 text-sm text-muted-foreground">{item.gottenNote}</p>}
                  </div>
                  <p className="shrink-0 text-base font-semibold sm:w-36 sm:text-right">{money(item.paidMinor)}</p>
                  {editable && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="icon" variant="ghost" aria-label={`Edit ${item.name}`} onClick={() => setEditing(item)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setUndoing(item)}>
                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                        Not gotten
                      </Button>
                    </div>
                  )}
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

      {editing && <EditItemDialog wishlistId={wishlist.id} item={editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />}
      {undoing && (
        <ConfirmDialog
          title="Move this back to the wish list?"
          description={`"${undoing.name}" will go back to your wish list. The price and date you recorded are removed from the totals but stay in the activity record.`}
          confirmLabel="Move back"
          busy={undo.isPending}
          onConfirm={() => undo.mutate(undoing.id)}
          onClose={() => setUndoing(null)}
        />
      )}
    </div>
  );
}
