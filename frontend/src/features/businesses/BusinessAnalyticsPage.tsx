import { Loading } from "@/components/Loading";
import { useQuery } from "@tanstack/react-query";
import { ExportButtons } from "@/components/ExportButtons";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, type StatusDef } from "@designs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { StatusPieChart } from "../analytics/charts";
import { BooksAnalyticsSection } from "../bookkeeping/BooksAnalyticsSection";
import { ProgramAnalyticsPage } from "../programs/ProgramAnalyticsPage";
import { getBusinessAnalytics, type DocumentAnalytics } from "./api";
import { useBusinessOutletContext } from "./BusinessLayout";
import { statusLabel } from "./statuses";

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

function StatusTable({ data, currency, kind, defs }: { data: DocumentAnalytics; currency: string; kind: "invoice" | "receipt" | "quotation"; defs: StatusDef[] }) {
  if (data.count === 0) return <p className="text-sm text-muted-foreground">No {kind}s yet.</p>;
  return (
    <div className="max-w-full overflow-x-auto">
    <table className="w-full whitespace-nowrap text-sm">
      <thead>
        <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th scope="col" className="py-2 pr-3 font-medium">Status</th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">Count</th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">Share</th>
          <th scope="col" className="py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {data.byStatus.map((row) => (
          <tr key={row.status} className="border-b border-border/50 last:border-0">
            <th scope="row" className="py-2 pr-3 text-left font-medium">{statusLabel(defs, row.status)}</th>
            <td className="py-2 pr-3 text-right tabular-nums">{row.count}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{Math.round((row.count / data.count) * 100)}%</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(row.total, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/** Orders, invoices, and receipts for one business, with amounts in its currency. */
export function BusinessAnalyticsPage() {
  const { business, program } = useBusinessOutletContext();
  const { data, isLoading } = useQuery({ queryKey: ["business-analytics", business.id], queryFn: () => getBusinessAnalytics(business.id) });
  const money = (v: number) => formatMoney(v, business.currency);

  if (isLoading || !data) return <Loading label="Loading analysis" />;

  const monthly = data.invoices.byMonth.map((m, i) => ({
    month: monthLabel(m.month),
    Invoiced: m.total,
    Received: data.receipts.byMonth[i]?.total ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <ExportButtons path={`/businesses/${business.id}/analytics/export`} fileLabel={`${business.name} analysis`} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Orders" value={data.orders?.total ?? 0} />
        <StatCard label="Orders this month" value={data.orders?.thisMonth ?? 0} />
        <StatCard label="Invoiced" value={money(data.invoices.total)} />
        <StatCard label="Invoices paid" value={money(data.invoices.paid)} />
        <StatCard label="Outstanding" value={money(data.invoices.outstanding)} />
        <StatCard label="Receipts issued" value={money(data.receipts.total)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Invoiced and received, last 12 months</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={70} />
                <Tooltip formatter={(value: number) => money(value)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Invoiced" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Received" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders by status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.orders && data.orders.total > 0 ? (
              <StatusPieChart byStatus={data.orders.byStatus} labelFor={(status) => statusLabel(business.statusConfig.order, status)} />
            ) : (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoices</CardTitle>
            <CardDescription>{data.invoices.count} in total</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusTable data={data.invoices} currency={business.currency} kind="invoice" defs={business.statusConfig.invoice} />
          </CardContent>
        </Card>
        {data.quotations && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quotations</CardTitle>
              <CardDescription>{data.quotations.count} in total</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusTable data={data.quotations} currency={business.currency} kind="quotation" defs={business.statusConfig.quotation} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipts</CardTitle>
            <CardDescription>{data.receipts.count} in total</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusTable data={data.receipts} currency={business.currency} kind="receipt" defs={business.statusConfig.receipt} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top clients</CardTitle>
            <CardDescription>By amount invoiced</CardDescription>
          </CardHeader>
          <CardContent>
            {data.invoices.topClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <ol className="flex flex-col gap-2 text-sm">
                {data.invoices.topClients.map((c, i) => (
                  <li key={c.client} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                      {c.client}
                    </span>
                    <span className="shrink-0 tabular-nums">{money(c.total)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <BooksAnalyticsSection businessId={business.id} />

      {program && (
        <section aria-labelledby="order-answers" className="flex flex-col gap-3">
          <h2 id="order-answers" className="text-lg font-semibold">
            Orders and order form answers
          </h2>
          <ProgramAnalyticsPage />
        </section>
      )}
    </div>
  );
}
