import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshButton } from "@/components/RefreshButton";
import { formatMinor } from "@/lib/money";
import { usePollOutletContext } from "../polls/PollDetailLayout";
import { listPollPayments, type PollPayment } from "./api";
import { PaymentBadge } from "./PaymentBadge";
import { RefundButton } from "./RefundButton";
import { RefundDialog } from "./RefundDialog";

const CHANNEL: Record<string, string> = { m17: "Orange Money", m18: "Africell Money" };

/** What voters paid for votes: who, how much, how many votes, and whether they were used. The candidate is never shown. */
export function PollPaymentsPage() {
  const { poll } = usePollOutletContext();
  const [status, setStatus] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [refunding, setRefunding] = React.useState<PollPayment | null>(null);
  const range = useDateRange();
  const canRefund = poll.myRole === "admin";
  const { data, isLoading } = useQuery({
    queryKey: ["payments", "poll", poll.id, status, page, range.dateFrom, range.dateTo],
    queryFn: () => listPollPayments(poll.id, { page, pageSize: 20, status: status === "all" ? undefined : status, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    refetchInterval: 20_000,
  });
  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Received", value: formatMinor(summary?.paidMinor ?? 0) },
          { label: "Waiting to be paid", value: formatMinor(summary?.pendingMinor ?? 0) },
          { label: "Votes used", value: (summary?.votesUsed ?? 0).toLocaleString() },
          { label: "Paid votes not used yet", value: (summary?.votesWaiting ?? 0).toLocaleString() },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-bold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Filter payments">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="completed">Paid</SelectItem>
            <SelectItem value="pending">Awaiting payment</SelectItem>
            <SelectItem value="review">Needs review</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter range={range} onChange={() => setPage(1)} label="Payment" />
        <RefreshButton />
        <p className="ml-auto text-xs text-muted-foreground">Money received goes to your payment fund.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <Table className="whitespace-nowrap">
            <TableHeader className="bg-gradient-brand-soft">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Voter</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="text-right">Votes</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Votes</TableHead>
                {canRefund && <TableHead>Refund</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={canRefund ? 9 : 8} className="py-8 text-center text-muted-foreground"><Loading inline label="Loading payments" /></TableCell>
                </TableRow>
              )}
              {!isLoading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canRefund ? 9 : 8} className="py-8 text-center text-muted-foreground">
                    No payments yet.
                  </TableCell>
                </TableRow>
              )}
              {data?.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{p.payerName ?? p.payerEmail ?? "—"}</TableCell>
                  <TableCell>{p.positionTitle ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.votes ?? 0}</TableCell>
                  <TableCell>{p.channel?.provider ? (CHANNEL[p.channel.provider] ?? p.channel.provider) : (p.channel?.type ?? "—")}</TableCell>
                  <TableCell className="text-right font-medium">{formatMinor(p.amountMinor, p.currency)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <PaymentBadge status={p.status === "completed" && p.refundedMinor > 0 ? (p.refundedMinor >= p.amountMinor ? "refunded" : "partially_refunded") : p.status} />
                      {p.failureReason && p.status !== "completed" && (
                        <span title={p.failureReason} className="max-w-[14rem] truncate text-xs text-destructive">
                          {p.failureReason}
                        </span>
                      )}
                      {(p.risk.flags?.length ?? 0) > 0 && (
                        <span title={p.risk.flags!.join(", ")} className="text-xs text-amber-600">
                          flagged
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{p.status !== "completed" ? "—" : p.refundedMinor > 0 ? "Refunded" : p.used ? "Used" : "Not used yet"}</TableCell>
                  {canRefund && (
                    <TableCell className="text-right">
                      {p.status === "completed" && !p.used && p.refundedMinor < p.amountMinor && (
                        <RefundButton refundableAt={p.refundableAt} onClick={() => setRefunding(p)} />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
      <RefundDialog pollId={poll.id} payment={refunding} onClose={() => setRefunding(null)} />
    </div>
  );
}
