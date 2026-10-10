import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarClock, FileText, Hourglass, ListOrdered, Receipt, ShoppingBag, Store, TrendingUp, Users2, Vote } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { RegistrationTrendChart } from "../analytics/charts";
import { CATEGORICAL_LIGHT } from "../analytics/palette";
import type { TrendPoint } from "../analytics/api";
import { AuditSection, BooksSection, PaymentsSection, type AuditInsights, type BooksInsights, type PaymentInsights } from "./PaymentSections";

interface MoneyRow {
  currency: string;
  count: number;
  total: number;
  paid: number;
}

export interface ModuleInsights {
  payments: PaymentInsights;
  /** Only for the platform team. */
  audit: AuditInsights | null;
  /** Bookkeeping, once a business has used its book. */
  books: BooksInsights | null;
  polls: {
    total: number;
    open: number;
    draft: number;
    closed: number;
    peopleVoted: number;
    votesCast: number;
    votesThisWeek: number;
    votesToday: number;
    trend: TrendPoint[];
    top: {
      id: string;
      name: string;
      slug: string;
      imageUrl: string | null;
      state: "draft" | "open" | "closed";
      closesAt: string | null;
      positions: number;
      voters: number;
      votes: number;
    }[];
  };
  businesses: {
    total: number;
    orders: { total: number; thisWeek: number; today: number; new: number; inProgress: number };
    invoices: { count: number; money: MoneyRow[] };
    receipts: { count: number; money: MoneyRow[] };
    trend: TrendPoint[];
    top: { id: string; name: string; logoUrl: string | null; orders: number; invoices: number; receipts: number }[];
    recentOrders: {
      id: string;
      businessId: string;
      businessName: string;
      customer: string | null;
      orderNumber: string;
      status: string;
      statusLabel: string;
      submittedAt: string;
    }[];
  };
}

export const getDashboardModules = () => apiFetch<ModuleInsights>("/dashboard/modules");

const STATE_TONE = { open: "success", draft: "secondary", closed: "warning" } as const;
const STATE_LABEL = { open: "Open", draft: "Draft", closed: "Closed" } as const;

const formatAmount = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
};

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function SectionTitle({ title, description, to, linkLabel }: { title: string; description: string; to: string; linkLabel: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Link to={to} className="text-sm font-medium text-primary hover:underline">
        {linkLabel}
      </Link>
    </div>
  );
}

function Thumb({ src, fallback: Fallback }: { src: string | null; fallback: typeof Vote }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-brand-soft">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Fallback className="h-5 w-5 text-primary/60" aria-hidden="true" />}
    </span>
  );
}

function PollsSection({ data }: { data: ModuleInsights["polls"] }) {
  return (
    <>
      <SectionTitle title="Voting polls" description="Elections and votes, with live turnout." to="/admin/polls" linkLabel="All polls" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Polls" value={data.total} icon={Vote} />
        <StatCard label="Open for voting" value={data.open} icon={CalendarClock} />
        <StatCard label="People who voted" value={data.peopleVoted} icon={Users2} />
        <StatCard label="Votes cast" value={data.votesCast} icon={ListOrdered} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Votes in the last 30 days</CardTitle>
            <CardDescription>
              {data.votesToday} today &middot; {data.votesThisWeek} this week
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationTrendChart data={data.trend} name="Votes" color={CATEGORICAL_LIGHT[3]!} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your polls</CardTitle>
            <CardDescription>
              {data.open} open &middot; {data.draft} draft &middot; {data.closed} closed
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/70">
            {data.top.length === 0 && <p className="text-sm text-muted-foreground">No polls yet. Create one to run your first vote.</p>}
            {data.top.map((poll) => (
              <Link key={poll.id} to={`/admin/polls/${poll.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80">
                <Thumb src={poll.imageUrl} fallback={Vote} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{poll.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {poll.positions} position{poll.positions === 1 ? "" : "s"} &middot; {poll.voters} voted
                  </p>
                </div>
                <Badge variant={STATE_TONE[poll.state]}>{STATE_LABEL[poll.state]}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function BusinessesSection({ data }: { data: ModuleInsights["businesses"] }) {
  const invoiced = data.invoices.money;
  return (
    <>
      <SectionTitle title="Businesses" description="Orders, invoices, and receipts for each business." to="/admin/businesses" linkLabel="All businesses" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Businesses" value={data.total} icon={Store} />
        <StatCard label="Orders" value={data.orders.total} icon={ShoppingBag} />
        <StatCard label="New orders" value={data.orders.new} icon={Hourglass} />
        <StatCard label="Orders this week" value={data.orders.thisWeek} icon={TrendingUp} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Orders in progress" value={data.orders.inProgress} icon={Building2} />
        <StatCard label="Invoices" value={data.invoices.count} icon={FileText} />
        <StatCard label="Receipts" value={data.receipts.count} icon={Receipt} />
        <StatCard
          label="Invoiced"
          value={invoiced.length ? invoiced.map((r) => formatAmount(r.total, r.currency)).join(" + ") : "—"}
          icon={FileText}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Orders in the last 30 days</CardTitle>
            <CardDescription>
              {data.orders.today} today &middot; {data.orders.thisWeek} this week
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationTrendChart data={data.trend} name="Orders" color={CATEGORICAL_LIGHT[4]!} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your businesses</CardTitle>
            <CardDescription>Busiest first</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/70">
            {data.top.length === 0 && <p className="text-sm text-muted-foreground">No businesses yet. Add one to take orders and send invoices.</p>}
            {data.top.map((business) => (
              <Link key={business.id} to={`/admin/businesses/${business.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80">
                <Thumb src={business.logoUrl} fallback={Store} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{business.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {business.orders} orders &middot; {business.invoices} invoices &middot; {business.receipts} receipts
                  </p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      {data.recentOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest orders</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border/70">
            {data.recentOrders.map((order) => (
              <Link
                key={order.id}
                to={`/admin/businesses/${order.businessId}/orders/${order.id}`}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{order.customer ?? order.orderNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {order.businessName} &middot; {order.orderNumber} &middot; {timeAgo(order.submittedAt)}
                  </p>
                </div>
                <Badge variant="outline">{order.statusLabel}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Polls and businesses, shown on the dashboard beside programs. */
export function ModuleSections() {
  // Kept separate so the main dashboard numbers still appear if this part fails.
  const { data } = useQuery({ queryKey: ["dashboard-modules"], queryFn: getDashboardModules, refetchInterval: 60_000 });
  if (!data) return null;
  return (
    <>
      <PollsSection data={data.polls} />
      <BusinessesSection data={data.businesses} />
      <PaymentsSection data={data.payments} />
      {data.books && <BooksSection data={data.books} />}
      {data.audit && <AuditSection data={data.audit} />}
    </>
  );
}
