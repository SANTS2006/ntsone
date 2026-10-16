import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ApiError } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import type { Registration } from "@/types/api";
import type { RegistrationDetail } from "../registrations/api";
import { confirmPaidInPerson, waivePayment } from "./api";
import { PaymentBadge } from "./PaymentBadge";
import { RefundButton } from "./RefundButton";
import { RefundDialog } from "./RefundDialog";

interface OrderSnapshot {
  lines?: { id: string; name: string; unitMinor: number; quantity: number; totalMinor: number }[];
  totalMinor?: number;
}

/** The items of an order as one line ("2 x Rice, 1 x Oil") and its total, or null when the registration is not an order with items. */
export function orderSummary(registration: Pick<Registration, "responses">) {
  const order = registration.responses?.__order as OrderSnapshot | undefined;
  if (!order?.lines?.length) return null;
  return {
    text: order.lines.map((l) => (l.quantity > 1 ? `${l.quantity} x ${l.name}` : l.name)).join(", "),
    count: order.lines.reduce((sum, l) => sum + l.quantity, 0),
    totalMinor: order.totalMinor ?? order.lines.reduce((sum, l) => sum + l.totalMinor, 0),
  };
}

/** What an order contains, as it was when placed. Shown for orders from a form that sells items. */
export function OrderItemsCard({ registration }: { registration: Registration }) {
  const order = registration.responses?.__order as OrderSnapshot | undefined;
  if (!order?.lines?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Order items</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <ul className="flex flex-col gap-1">
          {order.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {line.quantity} x {line.name}
              </span>
              <span className="shrink-0 font-medium">{formatMinor(line.totalMinor)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-border/60 pt-2 text-base font-bold">
          <span>Total</span>
          <span>{formatMinor(order.totalMinor ?? order.lines.reduce((sum, l) => sum + l.totalMinor, 0))}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Where a registration's payment stands, every attempt made, and (for admins) letting it through without payment. */
export function RegistrationPaymentCard({ programId, detail, canEdit }: { programId: string; detail: RegistrationDetail; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { registration, payments = [] } = detail;
  const [confirming, setConfirming] = React.useState(false);
  const [confirmingInPerson, setConfirmingInPerson] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [refunding, setRefunding] = React.useState<(typeof payments)[number] | null>(null);
  const inPerson = Boolean(registration.documentsInPerson);
  if ((!registration.paymentStatus || registration.paymentStatus === "none") && !inPerson) return null;
  const unpaid = registration.paymentStatus === "pending" || registration.paymentStatus === "review";

  const confirmInPerson = async () => {
    setBusy(true);
    try {
      await confirmPaidInPerson(programId, registration.id);
      await queryClient.invalidateQueries({ queryKey: ["registrations", programId] });
      toast.success("Marked as paid in person. Their ID card and ticket are now available.");
      setConfirmingInPerson(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save this");
    } finally {
      setBusy(false);
    }
  };

  const waive = async () => {
    setBusy(true);
    try {
      await waivePayment(programId, registration.id);
      await queryClient.invalidateQueries({ queryKey: ["registrations", programId] });
      toast.success("Payment waived. Their ID card and ticket are now available.");
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not waive the payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" />
            Payment
          </span>
          {registration.paymentStatus && registration.paymentStatus !== "none" ? <PaymentBadge status={registration.paymentStatus} /> : <Badge variant="warning">Pays in person</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {registration.paymentStatus && registration.paymentStatus !== "none" && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-semibold">{formatMinor(registration.amountDueMinor ?? 0)}</span>
          </div>
        )}
        {inPerson && (
          <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="text-sm font-medium">Will buy their ID card and ticket in person</p>
            <p className="text-xs text-muted-foreground">They registered without paying for these online. Their ID card and ticket stay locked until you confirm they paid you at the program.</p>
            {canEdit && (
              <Button size="sm" className="w-fit" onClick={() => setConfirmingInPerson(true)}>
                Confirm paid in person
              </Button>
            )}
          </div>
        )}
        {registration.paidAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Paid</span>
            <span>{new Date(registration.paidAt).toLocaleString()}</span>
          </div>
        )}
        {payments.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-muted-foreground">
                  {new Date(p.createdAt).toLocaleString()}
                  {p.channel?.provider ? ` · ${p.channel.provider}` : ""}
                  {p.failureReason ? ` · ${p.failureReason}` : ""}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {p.refundedMinor > 0 && <span className="text-muted-foreground">{formatMinor(p.refundedMinor, p.currency)} refunded</span>}
                  <PaymentBadge status={p.status === "completed" && p.refundedMinor > 0 ? (p.refundedMinor >= p.amountMinor ? "refunded" : "partially_refunded") : p.status} />
                  {canEdit && p.status === "completed" && p.refundedMinor < p.amountMinor && (
                    <RefundButton refundableAt={p.refundableAt} onClick={() => setRefunding(p)} className="h-7 px-2 text-xs" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {unpaid && canEdit && (
          <>
            <p className="text-xs text-muted-foreground">
              Their ID card and ticket stay locked until this is paid. If they paid you another way, or you want to let them through, you can waive the payment.
            </p>
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setConfirming(true)}>
              Waive payment
            </Button>
          </>
        )}
      </CardContent>
      <RefundDialog programId={programId} payment={refunding ? { ...refunding, registrationNumber: registration.registrationNumber } : null} onClose={() => setRefunding(null)} />
      <ConfirmDialog
        open={confirmingInPerson}
        onOpenChange={setConfirmingInPerson}
        title="Confirm they paid in person?"
        description="Their ID card and ticket become available to them straight away. This is recorded in the audit log."
        confirmLabel="Confirm paid"
        busy={busy}
        onConfirm={confirmInPerson}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Waive this payment?"
        description="They will no longer be asked to pay, and their ID card and ticket become available. This is recorded in the audit log and can't be undone."
        confirmLabel="Waive payment"
        busy={busy}
        onConfirm={waive}
      />
    </Card>
  );
}
