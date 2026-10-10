import { Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatMinor } from "@/lib/money";
import type { PaymentTerms } from "./api";

/** True when the admin still has to agree to the platform's fee (never agreed, or the fee has gone up since). */
export const needsFeeAgreement = (terms: PaymentTerms | undefined) => Boolean(terms) && (!terms!.accepted || terms!.accepted.percent < terms!.feePercent);

/**
 * The platform keeps a fee from every payment. Whoever switches payments on has to agree to it first;
 * the agreement is recorded with the settings.
 */
export function FeeAgreement({ id, terms, agreed, onChange }: { id: string; terms: PaymentTerms | undefined; agreed: boolean; onChange: (agreed: boolean) => void }) {
  if (!terms) return null;
  const example = Math.round((10_000 * terms.feePercent) / 100) + terms.feeFixedMinor;
  if (!needsFeeAgreement(terms)) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        You agreed to the platform fee of {terms.accepted!.percent}% on {new Date(terms.accepted!.at).toLocaleDateString()}.
      </p>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <Checkbox id={id} checked={agreed} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <Label htmlFor={id} className="flex flex-col gap-1 font-normal leading-snug">
        <span className="font-medium">
          I agree that the platform keeps {terms.feePercent}%{terms.feeFixedMinor > 0 ? ` + ${formatMinor(terms.feeFixedMinor)}` : ""} of every payment.
        </span>
        <span className="text-xs text-muted-foreground">For example, when someone pays {formatMinor(10_000)}, {formatMinor(10_000 - example)} goes to your payment fund and {formatMinor(example)} to the platform.</span>
      </Label>
    </div>
  );
}
