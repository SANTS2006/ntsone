import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, Banknote, Clock, Landmark, Plus, Smartphone, Trash2, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshButton } from "@/components/RefreshButton";
import { ApiError } from "@/lib/api";
import { formatMinor, parseLeones } from "@/lib/money";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getFundRefunds, organizationFund, type FundApi, type FundsSummary, type PayoutAccount, type PayoutRow } from "./api";

const KIND_LABEL: Record<string, string> = {
  payment: "Payment received",
  fee: "Platform fee",
  payout: "Withdrawal",
  payout_reversal: "Withdrawal returned",
  platform_fee: "Platform fee earned",
  refund: "Refund to a payer",
  fee_refund: "Platform fee returned",
  refund_reversal: "Refund returned",
  fee_refund_reversal: "Platform fee taken again",
  platform_fee_refund: "Fee returned with a refund",
  platform_fee_refund_reversal: "Fee returned with a refund, undone",
  vote_payment: "Vote payment received",
  adjustment: "Adjustment",
};

const PAYOUT_LOOK: Record<PayoutRow["status"], { label: string; className: string }> = {
  pending_review: { label: "Waiting for approval", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  queued: { label: "Queued", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  processing: { label: "Sending", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  completed: { label: "Sent", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  rejected: { label: "Declined", className: "bg-destructive/15 text-destructive" },
};

/** "3 minutes", "1 hour", "24 hours". */
const waitText = (minutes: number) => (minutes === 0 ? "no time" : minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}` : `${minutes} ${minutes === 1 ? "minute" : "minutes"}`);

function BalanceCard({ label, value, hint, icon: Icon, tone }: { label: string; value: number; hint: string; icon: typeof Wallet; tone?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-5">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white", tone)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-bold">{formatMinor(value)}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function WithdrawDialog({ fund, funds, open, onOpenChange }: { fund: FundApi; funds: FundsSummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const usable = funds.accounts.filter((a) => a.usable);
  const [accountId, setAccountId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [password, setPassword] = React.useState("");
  const minor = parseLeones(amount);
  const available = funds.balances.availableMinor;
  const tooMuch = minor !== null && minor > available;
  const tooLittle = minor !== null && minor > 0 && minor < funds.limits.minMinor;
  const willNeedApproval = fund.scope !== "platform" && minor !== null && minor > funds.limits.reviewAboveMinor;

  React.useEffect(() => {
    if (open) {
      setAccountId(usable[0]?.id ?? "");
      setAmount("");
      setPassword("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = useMutation({
    mutationFn: () => fund.requestPayout({ accountId, amountMinor: minor!, password }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [fund.root] });
      toast.success(result.status === "pending_review" ? "Withdrawal requested. It needs approval first." : "Withdrawal requested. The money is on its way.");
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The withdrawal could not be requested"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw money</DialogTitle>
          <DialogDescription>You can withdraw up to {formatMinor(Math.max(0, available))} right now.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (minor && accountId && password && !tooMuch && !tooLittle) submit.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Send to</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger aria-label="Withdrawal account">
                <SelectValue placeholder={usable.length ? "Choose an account" : "No account ready yet"} />
              </SelectTrigger>
              <SelectContent>
                {usable.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.providerName} · {a.accountNumber} · {a.accountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {funds.accounts.length > usable.length && <p className="text-xs text-muted-foreground">A new account can be used {waitText(funds.limits.newAccountMinutes)} after it is added.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount (NLe)</Label>
            <Input id="amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={tooMuch || tooLittle || minor === null || undefined} />
            {tooMuch && <p className="text-xs text-destructive">That is more than you can withdraw right now.</p>}
            {tooLittle && <p className="text-xs text-destructive">The smallest withdrawal is {formatMinor(funds.limits.minMinor)}.</p>}
            {willNeedApproval && <p className="text-xs text-amber-600">Amounts above {formatMinor(funds.limits.reviewAboveMinor)} are approved by our team first.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pw">Your password</Label>
            <PasswordInput id="pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">We ask again to be sure it is really you moving the money.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submit.isPending} disabled={!minor || !accountId || !password || tooMuch || tooLittle}>
              Withdraw {minor ? formatMinor(minor) : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddAccountDialog({ fund, funds, open, onOpenChange }: { fund: FundApi; funds: FundsSummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = React.useState<"momo" | "bank">("momo");
  const [providerId, setProviderId] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const providers = type === "momo" ? funds.providers.momo : funds.providers.banks;

  React.useEffect(() => {
    if (open) {
      setType("momo");
      setProviderId(funds.providers.momo[0]?.providerId ?? "");
      setNumber("");
      setName("");
      setPassword("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = useMutation({
    mutationFn: () => fund.addAccount({ type, providerId, accountNumber: number, accountName: name, password }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [fund.root] });
      toast.success(`Account added. It can be used in ${waitText(funds.limits.newAccountMinutes)}.`);
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The account could not be added"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a withdrawal account</DialogTitle>
          <DialogDescription>Where your money is sent. For safety a new account waits {waitText(funds.limits.newAccountMinutes)} before it can be used, and we email every admin.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Account type">
            {(["momo", "bank"] as const).map((t) => (
              <Button
                key={t}
                type="button"
                variant={type === t ? "default" : "outline"}
                onClick={() => {
                  setType(t);
                  setProviderId((t === "momo" ? funds.providers.momo : funds.providers.banks)[0]?.providerId ?? "");
                }}
              >
                {t === "momo" ? <Smartphone className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                {t === "momo" ? "Mobile money" : "Bank"}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{type === "momo" ? "Mobile money provider" : "Bank"}</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger aria-label="Provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.providerId} value={p.providerId}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-number">{type === "momo" ? "Mobile number" : "Account number"}</Label>
            <Input id="acc-number" inputMode="tel" placeholder={type === "momo" ? "076 123456" : "Account number"} value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-name">Name on the account</Label>
            <Input id="acc-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-pw">Your password</Label>
            <PasswordInput id="acc-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!providerId || number.length < 5 || name.trim().length < 2 || !password}>
              Add account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveAccountDialog({ fund, account, onClose }: { fund: FundApi; account: PayoutAccount | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = React.useState("");
  React.useEffect(() => setPassword(""), [account]);
  const remove = useMutation({
    mutationFn: () => fund.removeAccount(account!.id, password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [fund.root] });
      toast.success("Account removed");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The account could not be removed"),
  });
  return (
    <Dialog open={Boolean(account)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this account?</DialogTitle>
          <DialogDescription>
            {account?.providerName} · {account?.accountNumber} · {account?.accountName}. Enter your password to confirm.
          </DialogDescription>
        </DialogHeader>
        <PasswordInput aria-label="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" loading={remove.isPending} disabled={!password} onClick={() => remove.mutate()}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** An organization's payment fund: what has been paid in, what can be withdrawn, where it goes, and the history. */
export function FundsPage({ fund = organizationFund }: { fund?: FundApi }) {
  const platform = fund.scope === "platform";
  usePageMeta({ title: platform ? "Platform fund" : "Payment fund" });
  const queryClient = useQueryClient();
  const { data: funds, isLoading } = useQuery({ queryKey: [fund.root, "summary"], queryFn: fund.getFunds, refetchInterval: 20_000 });
  const [ledgerPage, setLedgerPage] = React.useState(1);
  const [payoutPage, setPayoutPage] = React.useState(1);
  const ledgerRange = useDateRange();
  const payoutRange = useDateRange();
  const { data: ledger } = useQuery({
    queryKey: [fund.root, "ledger", ledgerPage, ledgerRange.dateFrom, ledgerRange.dateTo],
    queryFn: () => fund.getLedger(ledgerPage, { dateFrom: ledgerRange.dateFrom, dateTo: ledgerRange.dateTo }),
    refetchInterval: 20_000,
  });
  const { data: payouts } = useQuery({
    queryKey: [fund.root, "payouts", payoutPage, payoutRange.dateFrom, payoutRange.dateTo],
    queryFn: () => fund.getPayouts(payoutPage, { dateFrom: payoutRange.dateFrom, dateTo: payoutRange.dateTo }),
    refetchInterval: 20_000,
  });
  const [refundPage, setRefundPage] = React.useState(1);
  const { data: refundsData } = useQuery({ queryKey: [fund.root, "refunds", refundPage], queryFn: () => getFundRefunds(refundPage), enabled: !platform, refetchInterval: 20_000 });
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<PayoutAccount | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => fund.cancelPayout(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [fund.root] });
      toast.success("Withdrawal cancelled. The money is back on your balance.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not cancel the withdrawal"),
  });

  /** Why withdrawing isn't possible right now, or null when it is. */
  const withdrawBlock = !funds
    ? null
    : !funds.configured
      ? "Payments are not connected on this platform yet."
      : !funds.accounts.length
        ? 'Add a withdrawal account first, using "Add account" below.'
        : !funds.accounts.some((a) => a.usable)
          ? `Your new account is not ready yet. It can be used ${waitText(funds.limits.newAccountMinutes)} after it is added.`
          : funds.balances.availableMinor <= 0
            ? funds.balances.pendingMinor > 0
              ? "Your money is still on hold. It becomes available to withdraw after the hold."
              : "There is no money available to withdraw yet."
            : null;

  if (isLoading || !funds) return <Loading label="Loading your payment fund" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{platform ? "Platform fund" : "Payment fund"}</h1>
          <p className="text-sm text-muted-foreground">{platform ? `The ${funds.limits.feePercent}% fee the platform keeps from every payment, and your withdrawals of it.` : "Money paid for your registrations and orders, and your withdrawals."}</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton />
          <Button onClick={() => setWithdrawOpen(true)} disabled={withdrawBlock !== null} title={withdrawBlock ?? undefined}>
            <ArrowDownToLine className="h-4 w-4" />
            Withdraw
          </Button>
        </div>
      </div>

      {funds.configured && withdrawBlock && <p className="text-sm text-muted-foreground">Withdraw is off for now: {withdrawBlock}</p>}

      {!funds.configured && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">Payments are not connected on this platform yet, so nothing can be paid or withdrawn. Ask the platform administrator to connect Monime.</p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <BalanceCard label="Available" value={funds.balances.availableMinor} hint="Ready to withdraw" icon={Wallet} />
        <BalanceCard label="On hold" value={funds.balances.pendingMinor} hint={`Released ${funds.limits.holdMinutes === 0 ? "at once" : funds.limits.holdMinutes % 60 === 0 ? `${funds.limits.holdMinutes / 60} hours` : `${funds.limits.holdMinutes} minutes`}${funds.limits.holdMinutes === 0 ? "" : " after each payment"}`} icon={Clock} tone="bg-none bg-amber-500" />
        <BalanceCard label="Total" value={funds.balances.totalMinor} hint="Available plus on hold" icon={Banknote} tone="bg-none bg-slate-500" />
      </div>
      {platform && funds.feesEarnedMinor !== undefined && (
        <p className="text-xs text-muted-foreground">
          Fees earned in total: {formatMinor(funds.feesEarnedMinor)} from {funds.paymentsCounted ?? 0} paid payments. Fees are released {funds.limits.holdMinutes} minutes after each payment, like everything else.
        </p>
      )}
      {!platform && (funds.limits.feePercent > 0 || funds.limits.feeFixedMinor > 0) && (
        <p className="text-xs text-muted-foreground">
          A platform fee of {funds.limits.feePercent}%{funds.limits.feeFixedMinor > 0 ? ` + ${formatMinor(funds.limits.feeFixedMinor)}` : ""} is taken from each payment received.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Withdrawal accounts</CardTitle>
            <CardDescription>Mobile money numbers or bank accounts you can withdraw to.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} disabled={!funds.configured}>
            <Plus className="h-4 w-4" />
            Add account
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {funds.accounts.length === 0 && <p className="text-sm text-muted-foreground">No account yet. Add one to start withdrawing.</p>}
          {funds.accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand-soft text-primary">{a.type === "momo" ? <Smartphone className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {a.providerName} · {a.accountNumber}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.accountName}
                    {!a.usable && ` · usable from ${new Date(a.usableAfter).toLocaleString()}`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Remove ${a.accountName}`} onClick={() => setRemoving(a)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Withdrawals</CardTitle>
          <DateRangeFilter range={payoutRange} onChange={() => setPayoutPage(1)} label="Withdrawal" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No withdrawals yet.
                  </TableCell>
                </TableRow>
              )}
              {payouts?.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {p.accountName} · {p.accountNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium">{formatMinor(p.amountMinor, p.currency)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="secondary" className={PAYOUT_LOOK[p.status].className} title={p.failureReason ?? undefined}>
                      {PAYOUT_LOOK[p.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {(p.status === "queued" || p.status === "pending_review") && (
                      <Button variant="ghost" size="sm" loading={cancel.isPending && cancel.variables === p.id} onClick={() => cancel.mutate(p.id)}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {payouts && payouts.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <Button variant="outline" size="sm" disabled={payoutPage <= 1} onClick={() => setPayoutPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {payouts.page} of {payouts.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={payoutPage >= payouts.totalPages} onClick={() => setPayoutPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!platform && refundsData && refundsData.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Refunds</CardTitle>
            <CardDescription>Money you sent back to people who paid. To refund a payment, open its program or order form, then Payments.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refundsData.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.registrationNumber ?? "Votes"}</TableCell>
                    <TableCell className="max-w-xs truncate" title={r.reason}>
                      {r.reason}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{formatMinor(r.amountMinor, r.currency)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="secondary" className={PAYOUT_LOOK[r.status === "pending_review" ? "pending_review" : r.status].className}>
                        {r.status === "completed" ? "Sent" : r.status === "rejected" ? "Declined" : r.status === "failed" ? "Failed" : r.status === "pending_review" ? "Waiting for approval" : "On its way"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {refundsData.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <Button variant="outline" size="sm" disabled={refundPage <= 1} onClick={() => setRefundPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {refundsData.page} of {refundsData.totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={refundPage >= refundsData.totalPages} onClick={() => setRefundPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Money in and out</CardTitle>
            <CardDescription>Every payment received, fee and withdrawal, newest first.</CardDescription>
          </div>
          <DateRangeFilter range={ledgerRange} onChange={() => setLedgerPage(1)} label="Ledger" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Registration</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    Nothing yet.
                  </TableCell>
                </TableRow>
              )}
              {ledger?.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {KIND_LABEL[e.kind] ?? e.kind}
                    {e.kind === "payment" && new Date(e.availableAt) > new Date() && <span className="ml-2 text-xs text-amber-600">on hold</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{e.registrationNumber ?? "—"}</TableCell>
                  <TableCell className={cn("whitespace-nowrap text-right font-medium", e.amountMinor < 0 ? "text-destructive" : "text-emerald-600")}>
                    {e.amountMinor < 0 ? "-" : "+"}
                    {formatMinor(Math.abs(e.amountMinor), e.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {ledger && ledger.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <Button variant="outline" size="sm" disabled={ledgerPage <= 1} onClick={() => setLedgerPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {ledger.page} of {ledger.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={ledgerPage >= ledger.totalPages} onClick={() => setLedgerPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <WithdrawDialog fund={fund} funds={funds} open={withdrawOpen} onOpenChange={setWithdrawOpen} />
      <AddAccountDialog fund={fund} funds={funds} open={addOpen} onOpenChange={setAddOpen} />
      <RemoveAccountDialog fund={fund} account={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}
