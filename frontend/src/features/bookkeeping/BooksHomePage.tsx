import { Loading } from "@/components/Loading";
import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Coins, Hourglass, Landmark, Mic, TrendingDown, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { TiltCard } from "../dashboard/PaymentSections";
import { getSummary, listEntries, type Entry } from "./api";
import { EarnedSpentChart, CategoryBars } from "./BooksCharts";
import { useBooks } from "./BookkeepingLayout";
import { EntryDetailDialog } from "./EntryDetailDialog";
import { EntryDialog, type EntryDialogState } from "./EntryDialog";
import { dayLabel, KINDS, QUICK_KINDS } from "./kinds";
import { LoanDialog } from "./LoansPage";
import { ListenButton, VoiceCapture } from "./voice";

function monthName(from: string) {
  return new Date(`${from}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The first page of the books: how the month is going, big buttons to write things down, and what needs attention. */
export function BooksHomePage() {
  const { businessId, currency, canEdit, business } = useBooks();
  const [entryDialog, setEntryDialog] = React.useState<EntryDialogState | null>(null);
  const [loanDirection, setLoanDirection] = React.useState<"lent" | "borrowed" | null>(null);
  const [loanVoice, setLoanVoice] = React.useState<string | undefined>();
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const { data: summary } = useQuery({ queryKey: ["books", businessId, "summary"], queryFn: () => getSummary(businessId), refetchInterval: 30_000 });
  const { data: latest } = useQuery({ queryKey: ["books", businessId, "entries", "latest"], queryFn: () => listEntries(businessId, { pageSize: 6, status: "active" }), refetchInterval: 30_000 });

  if (!summary) return <Loading label="Opening your book" />;
  const profit = summary.profitMinor;
  const good = profit >= 0;
  const money = (minor: number) => formatMinor(minor, currency);

  const spoken = () =>
    `${business.name}. ${monthName(summary.period.from)}. You earned ${money(summary.revenueMinor)}. Your stock and expenses cost ${money(summary.costOfGoodsMinor + summary.expensesMinor)}. ` +
    `${good ? "Your profit is" : "You are making a loss of"} ${money(Math.abs(profit))}. You have ${money(summary.cashOnHandMinor)} in cash and mobile money. ` +
    `People owe you ${money(summary.owedToYouMinor)}. You owe ${money(summary.youOweMinor)}.` +
    (summary.overdueLoans > 0 ? ` ${summary.overdueLoans} loan${summary.overdueLoans === 1 ? " is" : "s are"} overdue.` : "");

  // The recording is kept as a voice note; it is written into the book from the Voice notes page.
  const afterVoice = () => setVoiceOpen(false);

  return (
    <div className="flex flex-col gap-6">
      <TiltCard className={cn("overflow-hidden rounded-3xl border border-white/10 p-6 text-white shadow-2xl sm:p-8", good ? "bg-[radial-gradient(120%_120%_at_0%_0%,#059669_0%,#0b5f4a_45%,#052e2b_100%)] shadow-emerald-900/30" : "bg-[radial-gradient(120%_120%_at_0%_0%,#e11d48_0%,#9f1239_45%,#4c0519_100%)] shadow-rose-900/30")}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light" style={{ background: "radial-gradient(420px circle at var(--shine-x, 30%) var(--shine-y, 20%), rgba(255,255,255,0.5), transparent 60%)" }} />
        <div className="relative flex flex-wrap items-start justify-between gap-4 [transform:translateZ(30px)]">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/80">
              {good ? <TrendingUp className="h-4 w-4" aria-hidden="true" /> : <TrendingDown className="h-4 w-4" aria-hidden="true" />}
              {good ? "Profit" : "Loss"} in {monthName(summary.period.from)}
            </p>
            <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{money(Math.abs(profit))}</p>
            <p className="mt-1 text-sm text-white/80">
              You earned {money(summary.revenueMinor)} and it cost {money(summary.costOfGoodsMinor + summary.expensesMinor)}.
            </p>
          </div>
          <ListenButton text={spoken} label="Read it to me" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
        </div>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-3 [transform:translateZ(20px)]">
          {[
            { label: "Cash and mobile money", value: money(summary.cashOnHandMinor) },
            { label: "People owe you", value: money(summary.owedToYouMinor) },
            { label: "You owe", value: money(summary.youOweMinor) },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-white/75">{item.label}</p>
              <p className="mt-0.5 text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </TiltCard>

      {canEdit && (
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold tracking-tight">What happened?</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {QUICK_KINDS.map((kind) => {
              const info = KINDS[kind];
              return (
                <button key={kind} type="button" onClick={() => setEntryDialog({ kind })} className={cn("group flex min-h-28 flex-col items-start justify-between gap-3 rounded-2xl bg-gradient-to-br p-4 text-left text-white shadow-md transition active:scale-[0.98] hover:shadow-lg", info.tone)}>
                  <info.icon className="h-7 w-7 drop-shadow transition-transform group-hover:scale-110" />
                  <span>
                    <span className="block text-base font-bold leading-tight">{info.title}</span>
                    <span className="block text-xs opacity-90">{info.hint}</span>
                  </span>
                </button>
              );
            })}
            {(["lent", "borrowed"] as const).map((direction) => (
              <button key={direction} type="button" onClick={() => { setLoanVoice(undefined); setLoanDirection(direction); }} className={cn("group flex min-h-28 flex-col items-start justify-between gap-3 rounded-2xl bg-gradient-to-br p-4 text-left text-white shadow-md transition active:scale-[0.98] hover:shadow-lg", direction === "lent" ? "from-blue-500 to-indigo-400" : "from-purple-500 to-pink-400")}>
                {direction === "lent" ? <Coins className="h-7 w-7 transition-transform group-hover:scale-110" /> : <Landmark className="h-7 w-7 transition-transform group-hover:scale-110" />}
                <span>
                  <span className="block text-base font-bold leading-tight">{direction === "lent" ? "I lent money" : "I borrowed money"}</span>
                  <span className="block text-xs opacity-90">{direction === "lent" ? "Someone must pay you back" : "You must pay it back"}</span>
                </span>
              </button>
            ))}
            <button type="button" onClick={() => setVoiceOpen(true)} className="group flex min-h-28 flex-col items-start justify-between gap-3 rounded-2xl bg-gradient-brand p-4 text-left text-white shadow-md transition active:scale-[0.98] hover:shadow-lg">
              <Mic className="h-7 w-7 transition-transform group-hover:scale-110" />
              <span>
                <span className="block text-base font-bold leading-tight">Say it with my voice</span>
                <span className="block text-xs opacity-90">Record it now, write it later</span>
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Money in this month" value={money(summary.moneyInMinor)} icon={ArrowDownLeft} />
        <StatCard label="Money out this month" value={money(summary.moneyOutMinor)} icon={ArrowUpRight} />
        <StatCard label="Open loans" value={summary.openLoans} icon={Coins} />
        <StatCard label="Waiting to be paid" value={summary.unpaidEntries} icon={Hourglass} />
      </div>

      {(summary.overdueLoans > 0 || summary.newVoiceNotes > 0 || summary.unpaidEntries > 0) && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Needs your attention
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {summary.overdueLoans > 0 && (
              <Link className="text-destructive hover:underline" to={`/admin/businesses/${businessId}/books/loans`}>
                {summary.overdueLoans} loan{summary.overdueLoans === 1 ? " is" : "s are"} overdue
              </Link>
            )}
            {summary.unpaidEntries > 0 && (
              <Link className="hover:underline" to={`/admin/businesses/${businessId}/books/reports?tab=debts`}>
                {summary.unpaidEntries} sale{summary.unpaidEntries === 1 ? "" : "s"} or bill{summary.unpaidEntries === 1 ? "" : "s"} not fully paid yet
              </Link>
            )}
            {summary.newVoiceNotes > 0 && (
              <Link className="hover:underline" to={`/admin/businesses/${businessId}/books/voice`}>
                {summary.newVoiceNotes} voice note{summary.newVoiceNotes === 1 ? "" : "s"} not written in the book yet
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Money earned and spent, last 30 days</CardTitle>
            <CardDescription>What you sold and what stock and expenses cost, day by day</CardDescription>
          </CardHeader>
          <CardContent>
            <EarnedSpentChart earned={summary.trend.revenue} spent={summary.trend.costs} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where the money went</CardTitle>
            <CardDescription>Biggest expenses this month</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBars rows={summary.topExpenses} currency={currency} tone="#eb6834" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Latest entries</CardTitle>
          <Link to={`/admin/businesses/${businessId}/books/ledger`} className="text-sm font-medium text-primary hover:underline">
            See all
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/70">
          {latest?.items.length === 0 && <p className="text-sm text-muted-foreground">Nothing written yet. Press one of the big buttons above to start your book.</p>}
          {latest?.items.map((entry: Entry) => {
            const info = KINDS[entry.kind];
            return (
              <button key={entry.id} type="button" onClick={() => setDetailId(entry.id)} className="flex items-center gap-3 py-2.5 text-left first:pt-0 last:pb-0 hover:opacity-80">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", info.tone)}>
                  <info.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{entry.description ?? entry.category ?? info.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {dayLabel(entry.entryDate)}
                    {entry.partyName ? ` · ${entry.partyName}` : ""}
                    {entry.outstandingMinor > 0 ? ` · ${formatMinor(entry.outstandingMinor, currency)} not paid yet` : ""}
                  </span>
                </span>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", entry.moneyIn ? "text-emerald-600" : "text-foreground")}>
                  {entry.moneyIn ? "+" : "-"}
                  {formatMinor(entry.amountMinor, currency)}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <EntryDialog businessId={businessId} currency={currency} state={entryDialog} onClose={() => setEntryDialog(null)} />
      <LoanDialog businessId={businessId} currency={currency} direction={loanDirection} voiceNoteId={loanVoice} onClose={() => setLoanDirection(null)} />
      <EntryDetailDialog businessId={businessId} currency={currency} entryId={detailId} canEdit={canEdit} onClose={() => setDetailId(null)} onEdit={(entry) => { setDetailId(null); setEntryDialog({ kind: entry.kind, entry }); }} />

      <Dialog open={voiceOpen} onOpenChange={setVoiceOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Say it with your voice</DialogTitle>
            <DialogDescription>Tell the book what happened. The recording is kept safe, and you or someone you trust can write it down later.</DialogDescription>
          </DialogHeader>
          <VoiceCapture businessId={businessId} onSaved={afterVoice} />
          <LinkButton to={`/admin/businesses/${businessId}/books/voice`} variant="outline">
            See all my voice notes
          </LinkButton>
        </DialogContent>
      </Dialog>
    </div>
  );
}
