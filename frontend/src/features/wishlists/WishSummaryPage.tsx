import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getSummary, wishKeys } from "./api";
import { useWishlistContext } from "./WishlistLayout";
import { BudgetBar, colorOf, EmptyState, money, PRIORITY_LABEL } from "./ui";

const monthName = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y!, (mo ?? 1) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

/** The numbers: how much is wished for and spent, against the budget, by category, month and priority. */
export function WishSummaryPage() {
  const { wishlist } = useWishlistContext();
  const { data: s, isLoading, isError, refetch } = useQuery({ queryKey: wishKeys.summary(wishlist.id), queryFn: () => getSummary(wishlist.id) });
  if (isLoading) return <Loading label="Loading the summary" />;
  if (isError || !s)
    return (
      <EmptyState title="The summary could not be loaded.">
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </EmptyState>
    );
  const bar = colorOf(wishlist.color).bar;
  const maxMonth = Math.max(1, ...s.byMonth.map((m) => m.spentMinor));
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.spentMinor + c.plannedMinor));
  const empty = s.wishedCount + s.gottenCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Still to get" value={String(s.wishedCount)} hint={s.unpricedCount ? `${s.unpricedCount} without a price` : undefined} />
        <Stat label="Expected cost of those" value={money(s.plannedMinor)} />
        <Stat label="Gotten" value={String(s.gottenCount)} hint={`${s.percentGotten}% of the list`} />
        <Stat label="Spent so far" value={money(s.spentMinor)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            {s.savedMinor > 0
              ? `You paid ${money(s.savedMinor)} less than expected on the items that had an expected price.`
              : s.savedMinor < 0
                ? `You paid ${money(-s.savedMinor)} more than expected on the items that had an expected price.`
                : "Items you got cost what you expected, or had no expected price."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>Items gotten</span>
              <span className="font-medium">{s.percentGotten}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Items gotten" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percentGotten}>
              <div className={cn("h-full", bar)} style={{ width: `${s.percentGotten}%` }} />
            </div>
          </div>
          {wishlist.budgetMinor !== null ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Budget</p>
              <BudgetBar budget={s.budget} color={wishlist.color} />
              {s.budget.state === "over" && <p className="text-sm text-destructive">Spent plus what is still wished for comes to {money(s.budget.spentMinor + s.budget.plannedMinor)}, which is {money(s.budget.overBudgetBy)} over the budget.</p>}
              {s.budget.state === "warning" && <p className="text-sm text-muted-foreground">You are close to the budget when the items still wished for are counted.</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Set a budget with Edit at the top to see how you stand against it.</p>
          )}
        </CardContent>
      </Card>

      {empty ? (
        <EmptyState title="Nothing to summarise yet.">
          <p>Add items to the list and mark them as gotten to see the breakdown.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By category</CardTitle>
              <CardDescription>Spent (solid) and still expected (light).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.byCategory.map((c) => (
                <div key={c.category ?? "none"} className="space-y-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">{c.category ?? "No category"}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {money(c.spentMinor)}
                      {c.plannedMinor > 0 ? ` + ${money(c.plannedMinor)} to go` : ""}
                    </span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full", bar)} style={{ width: `${(c.spentMinor / maxCat) * 100}%` }} />
                    <div className={cn("h-full opacity-40", bar)} style={{ width: `${(c.plannedMinor / maxCat) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Spending by month</CardTitle>
                <CardDescription>The last 12 months you got something.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.byMonth.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing gotten yet.</p>
                ) : (
                  s.byMonth.map((m) => (
                    <div key={m.month} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{monthName(m.month)}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full", bar)} style={{ width: `${(m.spentMinor / maxMonth) * 100}%` }} />
                      </div>
                      <span>{money(m.spentMinor)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Still to get, by priority</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.byPriority.map((p) => (
                  <div key={p.priority} className="flex justify-between text-sm">
                    <span>{PRIORITY_LABEL(p.priority)}</span>
                    <span className="text-muted-foreground">
                      {p.items} item{p.items === 1 ? "" : "s"}, {money(p.plannedMinor)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      {s.removedCount > 0 && <p className="text-center text-xs text-muted-foreground">{s.removedCount} removed item{s.removedCount === 1 ? " is" : "s are"} not counted. They are kept in the record.</p>}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-lg font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
