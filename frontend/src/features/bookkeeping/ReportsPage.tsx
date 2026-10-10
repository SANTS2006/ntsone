import { Loading } from "@/components/Loading";
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getCashFlow, getDebts, getProfitLoss, reportExportPath } from "./api";
import { CategoryBars, MonthlyChart } from "./BooksCharts";
import { useBooks } from "./BookkeepingLayout";
import { dayLabel, methodLabel } from "./kinds";
import { ListenButton } from "./voice";

const isoDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const PRESETS = [
  { key: "month", label: "This month", range: () => { const n = new Date(); return [isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), isoDay(n)] as const; } },
  { key: "last", label: "Last month", range: () => { const n = new Date(); return [isoDay(new Date(n.getFullYear(), n.getMonth() - 1, 1)), isoDay(new Date(n.getFullYear(), n.getMonth(), 0))] as const; } },
  { key: "year", label: "This year", range: () => { const n = new Date(); return [isoDay(new Date(n.getFullYear(), 0, 1)), isoDay(n)] as const; } },
];

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", strong && "border-t border-border/70 pt-2 text-base font-semibold")}>
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn("shrink-0 tabular-nums", tone === "good" && "text-emerald-600", tone === "bad" && "text-rose-600")}>{value}</span>
    </div>
  );
}

function ProfitLossTab({ businessId, currency, from, to }: { businessId: string; currency: string; from?: string; to?: string }) {
  const { data } = useQuery({ queryKey: ["books", businessId, "pl", from, to], queryFn: () => getProfitLoss(businessId, { from, to }) });
  if (!data) return <Loading label="Working it out" />;
  const money = (minor: number) => formatMinor(minor, currency);
  const good = data.netProfitMinor >= 0;
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Profit and loss</CardTitle>
            <CardDescription>
              {dayLabel(data.period.from)} to {dayLabel(data.period.to)}
            </CardDescription>
          </div>
          <ListenButton text={`From ${dayLabel(data.period.from)} to ${dayLabel(data.period.to)} you earned ${money(data.revenueMinor)}. Stock cost ${money(data.costOfGoodsMinor)}. Expenses were ${money(data.expensesMinor)}. ${good ? "Your profit is" : "Your loss is"} ${money(Math.abs(data.netProfitMinor))}.`} />
        </CardHeader>
        <CardContent className="flex flex-col">
          <p className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money earned</p>
          {data.revenue.length === 0 && <p className="py-1 text-sm text-muted-foreground">Nothing yet.</p>}
          {data.revenue.map((r) => (
            <Row key={r.category} label={`${r.category} (${r.count})`} value={money(r.totalMinor)} />
          ))}
          <Row label="Total earned" value={money(data.revenueMinor)} strong />

          <p className="mt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stock you bought</p>
          {data.costOfGoods.length === 0 && <p className="py-1 text-sm text-muted-foreground">Nothing yet.</p>}
          {data.costOfGoods.map((r) => (
            <Row key={r.category} label={`${r.category} (${r.count})`} value={money(r.totalMinor)} />
          ))}
          <Row label="Profit before expenses" value={money(data.grossProfitMinor)} strong tone={data.grossProfitMinor >= 0 ? "good" : "bad"} />

          <p className="mt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expenses</p>
          {data.expenses.length === 0 && <p className="py-1 text-sm text-muted-foreground">Nothing yet.</p>}
          {data.expenses.map((r) => (
            <Row key={r.category} label={`${r.category} (${r.count})`} value={money(r.totalMinor)} />
          ))}
          <Row label="Total expenses" value={money(data.expensesMinor)} strong />

          <div className={cn("mt-4 flex items-baseline justify-between gap-4 rounded-xl p-4", good ? "bg-emerald-500/10" : "bg-rose-500/10")}>
            <span className="text-lg font-bold">{good ? "Profit" : "Loss"}</span>
            <span className={cn("text-2xl font-bold tabular-nums", good ? "text-emerald-600" : "text-rose-600")}>{money(Math.abs(data.netProfitMinor))}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Loans and the money you put in or take out are not counted as profit or loss.</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Month by month</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthly.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : <MonthlyChart rows={data.monthly.map((m) => ({ month: m.month, earned: m.revenueMinor, spent: m.costsMinor }))} currency={currency} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Biggest expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBars rows={[...data.costOfGoods, ...data.expenses].sort((a, b) => b.totalMinor - a.totalMinor).slice(0, 8)} currency={currency} tone="#eb6834" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CashFlowTab({ businessId, currency, from, to }: { businessId: string; currency: string; from?: string; to?: string }) {
  const { data } = useQuery({ queryKey: ["books", businessId, "cash", from, to], queryFn: () => getCashFlow(businessId, { from, to }) });
  if (!data) return <Loading label="Working it out" />;
  const money = (minor: number) => formatMinor(minor, currency);
  const ins = data.lines.filter((l) => l.moneyIn);
  const outs = data.lines.filter((l) => !l.moneyIn);
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Cash flow</CardTitle>
          <CardDescription>Money that really moved, not what is only promised. {dayLabel(data.period.from)} to {dayLabel(data.period.to)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          <Row label="Cash and mobile money at the start" value={money(data.openingMinor)} strong />
          <p className="mt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money in</p>
          {ins.length === 0 && <p className="py-1 text-sm text-muted-foreground">None.</p>}
          {ins.map((l) => (
            <Row key={l.kind} label={l.label} value={money(l.totalMinor)} tone="good" />
          ))}
          <Row label="Total in" value={money(data.moneyInMinor)} strong />
          <p className="mt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Money out</p>
          {outs.length === 0 && <p className="py-1 text-sm text-muted-foreground">None.</p>}
          {outs.map((l) => (
            <Row key={l.kind} label={l.label} value={money(l.totalMinor)} />
          ))}
          <Row label="Total out" value={money(data.moneyOutMinor)} strong />
          <div className="mt-4 flex items-baseline justify-between gap-4 rounded-xl bg-gradient-brand-soft p-4">
            <span className="text-lg font-bold">At the end</span>
            <span className="text-2xl font-bold tabular-nums">{money(data.closingMinor)}</span>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where your money is</CardTitle>
            <CardDescription>Up to {dayLabel(data.period.to)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {data.byMethod.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            {data.byMethod.map((m) => (
              <Row key={m.method} label={methodLabel(m.method)} value={money(m.balanceMinor)} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Month by month</CardTitle>
          </CardHeader>
          <CardContent>{data.monthly.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : <MonthlyChart rows={data.monthly.map((m) => ({ month: m.month, earned: m.moneyInMinor, spent: m.moneyOutMinor }))} currency={currency} />}</CardContent>
        </Card>
      </div>
    </div>
  );
}

function DebtsTab({ businessId, currency }: { businessId: string; currency: string }) {
  const { data } = useQuery({ queryKey: ["books", businessId, "debts"], queryFn: () => getDebts(businessId), refetchInterval: 30_000 });
  if (!data) return <Loading label="Working it out" />;
  const money = (minor: number) => formatMinor(minor, currency);
  const List = ({ title, total, rows, tone }: { title: string; total: number; rows: typeof data.owedToYou; tone: string }) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className={cn("text-xl font-bold", tone)}>{money(total)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border/70">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nobody.</p>}
        {rows.map((r) => (
          <div key={`${r.party}-${r.since}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.party}</p>
              <p className="truncate text-xs text-muted-foreground">
                since {dayLabel(r.since)} · {r.count} {r.count === 1 ? "entry" : "entries"}
                {r.phone ? (
                  <>
                    {" · "}
                    <a href={`tel:${r.phone}`} className="text-primary hover:underline">
                      {r.phone}
                    </a>
                  </>
                ) : (
                  ""
                )}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{money(r.owingMinor)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <List title="People who owe you (credit sales)" total={data.owedToYou.reduce((s, r) => s + r.owingMinor, 0)} rows={data.owedToYou} tone="text-emerald-600" />
        {data.lentLoans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loans you gave</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border/70">
              {data.lentLoans.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                  <span className="truncate font-medium">
                    {l.partyName}
                    {l.overdue ? " · overdue" : ""}
                  </span>
                  <span className="font-semibold tabular-nums">{money(l.balanceMinor)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-6">
        <List title="People you owe (bills and stock on credit)" total={data.youOwe.reduce((s, r) => s + r.owingMinor, 0)} rows={data.youOwe} tone="text-rose-600" />
        {data.borrowedLoans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loans you received</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border/70">
              {data.borrowedLoans.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                  <span className="truncate font-medium">
                    {l.partyName}
                    {l.overdue ? " · overdue" : ""}
                  </span>
                  <span className="font-semibold tabular-nums">{money(l.balanceMinor)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Profit and loss, cash flow, and who owes what, for any period. */
export function ReportsPage() {
  const { businessId, currency } = useBooks();
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") ?? "profit";
  const range = useDateRange();
  const [preset, setPreset] = React.useState("month");
  const [from, to] = React.useMemo(() => {
    if (range.fromDay || range.toDay) return [range.fromDay || undefined, range.toDay || undefined] as const;
    const p = PRESETS.find((x) => x.key === preset) ?? PRESETS[0]!;
    return p.range();
  }, [range.fromDay, range.toDay, preset]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setPreset(p.key);
              range.clear();
            }}
            aria-pressed={!range.active && preset === p.key}
            className={cn("rounded-full border px-3 py-1.5 text-sm", !range.active && preset === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border/70")}
          >
            {p.label}
          </button>
        ))}
        <DateRangeFilter range={range} label="Report" />
        <div className="ml-auto">
          <ExportButtons path={reportExportPath(businessId)} params={{ from, to }} fileLabel="Books report" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setSearch({ tab: value }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="profit">Profit and loss</TabsTrigger>
          <TabsTrigger value="cash">Cash flow</TabsTrigger>
          <TabsTrigger value="debts">Who owes what</TabsTrigger>
        </TabsList>
        <TabsContent value="profit">
          <ProfitLossTab businessId={businessId} currency={currency} from={from} to={to} />
        </TabsContent>
        <TabsContent value="cash">
          <CashFlowTab businessId={businessId} currency={currency} from={from} to={to} />
        </TabsContent>
        <TabsContent value="debts">
          <DebtsTab businessId={businessId} currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
