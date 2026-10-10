import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ArrowLeft, CalendarClock, Pencil, Share2, Trash2 } from "lucide-react";
import { Loading } from "@/components/Loading";
import { LazyOutlet } from "@/components/PageLoading";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getSummary, getWishlist, removeWishlist, updateWishlist, wishKeys, type Wishlist } from "./api";
import { ConfirmDialog, ListFormDialog } from "./dialogs";
import { InviteDialog } from "./sharing";
import { BudgetBar, colorOf, dayText } from "./ui";

/** What the list screens know: the list, whether this person may change things, and whether it was opened by a shared link. */
export function useWishlistContext() {
  return useOutletContext<{ wishlist: Wishlist; canWrite: boolean; shared: boolean }>();
}

const tabs = [
  { to: "", label: "Wish list", end: true },
  { to: "gotten", label: "Gotten", end: false },
  { to: "summary", label: "Summary", end: false },
  { to: "activity", label: "Activity", end: false },
  // Only the owner sees this one.
  { to: "sharing", label: "Sharing", end: false },
];

export function WishlistLayout() {
  const { wishlistId } = useParams<{ wishlistId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: wishlist, isLoading, error } = useQuery({ queryKey: wishKeys.list(wishlistId ?? ""), queryFn: () => getWishlist(wishlistId!), enabled: !!wishlistId });
  const summary = useQuery({ queryKey: wishKeys.summary(wishlistId ?? ""), queryFn: () => getSummary(wishlistId!), enabled: !!wishlistId && !!wishlist });
  const [editing, setEditing] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  usePageMeta({ title: wishlist?.name ?? "Wish list" });

  const archive = useMutation({
    mutationFn: (archived: boolean) => updateWishlist(wishlistId!, { archived }),
    onSuccess: (_d, archived) => {
      toast.success(archived ? "Archived. You can find it under Archived." : "Moved back to your lists");
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not change the list"),
  });
  const remove = useMutation({
    mutationFn: () => removeWishlist(wishlistId!),
    onSuccess: () => {
      toast.success("Wish list removed");
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
      navigate("/admin/wishlists", { replace: true });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not remove the list"),
  });

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-muted-foreground">{error instanceof ApiError && error.statusCode === 404 ? "This wish list could not be found." : "This wish list could not be loaded."}</p>
        <LinkButton to="/admin/wishlists" variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Back to wish lists
        </LinkButton>
      </div>
    );
  }
  if (isLoading || !wishlist) return <Loading label="Loading wish list" />;
  const style = colorOf(wishlist.color);

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70">
        <div className={cn("h-1.5 w-full", style.bar)} />
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <LinkButton to="/admin/wishlists" variant="ghost" size="sm" className="-ml-3 mb-1">
                <ArrowLeft className="h-4 w-4" />
                All wish lists
              </LinkButton>
              <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{wishlist.name}</h1>
              {wishlist.description && <p className="mt-1 text-sm text-muted-foreground">{wishlist.description}</p>}
              {wishlist.archived && <p className="mt-1 text-sm font-medium text-muted-foreground">This list is archived.</p>}
              {wishlist.targetDate && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  Want it all by {dayText(wishlist.targetDate)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setInviting(true)}>
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Share
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              <Button variant="outline" size="sm" loading={archive.isPending} onClick={() => archive.mutate(!wishlist.archived)}>
                {wishlist.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                {wishlist.archived ? "Unarchive" : "Archive"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRemoving(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            </div>
          </div>
          {summary.data && wishlist.budgetMinor !== null && <BudgetBar budget={summary.data.budget} color={wishlist.color} />}
        </div>
      </div>

      <nav aria-label="Wish list sections" className="-mx-1 flex gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-card/60 p-1.5 backdrop-blur-sm sm:mx-0">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/admin/wishlists/${wishlist.id}${tab.to ? `/${tab.to}` : ""}`}
            end={tab.end}
            className={({ isActive }) =>
              cn("shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200", isActive ? "bg-gradient-brand text-white shadow-glow" : "text-muted-foreground hover:bg-gradient-brand-soft hover:text-primary")
            }
          >
            {tab.label}
            {tab.label === "Wish list" && summary.data ? ` (${summary.data.wishedCount})` : tab.label === "Gotten" && summary.data ? ` (${summary.data.gottenCount})` : ""}
          </NavLink>
        ))}
      </nav>

      <LazyOutlet context={{ wishlist, canWrite: true, shared: false }} />

      {editing && <ListFormDialog list={wishlist} onClose={() => setEditing(false)} />}
      {inviting && <InviteDialog wishlist={wishlist} onClose={() => setInviting(false)} />}
      {removing && (
        <ConfirmDialog
          title="Remove this wish list?"
          description="It disappears from your screens. A record of it and everything in it is kept."
          confirmLabel="Remove list"
          destructive
          busy={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setRemoving(false)}
        />
      )}
    </div>
  );
}
