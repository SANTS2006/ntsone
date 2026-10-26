import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Loading } from "@/components/Loading";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import { addWithdrawal, contributionKeys, getActivity, getSummary, listWithdrawals, MONTH_NAMES, removeWithdrawal, stamp, updateWithdrawal, type ContributionDetail, type Withdrawal } from "./api";
import { errorText, useRefresh } from "./RecordsTable";

const localInput = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Money taken out, with a note for each, and the total taken so far. */
export function WithdrawalsTab({ detail, canEdit }: { detail: ContributionDetail; canEdit: boolean }) {
  const refresh = useRefresh(detail.id);
  const { data, isLoading, isError } = useQuery({ queryKey: contributionKeys.withdrawals(detail.id), queryFn: () => listWithdrawals(detail.id) });
  const [editing, setEditing] = React.useState<Withdrawal | null>(null);
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [takenAt, setTakenAt] = React.useState(() => localInput());
  const [problem, setProblem] = React.useState("");
  const [removing, setRemoving] = React.useState<Withdrawal | null>(null);

  const reset = () => {
    setEditing(null);
    setAmount("");
    setNote("");
    setTakenAt(localInput());
    setProblem("");
  };

  const save = useMutation({
    mutationFn: (input: { amountMinor: number; note: string; takenAt: string }) => (editing ? updateWithdrawal(detail.id, editing.id, input) : addWithdrawal(detail.id, input)),
    onSuccess: async () => {
      await refresh();
      toast.success(editing ? "Change saved" : "Saved. The total taken has been updated.");
      reset();
    },
    onError: (err) => setProblem(errorText(err, "That could not be saved. Check your connection and try again.")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeWithdrawal(detail.id, id),
    onSuccess: async () => {
      await refresh();
      setRemoving(null);
      toast.success("Removed");
    },
    onError: (err) => toast.error(errorText(err, "That could not be removed.")),
  });

  if (isLoading) return <Loading label="Loading" />;
  if (isError || !data) return <p role="alert" className="text-sm text-destructive">This could not be loaded. Check your connection and refresh the page.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Collected</p><p className="mt-1 text-xl font-bold">{formatMinor(detail.collectedMinor)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Total taken out</p><p className="mt-1 text-xl font-bold">{formatMinor(data.totalTakenMinor)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Still held</p><p className={`mt-1 text-xl font-bold ${detail.collectedMinor - data.totalTakenMinor < 0 ? "text-destructive" : "gradient-text"}`}>{formatMinor(detail.collectedMinor - data.totalTakenMinor)}</p></CardContent></Card>
      </div>

      {canEdit && (
        <form
          className="grid gap-3 rounded-xl border border-border/70 bg-card/60 p-4 sm:grid-cols-[10rem_14rem_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const minor = parseLeones(amount);
            if (!amount.trim() || minor === null || minor <= 0) return setProblem("Enter the amount taken as a number more than zero, for example 200 or 45.50.");
            if (note.trim().length < 2) return setProblem("Write a note saying why the money was taken (at least 2 characters).");
            const when = new Date(takenAt);
            if (Number.isNaN(when.getTime())) return setProblem("Choose the date and time the money was taken.");
            setProblem("");
            save.mutate({ amountMinor: minor, note: note.trim(), takenAt: when.toISOString() });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-amount">Amount taken</Label>
            <Input id="w-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="For example 200" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-when">When</Label>
            <Input id="w-when" type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-note">Note: what was it used for?</Label>
            <Input id="w-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, Bought cement for the roof" maxLength={1000} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={save.isPending}>
              {editing ? "Save change" : "Record"}
            </Button>
            {editing && (
              <Button type="button" variant="outline" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive sm:col-span-4">
              {problem}
            </p>
          )}
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/60">
        <Table>
          <TableHeader className="bg-gradient-brand-soft">
            <TableRow className="hover:bg-transparent">
              <TableHead>Date taken</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Total taken so far</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Entered</TableHead>
              <TableHead>Last changed</TableHead>
              {canEdit && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 6} className="py-8 text-center text-muted-foreground">
                  No money has been taken from this contribution.
                </TableCell>
              </TableRow>
            )}
            {data.items.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="whitespace-nowrap">{stamp(w.takenAt)}</TableCell>
                <TableCell className="text-right font-medium">{formatMinor(w.amountMinor)}</TableCell>
                <TableCell className="text-right">{formatMinor(w.cumulativeMinor)}</TableCell>
                <TableCell className="min-w-[12rem]">{w.note}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{stamp(w.createdAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{w.updatedAt !== w.createdAt ? stamp(w.updatedAt) : "Not changed"}</TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit this entry"
                        onClick={() => {
                          setEditing(w);
                          setAmount(minorToInput(w.amountMinor));
                          setNote(w.note);
                          setTakenAt(localInput(w.takenAt));
                          setProblem("");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remove this entry" onClick={() => setRemoving(w)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this entry?"
        description="The amount will no longer count as taken out, and the balance goes back up. The change is kept in the activity history."
        confirmLabel="Remove entry"
        busy={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
        }}
      />
    </div>
  );
}

/** For a monthly contribution: the money year by year, who is behind, and the best month. */
export function OverviewTab({ detail }: { detail: ContributionDetail }) {
  const { data, isLoading, isError } = useQuery({ queryKey: contributionKeys.summary(detail.id), queryFn: () => getSummary(detail.id) });
  if (isLoading) return <Loading label="Loading the overview" />;
  if (isError || !data) return <p role="alert" className="text-sm text-destructive">The overview could not be loaded. Check your connection and refresh the page.</p>;
  const nameOf = (values: Record<string, string>) => detail.fields.map((f) => values[f.id]).filter(Boolean).join(" · ") || "Contributor";
  const max = Math.max(1, ...data.years.map((y) => y.collectedMinor));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Year by year</h2>
          <ul className="flex flex-col gap-2">
            {data.years.map((y) => (
              <li key={y.year} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="font-medium">{y.year}</span>
                <span className="h-3 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-gradient-brand" style={{ width: `${Math.round((y.collectedMinor / max) * 100)}%` }} />
                </span>
                <span className="text-right">
                  <span className="font-semibold">{formatMinor(y.collectedMinor)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{y.payments} {y.payments === 1 ? "payment" : "payments"} · {y.contributors} {y.contributors === 1 ? "person" : "people"}</span>
                </span>
              </li>
            ))}
          </ul>
          {data.bestMonth && (
            <p className="text-sm text-muted-foreground">
              Best month so far: <span className="font-medium text-foreground">{MONTH_NAMES[data.bestMonth.month - 1]} {data.bestMonth.year}</span> with {formatMinor(data.bestMonth.collectedMinor)}.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Who is behind</h2>
          {data.behind.length === 0 ? (
            <p className="text-sm text-muted-foreground">{detail.recordCount === 0 ? "Add contributors to see who has paid." : "Everyone is up to date. Nobody has a missing month."}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">These contributors have months with no payment recorded, counting from when they started until this month.</p>
              <ul className="divide-y divide-border/60">
                {data.behind.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{nameOf(b.values)}</span>
                    <span className="shrink-0 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                      {b.missingMonths} {b.missingMonths === 1 ? "month" : "months"} not paid
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ActivityTab({ detail }: { detail: ContributionDetail }) {
  const { data, isLoading, isError } = useQuery({ queryKey: contributionKeys.activity(detail.id), queryFn: () => getActivity(detail.id) });
  if (isLoading) return <Loading label="Loading the history" />;
  if (isError || !data) return <p role="alert" className="text-sm text-destructive">The history could not be loaded. Check your connection and refresh the page.</p>;
  return (
    <ol className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70 bg-card/60">
      {data.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
          <span>{e.summary}</span>
          <time className="text-xs text-muted-foreground" dateTime={e.createdAt}>
            {stamp(e.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
