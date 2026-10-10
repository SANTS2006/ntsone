import { Loading } from "@/components/Loading";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshButton } from "@/components/RefreshButton";
import { DateRangeFilter, inDateRange, useDateRange } from "@/components/DateRangeFilter";
import { ApiError } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { usePageMeta } from "@/lib/seo";
import { getPlatformPayments, recheckPayment, reviewPayout, reviewRefund, type PlatformPayments } from "./api";

type Awaiting = PlatformPayments["awaitingReview"][number];
type AwaitingRefund = PlatformPayments["refundsAwaitingReview"][number];

/** For the platform team: withdrawals that wait for a person's approval, payments that need a look, and Monime's balances. */
export function PlatformPaymentsPage() {
  usePageMeta({ title: "Payments" });
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["platform-payments"], queryFn: getPlatformPayments, refetchInterval: 20_000 });
  const [deciding, setDeciding] = React.useState<{ payout: Awaiting; decision: "approve" | "reject" } | null>(null);
  const [note, setNote] = React.useState("");
  const [decidingRefund, setDecidingRefund] = React.useState<{ refund: AwaitingRefund; decision: "approve" | "reject" } | null>(null);
  const awaitingRange = useDateRange();
  const reviewRange = useDateRange();

  const review = useMutation({
    mutationFn: () => reviewPayout(deciding!.payout.id, deciding!.decision, note.trim() || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-payments"] });
      toast.success(deciding?.decision === "approve" ? "Withdrawal approved" : "Withdrawal declined");
      setDeciding(null);
      setNote("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not record the decision"),
  });
  const refundReview = useMutation({
    mutationFn: () => reviewRefund(decidingRefund!.refund.id, decidingRefund!.decision, note.trim() || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-payments"] });
      toast.success(decidingRefund?.decision === "approve" ? "Refund approved" : "Refund declined");
      setDecidingRefund(null);
      setNote("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not record the decision"),
  });
  const recheck = useMutation({
    mutationFn: (id: string) => recheckPayment(id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["platform-payments"] });
      toast.success(`Checked with Monime: ${result.status}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not check with Monime"),
  });

  if (isLoading || !data) return <Loading label="Loading payments" />;
  // These are short queues, so the date range is applied here rather than on the server.
  const awaiting = data.awaitingReview.filter((p) => inDateRange(p.createdAt, awaitingRange));
  const inReview = data.paymentsInReview.filter((p) => inDateRange(p.createdAt, reviewRange));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payments</h1>
          <p className="text-sm text-muted-foreground">Withdrawals to approve, payments to look at, and what Monime holds.</p>
        </div>
        <RefreshButton />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid in, all time</p>
            <p className="text-2xl font-bold">{formatMinor(data.totals.paidMinor)}</p>
            <p className="text-xs text-muted-foreground">{data.totals.paymentCount} payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Platform fees earned</p>
            <p className="text-2xl font-bold">{formatMinor(data.totals.feesMinor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Monime</p>
            {!data.monime.configured ? (
              <p className="text-sm text-amber-600">Not connected. Add the Monime access token and space id in the hosting settings.</p>
            ) : data.monime.error ? (
              <div className="flex flex-col gap-1 text-sm">
                <p className="text-destructive">{data.monime.error}</p>
                {(data.monime.status || data.monime.detail || data.monime.requestId) && (
                  <p className="break-words text-xs text-muted-foreground">
                    {[data.monime.status ? `Monime answered ${data.monime.status}` : null, data.monime.detail, data.monime.requestId ? `request ${data.monime.requestId}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            ) : (
              data.monime.accounts.map((a) => (
                <p key={a.id} className="flex justify-between text-sm">
                  <span className="truncate text-muted-foreground">{a.name}</span>
                  <span className="font-semibold">{a.availableMinor === null ? <span className="text-xs font-normal text-muted-foreground">Monime did not send a balance{a.fields ? ` (it sent: ${a.fields})` : ""}</span> : formatMinor(a.availableMinor, a.currency)}</span>
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Withdrawals waiting for approval</CardTitle>
            <CardDescription>Large withdrawals are held until someone other than the requester approves them. Check the account looks right before approving.</CardDescription>
          </div>
          <DateRangeFilter range={awaitingRange} label="Requested" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {awaiting.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nothing is waiting.
                  </TableCell>
                </TableRow>
              )}
              {awaiting.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{p.tenantName}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {p.accountName} · {p.providerId} · {p.accountNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold">{formatMinor(p.amountMinor)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" className="mr-2" onClick={() => setDeciding({ payout: p, decision: "approve" })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeciding({ payout: p, decision: "reject" })}>
                      Decline
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Refunds waiting for approval</CardTitle>
          <CardDescription>Large refunds are held until someone other than the requester approves them. Check the reason and the number look right.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.refundsAwaitingReview.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Nothing is waiting.
                  </TableCell>
                </TableRow>
              )}
              {data.refundsAwaitingReview.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{r.tenantName}</TableCell>
                  <TableCell className="max-w-xs truncate" title={r.reason}>
                    {r.reason}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.providerId} · {r.phoneNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold">{formatMinor(r.amountMinor)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" className="mr-2" onClick={() => setDecidingRefund({ refund: r, decision: "approve" })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDecidingRefund({ refund: r, decision: "reject" })}>
                      Decline
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Payments that need a look</CardTitle>
            <CardDescription>The amount received didn&apos;t match what was asked, or the checkout didn&apos;t match. Nothing is credited until this is sorted.</CardDescription>
          </div>
          <DateRangeFilter range={reviewRange} label="Payment" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Payer</TableHead>
                <TableHead className="text-right">Asked</TableHead>
                <TableHead>Why</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {inReview.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Nothing to look at.
                  </TableCell>
                </TableRow>
              )}
              {inReview.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap">{p.tenantName}</TableCell>
                  <TableCell className="whitespace-nowrap">{p.payerEmail ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium">{formatMinor(p.amountMinor)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{p.failureReason ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" loading={recheck.isPending && recheck.variables === p.id} onClick={() => recheck.mutate(p.id)}>
                      Check with Monime
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(decidingRefund)} onOpenChange={(open) => !open && setDecidingRefund(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decidingRefund?.decision === "approve" ? "Approve this refund?" : "Decline this refund?"}</DialogTitle>
            <DialogDescription>
              {decidingRefund && `${formatMinor(decidingRefund.refund.amountMinor)} for ${decidingRefund.refund.tenantName}, to ${decidingRefund.refund.phoneNumber}.`}{" "}
              {decidingRefund?.decision === "approve" ? "The money is sent right away." : "The money returns to their balance."}
            </DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Note (optional)" placeholder="Note (optional, shown to them if you decline)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecidingRefund(null)}>
              Cancel
            </Button>
            <Button variant={decidingRefund?.decision === "approve" ? "default" : "destructive"} loading={refundReview.isPending} onClick={() => refundReview.mutate()}>
              {decidingRefund?.decision === "approve" ? "Approve" : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deciding)} onOpenChange={(open) => !open && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deciding?.decision === "approve" ? "Approve this withdrawal?" : "Decline this withdrawal?"}</DialogTitle>
            <DialogDescription>
              {deciding && `${formatMinor(deciding.payout.amountMinor)} for ${deciding.payout.tenantName}, to ${deciding.payout.accountName} (${deciding.payout.accountNumber}).`}{" "}
              {deciding?.decision === "approve" ? "The money is sent right away." : "The money returns to their balance."}
            </DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Note (optional)" placeholder="Note (optional, shown to them if you decline)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button variant={deciding?.decision === "approve" ? "default" : "destructive"} loading={review.isPending} onClick={() => review.mutate()}>
              {deciding?.decision === "approve" ? "Approve" : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
