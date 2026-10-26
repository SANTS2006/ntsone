import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import { cn } from "@/lib/utils";
import { contributionKeys, getTracker, MONTH_NAMES, MONTH_SHORT, removePayment, setPayment, stamp, type CellStatus, type ContributionDetail, type Tracker, type TrackerMember } from "./api";
import { errorText, useRefresh } from "./RecordsTable";

const STATUS_STYLE: Record<CellStatus, string> = {
  paid: "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300",
  unpaid: "bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:text-rose-300",
  upcoming: "bg-muted/40 text-muted-foreground hover:bg-muted",
  na: "bg-transparent text-muted-foreground/40 hover:bg-muted/40",
};

const memberName = (m: { values: Record<string, string> }, fields: { id: string }[]) => fields.map((f) => m.values[f.id]).filter(Boolean).join(" · ") || "Contributor";

/** One year at a glance: every contributor against twelve months. Press a month to record, change or remove a payment. */
export function TrackerTab({ detail, canEdit }: { detail: ContributionDetail; canEdit: boolean }) {
  const [year, setYear] = React.useState<number | undefined>(undefined);
  const { data, isLoading, isError } = useQuery({ queryKey: contributionKeys.tracker(detail.id, year), queryFn: () => getTracker(detail.id, year) });
  const [picked, setPicked] = React.useState<{ member: TrackerMember; month: number } | null>(null);

  if (isLoading) return <Loading label="Loading the tracker" />;
  if (isError || !data) return <p role="alert" className="text-sm text-destructive">The tracker could not be loaded. Check your connection and refresh the page.</p>;
  const t: Tracker = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Choose the year">
          {t.years.map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={y === t.year}
              onClick={() => setYear(y)}
              className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium transition", y === t.year ? "border-transparent bg-gradient-brand text-white shadow-glow" : "border-border/70 text-muted-foreground hover:text-primary")}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {([["paid", "Paid"], ["partial", "Paid less than expected"], ["unpaid", "Not paid"], ["upcoming", "Not yet due"]] as const).map(([status, label]) => (
            <span key={status} className={cn("rounded-full px-2.5 py-1", STATUS_STYLE[status])}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Collected in {t.year}</p>
            <p className="mt-1 text-xl font-bold">{formatMinor(t.yearTotalMinor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Payments missing in {t.year}</p>
            <p className="mt-1 text-xl font-bold text-rose-600 dark:text-rose-300">{t.unpaidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Contributors</p>
            <p className="mt-1 text-xl font-bold">{t.members.length}</p>
          </CardContent>
        </Card>
      </div>

      {t.members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Add your contributors in the Contributors tab first. They will appear here.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/60">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-gradient-brand-soft text-left">
              <tr>
                <th className="sticky left-0 z-10 min-w-[10rem] bg-card px-3 py-2 font-semibold">Contributor</th>
                {MONTH_SHORT.map((m) => (
                  <th key={m} className="px-1 py-2 text-center font-semibold">
                    {m}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 text-right font-semibold">Missed</th>
              </tr>
            </thead>
            <tbody>
              {t.members.map((m) => (
                <tr key={m.id} className="border-t border-border/50">
                  <td className="sticky left-0 z-10 max-w-[14rem] truncate bg-card px-3 py-1.5 font-medium">{memberName(m, t.fields)}</td>
                  {m.cells.map((cell) => (
                    <td key={cell.month} className="p-0.5 text-center">
                      <button
                        type="button"
                        disabled={!canEdit || cell.status === "na"}
                        onClick={() => setPicked({ member: m, month: cell.month })}
                        title={cell.updatedAt ? `Entered ${stamp(cell.recordedAt)}${cell.updatedAt !== cell.recordedAt ? `, last changed ${stamp(cell.updatedAt)}` : ""}` : undefined}
                        aria-label={`${memberName(m, t.fields)}, ${MONTH_NAMES[cell.month - 1]} ${t.year}: ${cell.amountMinor !== null ? formatMinor(cell.amountMinor) : cell.status === "unpaid" ? "not paid" : cell.status === "upcoming" ? "not yet due" : "not applicable"}`}
                        className={cn("h-9 w-full min-w-[3.6rem] rounded-md px-1 text-xs font-medium transition", STATUS_STYLE[cell.status], !canEdit && "cursor-default")}
                      >
                        {cell.amountMinor !== null ? (cell.amountMinor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : cell.status === "unpaid" ? "Not paid" : cell.status === "upcoming" ? "–" : ""}
                      </button>
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-semibold">{formatMinor(m.totalMinor)}</td>
                  <td className={cn("px-3 py-1.5 text-right", m.unpaidMonths > 0 ? "font-semibold text-rose-600 dark:text-rose-300" : "text-muted-foreground")}>{m.unpaidMonths}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border bg-gradient-brand-soft font-semibold">
              <tr>
                <td className="sticky left-0 z-10 bg-card px-3 py-2">Collected</td>
                {t.monthTotals.map((mt) => (
                  <td key={mt.month} className="px-1 py-2 text-center text-xs">
                    {mt.collectedMinor > 0 ? (mt.collectedMinor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "–"}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">{formatMinor(t.yearTotalMinor)}</td>
                <td />
              </tr>
              <tr className="text-xs font-normal">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5">Paid / not paid</td>
                {t.monthTotals.map((mt) => (
                  <td key={mt.month} className="px-1 py-1.5 text-center">
                    {mt.paidCount + mt.partialCount} / <span className={mt.unpaidCount > 0 ? "text-rose-600 dark:text-rose-300" : ""}>{mt.unpaidCount}</span>
                  </td>
                ))}
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <PaymentDialog detail={detail} tracker={t} picked={picked} onClose={() => setPicked(null)} />
    </div>
  );
}

function PaymentDialog({ detail, tracker, picked, onClose }: { detail: ContributionDetail; tracker: Tracker; picked: { member: TrackerMember; month: number } | null; onClose: () => void }) {
  const refresh = useRefresh(detail.id);
  const cell = picked ? picked.member.cells[picked.month - 1]! : null;
  const [amount, setAmount] = React.useState("");
  const [problem, setProblem] = React.useState("");

  React.useEffect(() => {
    if (!picked || !cell) return;
    setAmount(cell.amountMinor !== null ? minorToInput(cell.amountMinor) : tracker.expectedMonthlyMinor ? minorToInput(tracker.expectedMonthlyMinor) : "");
    setProblem("");
  }, [picked, cell, tracker.expectedMonthlyMinor]);

  const save = useMutation({
    mutationFn: (amountMinor: number) => setPayment(detail.id, picked!.member.id, { year: tracker.year, month: picked!.month, amountMinor }),
    onSuccess: async () => {
      await refresh();
      toast.success("Payment saved");
      onClose();
    },
    onError: (err) => setProblem(errorText(err, "The payment could not be saved. Check your connection and try again.")),
  });
  const remove = useMutation({
    mutationFn: () => removePayment(detail.id, picked!.member.id, tracker.year, picked!.month),
    onSuccess: async () => {
      await refresh();
      toast.success("Payment removed");
      onClose();
    },
    onError: (err) => setProblem(errorText(err, "The payment could not be removed.")),
  });

  if (!picked || !cell) return null;
  const recorded = cell.amountMinor !== null;

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && !remove.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {MONTH_NAMES[picked.month - 1]} {tracker.year}
          </DialogTitle>
          <DialogDescription>{memberName(picked.member, tracker.fields)}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const minor = parseLeones(amount);
            if (!amount.trim() || minor === null || minor <= 0) return setProblem("Enter the amount paid as a number more than zero, for example 50 or 12.50.");
            setProblem("");
            save.mutate(minor);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-amount">Amount paid</Label>
            <Input id="pay-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="For example 50" />
            {tracker.expectedMonthlyMinor ? <p className="text-xs text-muted-foreground">Expected each month: {formatMinor(tracker.expectedMonthlyMinor)}</p> : null}
          </div>
          {recorded && (
            <p className="text-xs text-muted-foreground">
              Entered {stamp(cell.recordedAt)}
              {cell.updatedAt !== cell.recordedAt ? `. Last changed ${stamp(cell.updatedAt)}.` : "."}
            </p>
          )}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <DialogFooter className="gap-2">
            {recorded && (
              <Button type="button" variant="outline" className="text-destructive" loading={remove.isPending} onClick={() => remove.mutate()}>
                Remove payment
              </Button>
            )}
            <Button type="submit" loading={save.isPending}>
              {recorded ? "Save change" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
