import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor } from "@/lib/money";
import { getProfitLoss, getSummary } from "./api";
import { CategoryBars, MonthlyChart } from "./BooksCharts";

const isoDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** The business's own books in its analytics: this year's profit, month by month, and where the money goes. Hidden until the book is used. */
export function BooksAnalyticsSection({ businessId }: { businessId: string }) {
  const now = new Date();
  const from = isoDay(new Date(now.getFullYear(), 0, 1));
  const to = isoDay(now);
  const { data: pl } = useQuery({ queryKey: ["books", businessId, "analytics", "pl", from, to], queryFn: () => getProfitLoss(businessId, { from, to }) });
  const { data: summary } = useQuery({ queryKey: ["books", businessId, "analytics", "summary"], queryFn: () => getSummary(businessId) });
  if (!pl || !summary) return null;
  if (pl.revenueMinor === 0 && pl.costOfGoodsMinor === 0 && pl.expensesMinor === 0 && summary.openLoans === 0) return null;
  const money = (minor: number) => formatMinor(minor, pl.currency);

  return (
    <section className="flex flex-col gap-6" aria-label="Bookkeeping analytics">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Bookkeeping</h2>
          <p className="text-sm text-muted-foreground">From the business&apos;s own book, this year so far.</p>
        </div>
        <Link to={`/admin/businesses/${businessId}/books/reports`} className="text-sm font-medium text-primary hover:underline">
          Open the reports
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Earned" value={money(pl.revenueMinor)} />
        <StatCard label="Stock and expenses" value={money(pl.costOfGoodsMinor + pl.expensesMinor)} />
        <StatCard label={pl.netProfitMinor >= 0 ? "Profit" : "Loss"} value={money(Math.abs(pl.netProfitMinor))} />
        <StatCard label="People owe you" value={money(summary.owedToYouMinor)} />
        <StatCard label="You owe" value={money(summary.youOweMinor)} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Earned and spent, month by month</CardTitle>
            <CardDescription>What you sold against what stock and expenses cost</CardDescription>
          </CardHeader>
          <CardContent>{pl.monthly.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : <MonthlyChart rows={pl.monthly.map((m) => ({ month: m.month, earned: m.revenueMinor, spent: m.costsMinor }))} currency={pl.currency} />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Biggest costs</CardTitle>
            <CardDescription>Stock and expenses this year</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBars rows={[...pl.costOfGoods, ...pl.expenses].sort((a, b) => b.totalMinor - a.totalMinor).slice(0, 8)} currency={pl.currency} tone="#eb6834" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
