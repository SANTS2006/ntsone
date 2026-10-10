import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshButton } from "@/components/RefreshButton";
import { formatMinor } from "@/lib/money";
import { useAuth } from "@/app/AuthContext";
import { useProgramOutletContext } from "../programs/ProgramDetailLayout";
import { listProgramPayments, type ProgramPayment } from "./api";
import { RefundButton } from "./RefundButton";
import { RefundDialog } from "./RefundDialog";
import { PaymentBadge } from "./PaymentBadge";

const CHANNEL: Record<string, string> = { m17: "Orange Money", m18: "Africell Money" };

/** Every payment attempt for a program: who paid, how much, how, and whether it went through. */
export function ProgramPaymentsPage() {
  const { program, submissionPath } = useProgramOutletContext();
  const navigate = useNavigate();
  const [status, setStatus] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const range = useDateRange();
  const [refunding, setRefunding] = React.useState<ProgramPayment | null>(null);
  const { user } = useAuth();
  // Refunding moves the organization's money, so it is for its admins (the server checks this too).
  const canRefund = user?.role === "admin" || user?.role === "super_admin";
  const { data, isLoading } = useQuery({
    queryKey: ["payments", program.id, status, page, range.dateFrom, range.dateTo],
    queryFn: () => listProgramPayments(program.id, { page, pageSize: 20, status: status === "all" ? undefined : status, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    refetchInterval: 20_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Received</p>
            <p className="text-2xl font-bold">{formatMinor(data?.summary.paidMinor ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Waiting to be paid</p>
            <p className="text-2xl font-bold">{formatMinor(data?.summary.pendingMinor ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Payments</p>
            <p className="text-2xl font-bold">{data?.total ?? 0}</p>
          </CardContent>
        </Card>
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
        <Table>
          <TableHeader className="bg-gradient-brand-soft">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Registration</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              {canRefund && <TableHead>Refund</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={canRefund ? 7 : 6} className="py-8 text-center text-muted-foreground"><Loading inline label="Loading payments" /></TableCell>
              </TableRow>
            )}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={canRefund ? 7 : 6} className="py-8 text-center text-muted-foreground">
                  No payments yet.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(submissionPath(p.registrationId))}>
                <TableCell className="whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{p.registrationNumber}</TableCell>
                <TableCell className="whitespace-nowrap">{p.payerName ?? p.payerEmail ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {p.channel?.provider ? (CHANNEL[p.channel.provider] ?? p.channel.provider) : p.channel?.type ?? "—"}
                  {p.channel?.phoneNumber ? ` · ${p.channel.phoneNumber}` : ""}
                  {p.providerOrderNumber && <span className="block text-xs text-muted-foreground">Monime order {p.providerOrderNumber}</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium">{formatMinor(p.amountMinor, p.currency)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <PaymentBadge status={p.status === "completed" && p.refundedMinor > 0 ? (p.refundedMinor >= p.amountMinor ? "refunded" : "partially_refunded") : p.status} />
                    {p.refundedMinor > 0 && <span className="text-xs text-muted-foreground">{formatMinor(p.refundedMinor, p.currency)} back</span>}
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
                {canRefund && (
                  <TableCell className="whitespace-nowrap text-right">
                    {p.status === "completed" && p.refundedMinor < p.amountMinor && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <RefundButton refundableAt={p.refundableAt} onClick={() => setRefunding(p)} />
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
      <RefundDialog programId={program.id} payment={refunding} onClose={() => setRefunding(null)} />
    </div>
  );
}
