import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useParams } from "react-router-dom";
import { CalendarClock, Eye, Gift, Link2Off, Pencil, RefreshCw } from "lucide-react";
import { Loading } from "@/components/Loading";
import { LazyOutlet } from "@/components/PageLoading";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getSharedView, getSummary, sharedScope, shareKeys, wishKeys } from "./api";
import { BudgetBar, colorOf, dayText } from "./ui";

const tabs = [
  { to: "", label: "Wish list", end: true },
  { to: "gotten", label: "Gotten", end: false },
  { to: "summary", label: "Summary", end: false },
  { to: "activity", label: "Activity", end: false },
];

/**
 * A wish list opened from a private link, for someone with no account. It shows only that list, with the access the
 * owner chose (view, or view and edit). It uses the same screens as the owner, which hide what the link does not allow.
 */
export function SharedWishlistLayout() {
  const { token = "" } = useParams<{ token: string }>();
  const scope = sharedScope(token);
  const view = useQuery({ queryKey: shareKeys.shared(token), queryFn: () => getSharedView(token), retry: false, meta: { silent: true } });
  const summary = useQuery({ queryKey: wishKeys.summary(scope), queryFn: () => getSummary(scope), enabled: view.isSuccess, meta: { silent: true } });
  usePageMeta({ title: view.data ? `${view.data.wishlist.name} (shared)` : "Shared wish list", index: false });

  if (view.isLoading) return <Loading label="Opening the wish list" />;

  if (view.isError || !view.data) {
    const refused = view.error instanceof ApiError && view.error.statusCode < 500 && view.error.statusCode !== 0;
    return (
      <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card/80 p-8 text-center shadow-lg" role="alert">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Link2Off className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-bold">{refused ? "This link can not be opened" : "The wish list could not be loaded"}</h1>
        <p className="text-sm text-muted-foreground">{view.error instanceof ApiError ? view.error.message : "Please check your connection and try again."}</p>
        {refused ? (
          <LinkButton to="/" variant="outline">
            Go to the home page
          </LinkButton>
        ) : (
          <Button onClick={() => void view.refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        )}
      </div>
    );
  }

  const { wishlist, sharedBy, access } = view.data;
  const style = colorOf(wishlist.color);
  const scoped = { ...wishlist, id: scope };

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70">
        <div className={cn("h-1.5 w-full", style.bar)} />
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Gift className="h-4 w-4 text-primary" aria-hidden="true" />
            Shared with you by {sharedBy}
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
              {access.canWrite ? <Pencil className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
              {access.canWrite ? "You can view and edit" : "View only"}
            </span>
          </p>
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{wishlist.name}</h1>
          {wishlist.description && <p className="text-sm text-muted-foreground">{wishlist.description}</p>}
          {wishlist.targetDate && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              Wanted by {dayText(wishlist.targetDate)}
            </p>
          )}
          {summary.data && wishlist.budgetMinor !== null && <BudgetBar budget={summary.data.budget} color={wishlist.color} />}
        </div>
      </div>

      <nav aria-label="Wish list sections" className="-mx-1 flex gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-card/60 p-1.5 backdrop-blur-sm sm:mx-0">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/wish/${token}${tab.to ? `/${tab.to}` : ""}`}
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

      <LazyOutlet context={{ wishlist: scoped, canWrite: access.canWrite, shared: true }} />

      <p className="pb-2 text-center text-xs text-muted-foreground">
        Want to keep your own wish lists?{" "}
        <a href="/register" className="font-medium text-primary hover:underline">
          Create a free account
        </a>
      </p>
    </div>
  );
}
