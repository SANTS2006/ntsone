import { useQuery } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Coins, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getPaymentAnalytics, type PaymentAnalytics } from "./api";
import { RegistrationTrendChart } from "./charts";
import { CATEGORICAL_LIGHT } from "./palette";

const PROVIDER: Record<string, string> = { m17: "Orange Money", m18: "Africell Money", momo: "Mobile money", card: "Card", bank: "Bank transfer", wallet: "Wallet" };
const STATUS: Record<string, string> = { completed: "Paid", pending: "Awaiting payment", review: "Needs review", failed: "Failed", expired: "Expired", cancelled: "Cancelled" };
const PURPOSE: Record<string, string> = { registration: "Registration, ID cards and tickets", order: "Order items" };

/** A row with a bar showing its share of the biggest row. */
function Bars({ rows, empty }: { rows: { label: string; value: number; note: string }[]; empty: string }) {
  const peak = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{row.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{row.note}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${Math.max(3, (row.value / peak) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Registrations -> payments started -> payments finished, drawn as stacked slabs that narrow like a funnel.
 * The slab widths are real shares, so a drop between steps is visible at a glance.
 */
function Funnel({ data }: { data: PaymentAnalytics }) {
  const top = Math.max(1, data.registrations, data.created);
  const steps = [
    { label: "Registered", value: data.registrations, tone: "from-sky-400 to-blue-500" },
    { label: "Started paying", value: data.created, tone: "from-blue-500 to-indigo-600" },
    { label: "Paid", value: data.completed, tone: "from-emerald-400 to-emerald-600" },
  ];
  return (
    <div className="flex flex-col items-center gap-2 [perspective:700px]">
      {steps.map((step) => (
        <div
          key={step.label}
          className={cn("flex h-12 items-center justify-between rounded-xl bg-gradient-to-r px-4 text-sm font-medium text-white shadow-lg [transform:rotateX(14deg)]", step.tone)}
          style={{ width: `${Math.max(34, (step.value / top) * 100)}%` }}
        >
          <span className="truncate">{step.label}</span>
          <span className="tabular-nums">{step.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/** Money for one program or order form: what came in, how it was paid, and what sold. Hidden until a payment is started. */
export function PaymentAnalyticsSection({ programId }: { programId: string }) {
  const { data } = useQuery({ queryKey: ["analytics", programId, "payments"], queryFn: () => getPaymentAnalytics(programId) });
  if (!data || data.created === 0) return null;
  const money = (minor: number) => formatMinor(minor, data.currency);

  return (
    <section className="flex flex-col gap-6" aria-label="Payment analytics">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Payments</h2>
        <p className="text-sm text-muted-foreground">What was paid, how it was paid and what people bought.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Collected" value={money(data.collectedMinor)} icon={Banknote} />
        <StatCard label="Paid payments" value={data.completed.toLocaleString()} icon={CheckCircle2} />
        <StatCard label="Average payment" value={money(data.averageMinor)} icon={Coins} />
        <StatCard label="Finished payments" value={data.successRate === null ? "—" : `${data.successRate}%`} icon={TrendingUp} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Money collected in the last 30 days</CardTitle>
            <CardDescription>Whole Leones (NLe) paid each day · largest payment {money(data.largestMinor)}</CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationTrendChart data={data.trend} name="Collected (NLe)" color={CATEGORICAL_LIGHT[1]!} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">From registering to paying</CardTitle>
            <CardDescription>{money(data.waitingMinor)} still waiting to be paid</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel data={data} />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How people paid</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars
              empty="No paid payments yet."
              rows={data.byChannel.map((c) => ({ label: PROVIDER[c.provider] ?? c.provider, value: c.amountMinor, note: `${c.count} · ${money(c.amountMinor)}` }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What was bought</CardTitle>
            <CardDescription>Best sellers by money</CardDescription>
          </CardHeader>
          <CardContent>
            <Bars empty="Nothing sold yet." rows={data.items.map((i) => ({ label: i.name, value: i.amountMinor, note: `${i.quantity} × · ${money(i.amountMinor)}` }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment results</CardTitle>
            <CardDescription>{data.byPurpose.map((p) => `${PURPOSE[p.purpose] ?? p.purpose}: ${money(p.amountMinor)}`).join(" · ") || "Nothing paid yet"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Bars empty="No payments yet." rows={data.byStatus.map((s) => ({ label: STATUS[s.status] ?? s.status, value: s.count, note: `${s.count}` }))} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
