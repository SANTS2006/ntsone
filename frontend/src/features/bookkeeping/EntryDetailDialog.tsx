import { Loading } from "@/components/Loading";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { formatMinor, parseLeones } from "@/lib/money";
import { addEntryPayment, getEntry, voidEntry, voidEntryPayment, type Entry, type PayMethod } from "./api";
import { dayLabel, KINDS, METHODS, methodLabel, today } from "./kinds";

const refresh = (queryClient: ReturnType<typeof useQueryClient>, businessId: string) => queryClient.invalidateQueries({ queryKey: ["books", businessId] });

/** One entry in full: what it is, the payments against it, and what can be done (take a payment, change, void). */
export function EntryDetailDialog({ businessId, currency, entryId, canEdit, onClose, onEdit }: { businessId: string; currency: string; entryId: string | null; canEdit: boolean; onClose: () => void; onEdit: (entry: Entry) => void }) {
  const queryClient = useQueryClient();
  const { data: entry } = useQuery({ queryKey: ["books", businessId, "entry", entryId], queryFn: () => getEntry(businessId, entryId!), enabled: Boolean(entryId) });
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PayMethod>("cash");
  const [date, setDate] = React.useState(today());
  const [voiding, setVoiding] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const info = entry ? KINDS[entry.kind] : null;

  React.useEffect(() => {
    setAmount("");
    setVoiding(false);
    setReason("");
    setDate(today());
  }, [entryId]);
  React.useEffect(() => {
    if (entry && entry.outstandingMinor > 0) setAmount((entry.outstandingMinor / 100).toString());
  }, [entry?.id, entry?.outstandingMinor]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = useMutation({
    mutationFn: () => addEntryPayment(businessId, entryId!, { amountMinor: parseLeones(amount)!, paidOn: date, method }),
    onSuccess: async () => {
      await refresh(queryClient, businessId);
      toast.success("Payment written down");
      setAmount("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The payment couldn't be saved"),
  });
  const takeBack = useMutation({
    mutationFn: (paymentId: string) => voidEntryPayment(businessId, entryId!, paymentId),
    onSuccess: async () => {
      await refresh(queryClient, businessId);
      toast.success("Payment taken back");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "That couldn't be changed"),
  });
  const cancelEntry = useMutation({
    mutationFn: () => voidEntry(businessId, entryId!, reason.trim()),
    onSuccess: async () => {
      await refresh(queryClient, businessId);
      toast.success("Entry voided. It stays in the book, marked as voided.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The entry couldn't be voided"),
  });

  const payMinor = parseLeones(amount);
  const canPay = payMinor !== null && payMinor > 0 && entry !== undefined && payMinor <= entry.outstandingMinor;

  return (
    <Dialog open={Boolean(entryId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{info ? info.label : "Entry"}</DialogTitle>
          <DialogDescription>{entry ? `${dayLabel(entry.entryDate)}${entry.partyName ? ` · ${entry.partyName}` : ""}` : "Loading..."}</DialogDescription>
        </DialogHeader>
        {!entry && <Loading inline label="Loading" />}
        {entry && info && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border/70 bg-card/60 p-4">
              <p className={`text-3xl font-bold tracking-tight ${entry.voided ? "text-muted-foreground line-through" : entry.moneyIn ? "text-emerald-600" : "text-foreground"}`}>{formatMinor(entry.amountMinor, currency)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{entry.moneyIn ? "Money in" : "Money out"}</span>
                {entry.voided && <Badge variant="secondary">Voided</Badge>}
                {!entry.voided && entry.outstandingMinor > 0 && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300" variant="secondary">{formatMinor(entry.outstandingMinor, currency)} not paid yet</Badge>}
              </div>
            </div>

            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
              {[
                ["Kind", entry.category ?? "—"],
                ["Details", entry.description ?? "—"],
                ["With", entry.partyName ? `${entry.partyName}${entry.partyPhone ? ` · ${entry.partyPhone}` : ""}` : "—"],
                ["Paid by", methodLabel(entry.paymentMethod)],
                ["Reference", entry.reference ?? "—"],
              ].map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </React.Fragment>
              ))}
            </dl>
            {entry.voided && <p className="rounded-lg bg-muted/60 p-3 text-sm">Voided: {entry.voidReason}</p>}

            {entry.payments.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
                <ul className="flex flex-col divide-y divide-border/70 rounded-lg border border-border/70">
                  {entry.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className={p.voided ? "text-muted-foreground line-through" : ""}>
                        {dayLabel(p.paidOn)} · {methodLabel(p.method)}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">{formatMinor(p.amountMinor, currency)}</span>
                        {canEdit && !p.voided && !entry.voided && !entry.loanId && entry.kind !== "owner_in" && entry.kind !== "owner_out" && entry.kind !== "other_income" && entry.payments.filter((x) => !x.voided).length > 0 && (
                          <Button size="sm" variant="ghost" loading={takeBack.isPending && takeBack.variables === p.id} onClick={() => takeBack.mutate(p.id)}>
                            Take back
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canEdit && !entry.voided && entry.outstandingMinor > 0 && (
              <form
                className="flex flex-col gap-3 rounded-xl border border-border/70 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canPay) pay.mutate();
                }}
              >
                <p className="text-sm font-semibold">{entry.moneyIn ? "They paid some of it" : "I paid some of it"}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="settle-amount">Amount</Label>
                    <Input id="settle-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amount) && !canPay ? true : undefined} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="settle-date">Date</Label>
                    <Input id="settle-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {METHODS.map((m) => (
                    <button key={m.value} type="button" onClick={() => setMethod(m.value)} aria-pressed={method === m.value} className={`rounded-full border px-3 py-1 text-sm ${method === m.value ? "border-primary bg-primary text-primary-foreground" : "border-border/70"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <Button type="submit" className="w-fit" loading={pay.isPending} disabled={!canPay}>
                  Write the payment down
                </Button>
              </form>
            )}

            {canEdit && !entry.voided && (
              <div className="flex flex-wrap gap-2">
                {!entry.loanId && (
                  <Button variant="outline" onClick={() => onEdit(entry)}>
                    Change details
                  </Button>
                )}
                {!entry.loanId && !voiding && (
                  <Button variant="outline" onClick={() => setVoiding(true)}>
                    This was a mistake
                  </Button>
                )}
                {entry.loanId && <p className="text-xs text-muted-foreground">This belongs to a loan. Change it on the Loans page.</p>}
              </div>
            )}
            {voiding && (
              <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 p-3">
                <Label htmlFor="void-reason">Why is it a mistake?</Label>
                <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="For example: I wrote it twice" />
                <p className="text-xs text-muted-foreground">Nothing is deleted. The entry stays in the book, marked as voided, and stops counting.</p>
                <div className="flex gap-2">
                  <Button variant="destructive" loading={cancelEntry.isPending} disabled={reason.trim().length < 3} onClick={() => cancelEntry.mutate()}>
                    Void this entry
                  </Button>
                  <Button variant="outline" onClick={() => setVoiding(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
