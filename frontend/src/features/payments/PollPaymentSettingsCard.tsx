import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import type { Poll } from "../polls/api";
import { pollKeys } from "../polls/hooks";
import { getPollPaymentTerms, updatePollPaymentConfig, type PollPaymentConfig } from "./api";
import { FeeAgreement, needsFeeAgreement } from "./FeeAgreement";

const DEFAULTS: PollPaymentConfig = { enabled: false, pricePerVoteMinor: 100, allowAnyAmount: false, maxVotesPerPayment: 100 };

/**
 * Makes voters pay for their votes. One price per vote: either exactly one vote per payment, or any amount that buys
 * as many votes as the price fits into. The platform's fee is agreed to here before it can be switched on.
 */
export function PollPaymentSettingsCard({ poll, canEdit }: { poll: Poll; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const saved = poll.paymentConfig ?? DEFAULTS;
  const [enabled, setEnabled] = React.useState(saved.enabled);
  const [price, setPrice] = React.useState(minorToInput(saved.pricePerVoteMinor));
  const [anyAmount, setAnyAmount] = React.useState(saved.allowAnyAmount);
  const [maxVotes, setMaxVotes] = React.useState(String(saved.maxVotesPerPayment));
  const [agreed, setAgreed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const { data: terms } = useQuery({ queryKey: ["payment-terms", "poll", poll.id], queryFn: () => getPollPaymentTerms(poll.id) });

  React.useEffect(() => {
    setEnabled(saved.enabled);
    setPrice(minorToInput(saved.pricePerVoteMinor));
    setAnyAmount(saved.allowAnyAmount);
    setMaxVotes(String(saved.maxVotesPerPayment));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.id, saved.enabled, saved.pricePerVoteMinor, saved.allowAnyAmount, saved.maxVotesPerPayment]);

  const priceMinor = parseLeones(price);
  const maxVotesNumber = Number(maxVotes);
  const validPrice = priceMinor !== null && priceMinor >= 100;
  const validMax = Number.isInteger(maxVotesNumber) && maxVotesNumber >= 1 && maxVotesNumber <= 10_000;
  const mustAgree = enabled && needsFeeAgreement(terms);
  const dirty = enabled !== saved.enabled || priceMinor !== saved.pricePerVoteMinor || anyAmount !== saved.allowAnyAmount || (anyAmount && maxVotesNumber !== saved.maxVotesPerPayment);
  const canSave = canEdit && (!enabled || (validPrice && validMax)) && (!mustAgree || agreed) && (dirty || (mustAgree && agreed));

  const save = async () => {
    setSaving(true);
    try {
      await updatePollPaymentConfig(poll.id, {
        enabled,
        pricePerVoteMinor: validPrice ? priceMinor! : saved.pricePerVoteMinor,
        allowAnyAmount: anyAmount,
        maxVotesPerPayment: validMax ? maxVotesNumber : saved.maxVotesPerPayment,
        acceptFee: mustAgree && agreed ? true : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: pollKeys.detail(poll.id) });
      await queryClient.invalidateQueries({ queryKey: ["payment-terms", "poll", poll.id] });
      setAgreed(false);
      toast.success(enabled ? "Voters now pay for their votes" : "Voting is free again");
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
          <Coins className="h-4 w-4 text-primary" />
          Paid voting
        </CardTitle>
        <CardDescription>Ask voters to pay for their votes with Orange Money or Africell Money. The money goes to your payment fund.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
          <div>
            <Label htmlFor={`pv-${poll.id}`} className="font-medium">
              Voters pay for their votes
            </Label>
            <p className="text-xs text-muted-foreground">Each payment is used once. To vote again, a voter pays again.</p>
          </div>
          <Switch id={`pv-${poll.id}`} checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} />
        </div>

        {enabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`pv-price-${poll.id}`}>Price of one vote</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">NLe</span>
                  <Input id={`pv-price-${poll.id}`} inputMode="decimal" className="pl-12" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!canEdit} aria-invalid={!validPrice || undefined} />
                </div>
                <p className={`text-xs ${validPrice ? "text-muted-foreground" : "text-destructive"}`}>{validPrice ? "At least NLe 1." : "Enter at least NLe 1."}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`pv-max-${poll.id}`}>Most votes in one payment</Label>
                <Input id={`pv-max-${poll.id}`} inputMode="numeric" value={maxVotes} onChange={(e) => setMaxVotes(e.target.value)} disabled={!canEdit || !anyAmount} aria-invalid={(anyAmount && !validMax) || undefined} />
                <p className="text-xs text-muted-foreground">Only used when voters can pay any amount.</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
              <div>
                <Label htmlFor={`pv-any-${poll.id}`} className="font-medium">
                  Voters can pay any amount
                </Label>
                <p className="text-xs text-muted-foreground">
                  {anyAmount
                    ? `The votes come from the amount: ${validPrice ? `NLe ${price} buys one vote, ${formatMinor((priceMinor ?? 0) * 5)} buys five.` : "set the price above."}`
                    : "Off: every payment is exactly the price and buys one vote."}
                </p>
              </div>
              <Switch id={`pv-any-${poll.id}`} checked={anyAmount} onCheckedChange={setAnyAmount} disabled={!canEdit} />
            </div>

            {saved.enabled && needsFeeAgreement(terms) && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Paid voting is paused: nobody can pay until an organization admin agrees to the platform fee below and saves.</p>
            )}
            <FeeAgreement id={`pv-fee-${poll.id}`} terms={terms} agreed={agreed} onChange={setAgreed} />
          </>
        )}

        {canEdit && (
          <Button className="w-fit" onClick={save} loading={saving} disabled={!canSave}>
            Save payment settings
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
