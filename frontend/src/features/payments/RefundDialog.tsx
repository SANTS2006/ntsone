import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import { listPaymentRefunds, listPollPaymentRefunds, requestPollRefund, requestRefund, type ProgramPayment, type RefundRow } from "./api";

/** What the dialog needs to know about a payment: a registration or order payment, or a payment for votes. */
type RefundablePayment = Pick<ProgramPayment, "id" | "amountMinor" | "refundedMinor" | "currency" | "payerPhone" | "channel"> & { registrationNumber?: string; votes?: number | null };

const PROVIDERS = [
  { id: "m17", name: "Orange Money" },
  { id: "m18", name: "Africell Money" },
];

const STATUS_LABEL: Record<RefundRow["status"], string> = {
  pending_review: "Waiting for approval",
  queued: "Queued",
  processing: "Sending",
  completed: "Sent",
  failed: "Failed",
  rejected: "Declined",
};

/**
 * Sends money back to someone who paid. The money leaves the payment fund at once and is sent to the number below
 * (it comes back if the transfer fails). The admin confirms with their password.
 */
export function RefundDialog({ programId, pollId, payment, onClose }: { programId?: string; pollId?: string; payment: RefundablePayment | null; onClose: () => void }) {
  const scopeId = pollId ?? programId ?? "";
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [providerId, setProviderId] = React.useState("m17");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const remaining = payment ? payment.amountMinor - payment.refundedMinor : 0;
  const minor = parseLeones(amount);
  const tooMuch = minor !== null && minor > remaining;

  const { data: history } = useQuery({
    queryKey: ["payments", scopeId, "refunds", payment?.id],
    queryFn: () => (pollId ? listPollPaymentRefunds(pollId, payment!.id) : listPaymentRefunds(programId!, payment!.id)),
    enabled: Boolean(payment),
  });

  React.useEffect(() => {
    if (!payment) return;
    setAmount(minorToInput(payment.amountMinor - payment.refundedMinor));
    setReason("");
    setPassword("");
    setProviderId(payment.channel?.provider === "m18" ? "m18" : "m17");
    setPhone(payment.payerPhone ?? "");
  }, [payment]);

  const submit = useMutation({
    mutationFn: () => {
      const input = { amountMinor: minor!, reason: reason.trim(), providerId, phoneNumber: phone, password };
      return pollId ? requestPollRefund(pollId, payment!.id, input) : requestRefund(programId!, payment!.id, input);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["funds"] });
      toast.success(result.status === "pending_review" ? "Refund requested. It needs approval first." : "Refund requested. The money is on its way.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The refund could not be requested"),
  });

  const ready = minor !== null && minor > 0 && !tooMuch && reason.trim().length >= 3 && phone.trim().length >= 8 && password.length > 0;

  return (
    <Dialog open={Boolean(payment)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Refund this payment</DialogTitle>
          <DialogDescription>
            {payment && `${payment.registrationNumber ?? (payment.votes ? `${payment.votes} ${payment.votes === 1 ? "vote" : "votes"}` : "This payment")} paid ${formatMinor(payment.amountMinor, payment.currency)}`}
            {payment && payment.refundedMinor > 0 ? `, ${formatMinor(payment.refundedMinor, payment.currency)} already refunded` : ""}. The money is taken from your payment fund and sent to the mobile money number below. The platform fee is returned in proportion.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) submit.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-amount">Amount to refund (NLe)</Label>
            <Input id="refund-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={tooMuch || minor === null || undefined} />
            <p className={`text-xs ${tooMuch ? "text-destructive" : "text-muted-foreground"}`}>
              {tooMuch ? `At most ${formatMinor(remaining, payment?.currency)} can still be refunded.` : `Up to ${formatMinor(remaining, payment?.currency)} can be refunded.`}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Send it with</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger aria-label="Mobile money provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund-phone">Mobile money number</Label>
              <Input id="refund-phone" inputMode="tel" placeholder="076 123456" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Check the number with the person. A refund sent to the wrong number cannot be taken back.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-reason">Why is it being refunded?</Label>
            <Textarea id="refund-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-password">Your password</Label>
            <PasswordInput id="refund-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {history && history.length > 0 && (
            <div className="rounded-lg border border-border/70 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earlier refunds</p>
              <ul className="flex flex-col gap-1">
                {history.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()} · {r.reason}
                    </span>
                    <span className="shrink-0">
                      {formatMinor(r.amountMinor, r.currency)} · {STATUS_LABEL[r.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submit.isPending} disabled={!ready}>
              Refund {minor ? formatMinor(minor, payment?.currency) : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
