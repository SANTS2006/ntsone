import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import type { PaymentConfig, Program } from "@/types/api";
import { programKeys } from "../programs/hooks";
import { getPaymentTerms, updatePaymentConfig } from "./api";
import { FeeAgreement, needsFeeAgreement } from "./FeeAgreement";

function PriceField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const invalid = parseLeones(value) === null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">NLe</span>
        <Input id={id} inputMode="decimal" className="pl-12" placeholder="0 (free)" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} />
      </div>
      <p className={`text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>{invalid ? "Enter an amount such as 150 or 150.50" : hint}</p>
    </div>
  );
}

/**
 * Turns payments on for a program (or an order form) and sets what each thing costs. Registrants pay through Monime
 * (Orange Money, Africell Money, QMoney) before their ID card or ticket is released.
 */
export function PaymentSettingsCard({ program }: { program: Program }) {
  const queryClient = useQueryClient();
  const isOrder = program.kind === "order_form";
  const saved: PaymentConfig = program.paymentConfig ?? { enabled: false, registrationFeeMinor: 0, idCardPriceMinor: 0, ticketPriceMinor: 0 };
  const [enabled, setEnabled] = React.useState(saved.enabled);
  const [fee, setFee] = React.useState(minorToInput(saved.registrationFeeMinor));
  const [idCard, setIdCard] = React.useState(minorToInput(saved.idCardPriceMinor));
  const [ticket, setTicket] = React.useState(minorToInput(saved.ticketPriceMinor));
  const [saving, setSaving] = React.useState(false);
  const [agreed, setAgreed] = React.useState(false);
  const { data: terms } = useQuery({ queryKey: ["payment-terms", program.id], queryFn: () => getPaymentTerms(program.id) });
  const mustAgree = enabled && needsFeeAgreement(terms);

  React.useEffect(() => {
    setEnabled(saved.enabled);
    setFee(minorToInput(saved.registrationFeeMinor));
    setIdCard(minorToInput(saved.idCardPriceMinor));
    setTicket(minorToInput(saved.ticketPriceMinor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id, saved.enabled, saved.registrationFeeMinor, saved.idCardPriceMinor, saved.ticketPriceMinor]);

  const next = {
    registrationFeeMinor: parseLeones(fee),
    idCardPriceMinor: parseLeones(idCard),
    ticketPriceMinor: parseLeones(ticket),
  };
  const valid = Object.values(next).every((v) => v !== null);
  const total = (next.registrationFeeMinor ?? 0) + (program.idCardEnabled ? (next.idCardPriceMinor ?? 0) : 0) + (program.ticketEnabled ? (next.ticketPriceMinor ?? 0) : 0);
  const dirty =
    enabled !== saved.enabled ||
    next.registrationFeeMinor !== saved.registrationFeeMinor ||
    next.idCardPriceMinor !== saved.idCardPriceMinor ||
    next.ticketPriceMinor !== saved.ticketPriceMinor;

  const save = async () => {
    if (!valid || (mustAgree && !agreed)) return;
    setSaving(true);
    try {
      await updatePaymentConfig(program.id, {
        enabled,
        registrationFeeMinor: next.registrationFeeMinor ?? 0,
        idCardPriceMinor: next.idCardPriceMinor ?? 0,
        ticketPriceMinor: next.ticketPriceMinor ?? 0,
        acceptFee: mustAgree && agreed ? true : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["payment-terms", program.id] });
      setAgreed(false);
      await queryClient.invalidateQueries({ queryKey: programKeys.all });
      toast.success(enabled ? "Payments are on" : "Payments are off");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the payment settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-4 w-4 text-primary" />
          Payments
        </CardTitle>
        <CardDescription>
          {isOrder
            ? "Charge for orders. Customers pick items, see the total, and pay with Orange Money, Africell Money or QMoney before the order goes through."
            : "Charge for registration, ID cards and tickets. Registrants pay with Orange Money, Africell Money or QMoney, and their ID card or ticket is released once the payment is confirmed."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
          <div>
            <Label htmlFor={`pay-${program.id}`} className="font-medium">
              {isOrder ? "Take payment for orders" : "Take payments"}
            </Label>
            <p className="text-xs text-muted-foreground">Money goes to your payment fund, which you can withdraw to your mobile money or bank.</p>
          </div>
          <Switch id={`pay-${program.id}`} checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && !isOrder && (
          <div className="grid gap-4 sm:grid-cols-3">
            <PriceField id="fee" label="Registration fee" hint="Charged to everyone who registers." value={fee} onChange={setFee} />
            <PriceField
              id="idcard"
              label="ID card price"
              hint={program.idCardEnabled ? "Added when the program issues ID cards." : "Turn on ID cards to charge for them."}
              value={idCard}
              onChange={setIdCard}
            />
            <PriceField
              id="ticket"
              label="Ticket price"
              hint={program.ticketEnabled ? "Added when the program issues tickets." : "Turn on tickets to charge for them."}
              value={ticket}
              onChange={setTicket}
            />
          </div>
        )}
        {enabled && !isOrder && (
          <p className="text-sm text-muted-foreground">
            Each registrant will pay <span className="font-semibold text-foreground">{formatMinor(total)}</span>.
          </p>
        )}
        {enabled && isOrder && <p className="text-sm text-muted-foreground">Add the items you sell and their prices under &ldquo;Items for sale&rdquo; below. The customer&apos;s total is worked out from them.</p>}

        {saved.enabled && needsFeeAgreement(terms) && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Payments are paused: nobody can pay until an organization admin agrees to the platform fee below and saves.</p>
        )}
        {enabled && <FeeAgreement id={`fee-${program.id}`} terms={terms} agreed={agreed} onChange={setAgreed} />}

        <Button className="w-fit" onClick={save} loading={saving} disabled={(!dirty && !(mustAgree && agreed)) || !valid || (mustAgree && !agreed)}>
          Save payment settings
        </Button>
      </CardContent>
    </Card>
  );
}
