import { Loading } from "@/components/Loading";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Coins, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshButton } from "@/components/RefreshButton";
import { ApiError } from "@/lib/api";
import { formatMinor, parseLeones } from "@/lib/money";
import { cn } from "@/lib/utils";
import { addRepayment, cancelLoan, createLoan, getLoan, listLoans, updateLoan, writeOffLoan, type Loan, type PayMethod } from "./api";
import { useBooks } from "./BookkeepingLayout";
import { dayLabel, methodLabel, METHODS, today } from "./kinds";

const STATUS_LABEL: Record<Loan["status"], string> = { open: "Open", paid: "Paid back", written_off: "Written off", cancelled: "Cancelled" };

const refresh = (queryClient: ReturnType<typeof useQueryClient>, businessId: string) => queryClient.invalidateQueries({ queryKey: ["books", businessId] });

function MethodChips({ value, onChange }: { value: PayMethod; onChange: (m: PayMethod) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="How was it paid?">
      {METHODS.map((m) => (
        <button key={m.value} type="button" onClick={() => onChange(m.value)} aria-pressed={value === m.value} className={cn("rounded-full border px-3 py-1.5 text-sm", value === m.value ? "border-primary bg-primary text-primary-foreground" : "border-border/70")}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Write down money lent to someone, or borrowed from someone. */
export function LoanDialog({ businessId, currency, direction, voiceNoteId, onClose }: { businessId: string; currency: string; direction: "lent" | "borrowed" | null; voiceNoteId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [party, setParty] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [interest, setInterest] = React.useState("0");
  const [issued, setIssued] = React.useState(today());
  const [due, setDue] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [method, setMethod] = React.useState<PayMethod>("cash");

  React.useEffect(() => {
    if (!direction) return;
    setParty("");
    setPhone("");
    setAmount("");
    setInterest("0");
    setIssued(today());
    setDue("");
    setPurpose("");
    setMethod("cash");
  }, [direction]);

  const amountMinor = parseLeones(amount);
  const interestNumber = Number(interest);
  const ready = party.trim().length >= 2 && amountMinor !== null && amountMinor > 0 && Number.isFinite(interestNumber) && interestNumber >= 0 && interestNumber <= 1000 && (!due || due >= issued);
  const lent = direction === "lent";

  const save = useMutation({
    mutationFn: () =>
      createLoan(businessId, {
        direction: direction!,
        partyName: party.trim(),
        partyPhone: phone.trim() || undefined,
        principalMinor: amountMinor!,
        interestPercent: interestNumber,
        issuedOn: issued,
        dueOn: due || undefined,
        purpose: purpose.trim() || undefined,
        paymentMethod: method,
        voiceNoteId,
      }),
    onSuccess: async () => {
      await refresh(queryClient, businessId);
      toast.success("Loan written in your book");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The loan couldn't be saved"),
  });

  return (
    <Dialog open={Boolean(direction)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white", lent ? "from-blue-500 to-indigo-400" : "from-purple-500 to-pink-400")}>{lent ? <Coins className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}</span>
            {lent ? "I lent money" : "I borrowed money"}
          </DialogTitle>
          <DialogDescription>{lent ? "Money someone must pay back to you. It leaves your cash now." : "Money you must pay back. It comes into your cash now."}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) save.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loan-amount" className="text-base">
              How much? ({currency === "SLE" ? "NLe" : currency})
            </Label>
            <Input id="loan-amount" autoFocus inputMode="decimal" className="h-14 text-2xl font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-party">{lent ? "Who got the loan?" : "Who lent it to you?"}</Label>
              <Input id="loan-party" value={party} onChange={(e) => setParty(e.target.value)} maxLength={100} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-phone">Their phone (optional)</Label>
              <Input id="loan-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-date">Date of the loan</Label>
              <Input id="loan-date" type="date" value={issued} max={today()} onChange={(e) => setIssued(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loan-due">To be paid back by (optional)</Label>
              <Input id="loan-due" type="date" value={due} min={issued} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loan-interest">Extra to pay on top, in percent (optional)</Label>
            <Input id="loan-interest" inputMode="decimal" className="w-32" value={interest} onChange={(e) => setInterest(e.target.value)} />
            {ready && interestNumber > 0 && amountMinor !== null && <p className="text-xs text-muted-foreground">Total to be paid back: {formatMinor(amountMinor + Math.round((amountMinor * interestNumber) / 100), currency)}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loan-purpose">What was it for? (optional)</Label>
            <Input id="loan-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>How was the money given?</Label>
            <MethodChips value={method} onChange={setMethod} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" loading={save.isPending} disabled={!ready}>
              Write it in the book
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One loan: what is left, the payments made, and what can be done with it. */
function LoanDetailDialog({ businessId, currency, loanId, canEdit, onClose }: { businessId: string; currency: string; loanId: string | null; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: loan } = useQuery({ queryKey: ["books", businessId, "loan", loanId], queryFn: () => getLoan(businessId, loanId!), enabled: Boolean(loanId) });
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [method, setMethod] = React.useState<PayMethod>("cash");
  const [due, setDue] = React.useState("");
  const [closing, setClosing] = React.useState<"write_off" | "cancel" | null>(null);
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    setClosing(null);
    setReason("");
    setDate(today());
  }, [loanId]);
  React.useEffect(() => {
    if (loan) {
      setAmount(loan.balanceMinor > 0 ? String(loan.balanceMinor / 100) : "");
      setDue(loan.dueOn ?? "");
    }
  }, [loan?.id, loan?.balanceMinor, loan?.dueOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const payMinor = parseLeones(amount);
  const canPay = loan !== undefined && payMinor !== null && payMinor > 0 && payMinor <= loan.balanceMinor;
  const lent = loan?.direction === "lent";

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "That didn't work. Please try again.");
  const pay = useMutation({
    mutationFn: () => addRepayment(businessId, loanId!, { amountMinor: payMinor!, paidOn: date, method }),
    onSuccess: async (result) => {
      await refresh(queryClient, businessId);
      toast.success(result.status === "paid" ? "Paid back in full" : "Payment written down");
    },
    onError,
  });
  const saveDue = useMutation({
    mutationFn: () => updateLoan(businessId, loanId!, { dueOn: due || null }),
    onSuccess: async () => {
      await refresh(queryClient, businessId);
      toast.success("Date changed");
    },
    onError,
  });
  const close = useMutation({
    mutationFn: () => (closing === "write_off" ? writeOffLoan(businessId, loanId!, reason.trim()) : cancelLoan(businessId, loanId!, reason.trim())),
    onSuccess: async () => {
      await refresh(queryClient, businessId);
      toast.success(closing === "write_off" ? "Loan written off" : "Loan cancelled");
      setClosing(null);
    },
    onError,
  });

  return (
    <Dialog open={Boolean(loanId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{loan ? (lent ? `Lent to ${loan.partyName}` : `Borrowed from ${loan.partyName}`) : "Loan"}</DialogTitle>
          <DialogDescription>{loan ? `${dayLabel(loan.issuedOn)}${loan.purpose ? ` · ${loan.purpose}` : ""}` : "Loading..."}</DialogDescription>
        </DialogHeader>
        {!loan && <Loading inline label="Loading" />}
        {loan && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border/70 bg-card/60 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{loan.status === "open" ? (lent ? "Still to come back to you" : "Still to pay back") : STATUS_LABEL[loan.status]}</p>
              <p className="text-3xl font-bold tracking-tight">{formatMinor(loan.balanceMinor, currency)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Loan {formatMinor(loan.principalMinor, currency)}
                {loan.interestMinor > 0 ? ` + extra ${formatMinor(loan.interestMinor, currency)}` : ""} · paid so far {formatMinor(loan.repaidMinor, currency)}
              </p>
              {loan.overdue && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> It was due on {dayLabel(loan.dueOn!)}
                </p>
              )}
              {loan.partyPhone && <p className="mt-1 text-sm">Phone: {loan.partyPhone}</p>}
            </div>

            {loan.repayments.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
                <ul className="flex flex-col divide-y divide-border/70 rounded-lg border border-border/70">
                  {loan.repayments.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className={r.voided ? "text-muted-foreground line-through" : ""}>
                        {dayLabel(r.entryDate)} · {methodLabel(r.paymentMethod)}
                      </span>
                      <span className="font-medium tabular-nums">{formatMinor(r.amountMinor, currency)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canEdit && loan.status === "open" && (
              <>
                <form
                  className="flex flex-col gap-3 rounded-xl border border-border/70 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canPay) pay.mutate();
                  }}
                >
                  <p className="text-sm font-semibold">{lent ? "They paid some back" : "I paid some back"}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="rep-amount">Amount</Label>
                      <Input id="rep-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amount) && !canPay ? true : undefined} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="rep-date">Date</Label>
                      <Input id="rep-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
                    </div>
                  </div>
                  <MethodChips value={method} onChange={setMethod} />
                  <Button type="submit" className="w-fit" loading={pay.isPending} disabled={!canPay}>
                    Write the payment down
                  </Button>
                </form>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="loan-due-edit">Date to be paid back by</Label>
                    <Input id="loan-due-edit" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-44" />
                  </div>
                  <Button variant="outline" onClick={() => saveDue.mutate()} loading={saveDue.isPending} disabled={due === (loan.dueOn ?? "")}>
                    Save date
                  </Button>
                </div>

                {closing ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 p-3">
                    <Label htmlFor="close-reason">{closing === "write_off" ? "Why is it being written off?" : "Why is it being cancelled?"}</Label>
                    <Input id="close-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
                    <p className="text-xs text-muted-foreground">{closing === "write_off" ? "The money that was paid back stays. The rest stops counting as owed. Nothing is deleted." : "Use this when the loan was written down by mistake. Its entries are voided and stay in the book."}</p>
                    <div className="flex gap-2">
                      <Button variant="destructive" loading={close.isPending} disabled={reason.trim().length < 3} onClick={() => close.mutate()}>
                        {closing === "write_off" ? "Write it off" : "Cancel the loan"}
                      </Button>
                      <Button variant="outline" onClick={() => setClosing(null)}>
                        Keep it
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setClosing("write_off")}>
                      It won&apos;t be paid back
                    </Button>
                    {loan.repaidMinor === 0 && (
                      <Button variant="outline" onClick={() => setClosing("cancel")}>
                        This was a mistake
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Loans given and received: who owes what, what is overdue, and what has been paid back. */
export function LoansPage() {
  const { businessId, currency, canEdit } = useBooks();
  const [status, setStatus] = React.useState<"open" | "paid" | "all">("open");
  const [direction, setDirection] = React.useState<"all" | "lent" | "borrowed">("all");
  const [newLoan, setNewLoan] = React.useState<"lent" | "borrowed" | null>(null);
  const [openLoan, setOpenLoan] = React.useState<string | null>(null);
  const { data: loans, isLoading } = useQuery({
    queryKey: ["books", businessId, "loans", status, direction],
    queryFn: () => listLoans(businessId, { status: status === "all" ? "all" : status, direction: direction === "all" ? undefined : direction }),
    refetchInterval: 30_000,
  });
  const open = (loans ?? []).filter((l) => l.status === "open");
  const lentBalance = open.filter((l) => l.direction === "lent").reduce((s, l) => s + l.balanceMinor, 0);
  const borrowedBalance = open.filter((l) => l.direction === "borrowed").reduce((s, l) => s + l.balanceMinor, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">People owe you</p>
            <p className="text-2xl font-bold text-emerald-600">{formatMinor(lentBalance, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">You owe</p>
            <p className="text-2xl font-bold text-rose-600">{formatMinor(borrowedBalance, currency)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["open", "paid", "all"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} className={cn("rounded-full border px-3 py-1.5 text-sm", status === s ? "border-primary bg-primary text-primary-foreground" : "border-border/70")}>
            {s === "open" ? "Still open" : s === "paid" ? "Paid back" : "All"}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden="true" />
        {(["all", "lent", "borrowed"] as const).map((d) => (
          <button key={d} type="button" onClick={() => setDirection(d)} aria-pressed={direction === d} className={cn("rounded-full border px-3 py-1.5 text-sm", direction === d ? "border-primary bg-primary text-primary-foreground" : "border-border/70")}>
            {d === "all" ? "Both" : d === "lent" ? "I lent" : "I borrowed"}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <RefreshButton />
          {canEdit && (
            <>
              <Button onClick={() => setNewLoan("lent")}>
                <Coins className="h-4 w-4" />I lent money
              </Button>
              <Button variant="outline" onClick={() => setNewLoan("borrowed")}>
                <Landmark className="h-4 w-4" />I borrowed money
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading && <Loading label="Loading loans" />}
      {!isLoading && loans?.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No loans here yet. When you lend or borrow money, write it down so you never forget who owes what.</CardContent>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {loans?.map((loan) => (
          <button key={loan.id} type="button" onClick={() => setOpenLoan(loan.id)} className="flex w-full min-w-0 flex-col gap-2 rounded-2xl border border-border/70 bg-card/80 p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-glow">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{loan.partyName}</p>
                <p className="text-xs text-muted-foreground">
                  {loan.direction === "lent" ? "I lent" : "I borrowed"} on {dayLabel(loan.issuedOn)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {loan.overdue ? <Badge className="bg-destructive/15 text-destructive" variant="secondary">Overdue</Badge> : <Badge variant="secondary">{STATUS_LABEL[loan.status]}</Badge>}
              </div>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{loan.status === "open" ? "Left to pay" : "Total"}</p>
                <p className={cn("whitespace-nowrap text-xl font-bold", loan.direction === "lent" ? "text-emerald-600" : "text-rose-600")}>{formatMinor(loan.status === "open" ? loan.balanceMinor : loan.totalDueMinor, currency)}</p>
              </div>
              <p className="text-right text-xs text-muted-foreground">
                of {formatMinor(loan.totalDueMinor, currency)}
                {loan.dueOn ? ` · due ${dayLabel(loan.dueOn)}` : ""}
              </p>
            </div>
          </button>
        ))}
      </div>

      <LoanDialog businessId={businessId} currency={currency} direction={newLoan} onClose={() => setNewLoan(null)} />
      <LoanDetailDialog businessId={businessId} currency={currency} loanId={openLoan} canEdit={canEdit} onClose={() => setOpenLoan(null)} />
    </div>
  );
}
