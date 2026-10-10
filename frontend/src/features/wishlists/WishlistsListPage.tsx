import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Archive, CalendarClock, Gift, Plus, RefreshCw } from "lucide-react";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { listWishlists, wishKeys } from "./api";
import { ListFormDialog } from "./dialogs";
import { BudgetBar, colorOf, dayText, EmptyState, money } from "./ui";

/** All of a person's wish lists, with how much is still wished for and how much has been spent. */
export function WishlistsListPage() {
  usePageMeta({ title: "Wish List" });
  const [archived, setArchived] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: wishKeys.lists(archived), queryFn: () => listWishlists(archived) });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Gift className="h-7 w-7 text-primary" aria-hidden="true" />
            Wish List
          </h1>
          <p className="text-sm text-muted-foreground">Write down what you want to buy or have. When you get it, mark it and record what you paid. Only you can see your lists.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New wish list
        </Button>
      </div>

      <div className="flex gap-1.5 rounded-xl border border-border/70 bg-card/60 p-1.5 sm:w-fit" role="tablist" aria-label="Which lists">
        {(
          [
            [false, "My lists"],
            [true, "Archived"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={archived === value}
            onClick={() => setArchived(value)}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-medium transition", archived === value ? "bg-gradient-brand text-white shadow-glow" : "text-muted-foreground hover:text-primary")}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading label="Loading your wish lists" />
      ) : isError || !data ? (
        <EmptyState title="Your wish lists could not be loaded.">
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </EmptyState>
      ) : (
        <>
          {data.totals.lists > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Still wished for" value={String(data.totals.wished)} />
              <Stat label="Expected cost of those" value={money(data.totals.planned)} />
              <Stat label="Gotten" value={String(data.totals.gotten)} />
              <Stat label="Spent so far" value={money(data.totals.spent)} />
            </div>
          )}
          {data.items.length === 0 ? (
            <EmptyState title={archived ? "No archived lists." : "You have no wish lists yet."}>
              {!archived && (
                <>
                  <p>Make a list for something you are saving for, such as a house, a wedding or equipment for your shop.</p>
                  <Button className="mt-3" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create your first list
                  </Button>
                </>
              )}
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((list) => {
                const style = colorOf(list.color);
                return (
                  <Link key={list.id} to={`/admin/wishlists/${list.id}`} className="group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Card className="h-full overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-glow">
                      <div className={cn("h-1.5 w-full", style.bar)} />
                      <CardContent className="flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="min-w-0 break-words text-lg font-semibold">{list.name}</h2>
                          {list.archived && <Archive className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Archived" />}
                        </div>
                        {list.description && <p className="line-clamp-2 text-sm text-muted-foreground">{list.description}</p>}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">To get</p>
                            <p className="font-medium">
                              {list.wishedCount} <span className="text-xs font-normal text-muted-foreground">({money(list.plannedMinor)})</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Gotten</p>
                            <p className="font-medium">
                              {list.gottenCount} <span className="text-xs font-normal text-muted-foreground">({money(list.spentMinor)})</span>
                            </p>
                          </div>
                        </div>
                        <BudgetBar budget={list.budget} color={list.color} compact />
                        {list.budget.state === "over" && <p className="text-xs font-medium text-destructive">Over budget by {money(list.budget.overBudgetBy)}</p>}
                        {list.targetDate && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                            Want it all by {dayText(list.targetDate)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
      {creating && <ListFormDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
