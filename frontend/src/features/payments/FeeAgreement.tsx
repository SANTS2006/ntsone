import * as React from "react";
import { Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatMinor } from "@/lib/money";
import type { PaymentTerms } from "./api";

/** True when the admin still has to agree to the platform's fee (never agreed, or the fee has gone up since). */
export const needsFeeAgreement = (terms: PaymentTerms | undefined) => Boolean(terms) && (!terms!.accepted || terms!.accepted.percent < terms!.feePercent);

export const FEE_AGREEMENT_REQUIRED = "You must check the box to agree to the platform fee before the payment settings can be saved.";

/**
 * The state of the "I agree to the platform fee" box. It starts checked when the fee was already agreed to and stays
 * checked after saving. Editing any setting unchecks it, and it has to be checked again before the change can be saved.
 */
export function useFeeConsent(terms: PaymentTerms | undefined) {
  const [agreed, setAgreedState] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const alreadyAgreed = Boolean(terms) && !needsFeeAgreement(terms);
  React.useEffect(() => {
    setAgreedState(alreadyAgreed);
    setError(null);
  }, [alreadyAgreed, terms?.accepted?.at]);
  return {
    agreed,
    error,
    setAgreed: (value: boolean) => {
      setAgreedState(value);
      if (value) setError(null);
    },
    /** Call whenever a payment setting is edited. */
    onEdit: () => setAgreedState(false),
    /** True when saving may go ahead; otherwise shows the error under the box. */
    check: () => {
      if (agreed) return true;
      setError(FEE_AGREEMENT_REQUIRED);
      return false;
    },
  };
}

/**
 * The platform keeps a fee from every payment. Whoever switches payments on has to agree to it first;
 * the agreement is recorded with the settings.
 */
export function FeeAgreement({ id, terms, agreed, onChange, error }: { id: string; terms: PaymentTerms | undefined; agreed: boolean; onChange: (agreed: boolean) => void; error?: string | null }) {
  if (!terms) return null;
  const example = Math.round((10_000 * terms.feePercent) / 100) + terms.feeFixedMinor;
  return (
    <div className="flex flex-col gap-2">
      <div className={cn("flex items-start gap-3 rounded-lg border p-3", error ? "border-destructive/60 bg-destructive/5" : "border-amber-500/40 bg-amber-500/10")}>
        <Checkbox id={id} checked={agreed} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" aria-invalid={error ? true : undefined} />
        <Label htmlFor={id} className="flex flex-col gap-1 font-normal leading-snug">
          <span className="font-medium">
            I agree that the platform keeps {terms.feePercent}%{terms.feeFixedMinor > 0 ? ` + ${formatMinor(terms.feeFixedMinor)}` : ""} of every payment.
          </span>
          <span className="text-xs text-muted-foreground">For example, when someone pays {formatMinor(10_000)}, {formatMinor(10_000 - example)} goes to your payment fund and {formatMinor(example)} to the platform.</span>
        </Label>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {terms.accepted && !error && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Last agreed to on {new Date(terms.accepted.at).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
