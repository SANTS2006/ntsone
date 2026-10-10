import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, Banknote, CheckCircle2, Clock, Coins, Globe2, Landmark, Mic, ScrollText, ShieldAlert, TrendingDown, TrendingUp, Users2, Wallet } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PaymentBadge } from "../payments/PaymentBadge";
import { RegistrationTrendChart } from "../analytics/charts";
import { CATEGORICAL_LIGHT } from "../analytics/palette";
import type { TrendPoint } from "../analytics/api";

export interface PaymentInsights {
  currency: string;
  created: number;
  completed: number;
  pending: number;
  review: number;
  failed: number;
  successRate: number | null;
  collectedMinor: number;
  todayMinor: number;
  weekMinor: number;
  waitingMinor: number;
  averageMinor: number;
  platformFeesMinor: number | null;
  balances: { totalMinor: number; availableMinor: number; pendingMinor: number } | null;
  trend: TrendPoint[];
  topPrograms: { id: string; name: string; kind: string; businessId: string | null; payments: number; collectedMinor: number }[];
  recent: {
    id: string;
    programId: string;
    programName: string;
    kind: string;
    businessId: string | null;
    registrationId: string | null;
    payer: string | null;
    amountMinor: number;
    status: string;
    createdAt: string;
  }[];
}

export interface BooksInsights {
  currency: string;
  businesses: number;
  monthRevenueMinor: number;
  monthCostsMinor: number;
  monthProfitMinor: number;
  owedToYouMinor: number;
  youOweMinor: number;
  openLoans: number;
  overdueLoans: number;
  newVoiceNotes: number;
  trend: { date: string; revenueMinor: number; costsMinor: number }[];
  top: { id: string; name: string; currency: string; revenueMinor: number; costsMinor: number; profitMinor: number; entries: number }[];
}

export interface AuditInsights {
  total: number;
  today: number;
  week: number;
  problemsWeek: number;
  accountsWeek: number;
  visitorsWeek: number;
  trend: TrendPoint[];
  busiest: { tenantId: string | null; name: string; events: number; problems: number }[];
  recentProblems: { id: string; createdAt: string; label: string | null; action: string; outcome: "failed" | "denied"; actorName: string | null; actorType: string; tenantName: string | null }[];
}

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function SectionTitle({ title, description, to, linkLabel }: { title: string; description: string; to?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {to && linkLabel && (
        <Link to={to} className="text-sm font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * A card that tilts in 3D to follow the pointer, with layers floating at different depths.
 * Stays flat for people who prefer less motion, and on touch screens.
 */
export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * 9).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg)`;
    el.style.setProperty("--shine-x", `${((x + 0.5) * 100).toFixed(0)}%`);
    el.style.setProperty("--shine-y", `${((y + 0.5) * 100).toFixed(0)}%`);
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  };
  return (
    <div className="[perspective:900px]" onPointerMove={move} onPointerLeave={leave}>
      <div ref={ref} className={cn("relative transition-transform duration-200 ease-out [transform-style:preserve-3d] motion-reduce:transition-none", className)}>
        {children}
      </div>
    </div>
  );
}

/** A floating gold-coin disc used for decoration inside the money card. */
function Coin({ className, depth }: { className?: string; depth: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute rounded-full border border-white/30 bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-[0_8px_20px_rgba(0,0,0,0.35),inset_0_2px_4px_rgba(255,255,255,0.6)]", className)}
      style={{ transform: `translateZ(${depth}px)` }}
    >
      <span className="absolute inset-[18%] rounded-full border border-amber-700/30" />
    </span>
  );
}

function MoneyHero({ data }: { data: PaymentInsights }) {
  const fund = data.balances;
  return (
    <TiltCard className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(120%_120%_at_0%_0%,#1d4ed8_0%,#0f2a6b_45%,#071433_100%)] p-6 text-white shadow-2xl shadow-blue-900/30 sm:p-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70 mix-blend-soft-light"
        style={{ background: "radial-gradient(420px circle at var(--shine-x, 30%) var(--shine-y, 20%), rgba(255,255,255,0.55), transparent 60%)" }}
      />
      <Coin className="-right-6 -top-6 h-28 w-28 opacity-90" depth={50} />
      <Coin className="right-24 top-16 h-14 w-14 opacity-80" depth={80} />
      <Coin className="-bottom-8 right-10 h-20 w-20 opacity-90" depth={30} />
      <div className="relative [transform:translateZ(40px)]">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-blue-100/80">
          <Landmark className="h-4 w-4" aria-hidden="true" /> Money collected
        </p>
        <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{formatMinor(data.collectedMinor, data.currency)}</p>
        <p className="mt-1 text-sm text-blue-100/80">
          {data.completed.toLocaleString()} paid {data.completed === 1 ? "payment" : "payments"}
          {data.successRate !== null ? ` · ${data.successRate}% of started payments finished` : ""}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Today", value: formatMinor(data.todayMinor, data.currency) },
            { label: "Last 7 days", value: formatMinor(data.weekMinor, data.currency) },
            fund ? { label: "Ready to withdraw", value: formatMinor(fund.availableMinor, data.currency) } : { label: "Average payment", value: formatMinor(data.averageMinor, data.currency) },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm [transform:translateZ(20px)]">
              <p className="text-xs text-blue-100/75">{item.label}</p>
              <p className="mt-0.5 text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </TiltCard>
  );
}

export function PaymentsSection({ data }: { data: PaymentInsights }) {
  // Nothing to show until a program or order form takes payments.
  if (data.created === 0) return null;
  const fund = data.balances;
  return (
    <>
      <SectionTitle title="Payments" description="Money paid for registrations, ID cards, tickets and orders." to={fund ? "/admin/funds" : undefined} linkLabel={fund ? "Payment fund" : undefined} />
      <MoneyHero data={data} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Paid" value={data.completed.toLocaleString()} icon={CheckCircle2} />
        <StatCard label="Awaiting payment" value={data.pending.toLocaleString()} icon={Clock} />
        <StatCard label="Need a look" value={data.review.toLocaleString()} icon={AlertTriangle} />
        <StatCard label="Failed or expired" value={data.failed.toLocaleString()} icon={ShieldAlert} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Average payment" value={formatMinor(data.averageMinor, data.currency)} icon={Coins} />
        <StatCard label="Waiting to be paid" value={formatMinor(data.waitingMinor, data.currency)} icon={Banknote} />
        {fund ? (
          <>
            <StatCard label="Available" value={formatMinor(fund.availableMinor, data.currency)} icon={Wallet} />
            <StatCard label="On hold" value={formatMinor(fund.pendingMinor, data.currency)} icon={Clock} />
          </>
        ) : (
          <StatCard label="Started" value={data.created.toLocaleString()} icon={Users2} />
        )}
        {data.platformFeesMinor !== null && <StatCard label="Platform fees earned" value={formatMinor(data.platformFeesMinor, data.currency)} icon={Landmark} />}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Money collected in the last 30 days</CardTitle>
            <CardDescription>Whole Leones (NLe) paid each day</CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationTrendChart data={data.trend} name="Collected (NLe)" color={CATEGORICAL_LIGHT[1]!} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top earners</CardTitle>
            <CardDescription>Programs and order forms by money collected</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/70">
            {data.topPrograms.length === 0 && <p className="text-sm text-muted-foreground">No paid payments yet.</p>}
            {data.topPrograms.map((program) => (
              <Link
                key={program.id}
                to={program.kind === "poll" ? `/admin/polls/${program.id}/payments` : program.businessId ? `/admin/businesses/${program.businessId}` : `/admin/programs/${program.id}/payments`}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{program.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {program.payments} paid · {program.kind === "order_form" ? "Order form" : program.kind === "poll" ? "Voting poll" : "Registration"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold">{formatMinor(program.collectedMinor, data.currency)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      {data.recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest payments</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/70">
            {data.recent.map((payment) => (
              <Link
                key={payment.id}
                to={payment.kind === "poll" ? `/admin/polls/${payment.programId}/payments` : payment.businessId ? `/admin/businesses/${payment.businessId}/orders/${payment.registrationId}` : `/admin/programs/${payment.programId}/registrations/${payment.registrationId}`}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{payment.payer ?? "Someone"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {payment.programName} · {timeAgo(payment.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold">{formatMinor(payment.amountMinor, data.currency)}</span>
                  <PaymentBadge status={payment.status} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function AuditSection({ data }: { data: AuditInsights }) {
  const peak = Math.max(1, ...data.busiest.map((a) => a.events));
  return (
    <>
      <SectionTitle title="Audit log" description="Everything that happened across every account. Only you can see this." to="/admin/audit" linkLabel="Open the audit log" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Events today" value={data.today.toLocaleString()} icon={ScrollText} />
        <StatCard label="Events this week" value={data.week.toLocaleString()} icon={ScrollText} />
        <StatCard label="Active accounts this week" value={data.accountsWeek.toLocaleString()} icon={Users2} />
        <StatCard label="Failed or refused this week" value={data.problemsWeek.toLocaleString()} icon={ShieldAlert} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Activity in the last 30 days</CardTitle>
            <CardDescription>
              {data.total.toLocaleString()} events recorded in total · {data.visitorsWeek.toLocaleString()} from visitors and voters this week
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationTrendChart data={data.trend} name="Events" color={CATEGORICAL_LIGHT[5] ?? CATEGORICAL_LIGHT[0]!} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Busiest accounts</CardTitle>
            <CardDescription>This week</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.busiest.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            {data.busiest.map((account) => (
              <div key={account.tenantId ?? "none"} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                    {account.tenantId ? null : <Globe2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="truncate">{account.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{account.events.toLocaleString()}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${Math.max(4, (account.events / peak) * 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      {data.recentProblems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest failed or refused attempts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/70">
            {data.recentProblems.map((row) => (
              <Link key={row.id} to="/admin/audit" className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.label ?? row.action}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.actorName ?? (row.actorType === "visitor" ? "Visitor" : row.actorType)} · {row.tenantName ?? "No account"} · {timeAgo(row.createdAt)}
                  </p>
                </div>
                <Badge variant="secondary" className={row.outcome === "denied" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-destructive/15 text-destructive"}>
                  {row.outcome === "denied" ? "Refused" : "Failed"}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Bookkeeping across the businesses a person can see: this month's profit, what is owed, loans and voice notes waiting. */
export function BooksSection({ data }: { data: BooksInsights }) {
  const good = data.monthProfitMinor >= 0;
  const money = (minor: number) => formatMinor(minor, data.currency);
  return (
    <>
      <SectionTitle title="Bookkeeping" description="Sales, expenses, profit, credit and loans for your businesses this month." to="/admin/businesses" linkLabel="Open a business's book" />
      <TiltCard
        className={cn(
          "overflow-hidden rounded-3xl border border-white/10 p-6 text-white shadow-2xl sm:p-8",
          good ? "bg-[radial-gradient(120%_120%_at_0%_0%,#059669_0%,#0b5f4a_45%,#052e2b_100%)] shadow-emerald-900/30" : "bg-[radial-gradient(120%_120%_at_0%_0%,#e11d48_0%,#9f1239_45%,#4c0519_100%)] shadow-rose-900/30",
        )}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light" style={{ background: "radial-gradient(420px circle at var(--shine-x, 30%) var(--shine-y, 20%), rgba(255,255,255,0.5), transparent 60%)" }} />
        <div className="relative [transform:translateZ(30px)]">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/80">
            {good ? <TrendingUp className="h-4 w-4" aria-hidden="true" /> : <TrendingDown className="h-4 w-4" aria-hidden="true" />}
            {good ? "Profit" : "Loss"} this month
          </p>
          <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{money(Math.abs(data.monthProfitMinor))}</p>
          <p className="mt-1 text-sm text-white/80">
            Earned {money(data.monthRevenueMinor)} · stock and expenses cost {money(data.monthCostsMinor)} · {data.businesses} {data.businesses === 1 ? "business" : "businesses"}
          </p>
        </div>
      </TiltCard>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="People owe you" value={money(data.owedToYouMinor)} icon={Wallet} />
        <StatCard label="You owe" value={money(data.youOweMinor)} icon={Banknote} />
        <StatCard label="Open loans" value={data.openLoans.toLocaleString()} icon={Coins} />
        <StatCard label="Overdue loans" value={data.overdueLoans.toLocaleString()} icon={AlertTriangle} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Money earned in the last 30 days</CardTitle>
            <CardDescription>Whole units of {data.currency === "SLE" ? "NLe" : data.currency} from sales and other income</CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationTrendChart data={data.trend.map((p) => ({ date: p.date, count: Math.round(p.revenueMinor / 100) }))} name="Earned" color={CATEGORICAL_LIGHT[2]!} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your businesses</CardTitle>
            <CardDescription>Profit or loss this month</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/70">
            {data.top.map((b) => (
              <Link key={b.id} to={`/admin/businesses/${b.id}/books`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <BookOpen className="mr-1 inline h-3 w-3" aria-hidden="true" />
                    {b.entries.toLocaleString()} {b.entries === 1 ? "entry" : "entries"}
                  </p>
                </div>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", b.profitMinor >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatMinor(b.profitMinor, b.currency)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      {data.newVoiceNotes > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mic className="h-4 w-4 text-primary" aria-hidden="true" />
          {data.newVoiceNotes} voice {data.newVoiceNotes === 1 ? "note is" : "notes are"} waiting to be written in a book.
        </p>
      )}
    </>
  );
}
