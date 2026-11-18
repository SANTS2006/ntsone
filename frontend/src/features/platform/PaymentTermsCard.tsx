import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Percent } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import { getPaymentTerms, savePaymentTerms } from "./api";

/** The local date-time text a <input type="datetime-local"> wants, from an ISO time. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * For the platform team: the fee kept from this organization's payments, how long its money is held before it can be
 * withdrawn, and when its withdrawals switch on. Empty boxes use the platform defaults. Every change is on the record.
 */
export function PaymentTermsCard({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { data: terms } = useQuery({ queryKey: ["platform-tenants", tenantId, "payment-terms"], queryFn: () => getPaymentTerms(tenantId) });
  const [percent, setPercent] = React.useState("");
  const [fixed, setFixed] = React.useState("");
  const [hold, setHold] = React.useState("");
  const [activeFrom, setActiveFrom] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!terms) return;
    setPercent(terms.custom.feePercent ? String(terms.feePercent) : "");
    setFixed(terms.custom.feeFixed ? minorToInput(terms.feeFixedMinor) : "");
    setHold(terms.custom.hold ? String(terms.holdMinutes) : "");
    setActiveFrom(toLocalInput(terms.withdrawalsActiveFrom));
  }, [terms]);

  if (!terms) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const feePercent = percent.trim() === "" ? null : Number(percent);
    if (feePercent !== null && (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100)) return toast.error("The fee must be between 0 and 100 percent");
    const feeFixedMinor = fixed.trim() === "" ? null : parseLeones(fixed);
    if (fixed.trim() !== "" && feeFixedMinor === null) return toast.error("Enter the fixed fee as an amount, like 2.50");
    const holdMinutes = hold.trim() === "" ? null : Number(hold);
    if (holdMinutes !== null && (!Number.isInteger(holdMinutes) || holdMinutes < 0)) return toast.error("The hold time must be a whole number of minutes, 0 or more");
    setSaving(true);
    try {
      await savePaymentTerms(tenantId, {
        feePercent,
        feeFixedMinor,
        holdMinutes,
        withdrawalsActiveFrom: activeFrom ? new Date(activeFrom).toISOString() : null,
      });
      await queryClient.invalidateQueries({ queryKey: ["platform-tenants", tenantId, "payment-terms"] });
      toast.success("Payment terms saved. The organization was told by email.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the payment terms");
    } finally {
      setSaving(false);
    }
  };

  const d = terms.defaults;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-primary" />
          Payment terms
        </CardTitle>
        <CardDescription>
          The fee the platform keeps from this organization&apos;s payments and when its money can be withdrawn. Leave a box empty to use the platform default ({d.feePercent}%
          {d.feeFixedMinor > 0 ? ` + ${formatMinor(d.feeFixedMinor)}` : ""}, held {d.holdMinutes} minutes). Changes apply to payments from now on and are recorded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-percent">Platform fee (%)</Label>
            <Input id="tt-percent" inputMode="decimal" placeholder={`Default: ${d.feePercent}`} value={percent} onChange={(e) => setPercent(e.target.value)} />
            <p className="text-xs text-muted-foreground">Taken from every payment: tickets, ID cards, orders, votes and registrations.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-fixed">Fixed fee per payment (SLE, optional)</Label>
            <Input id="tt-fixed" inputMode="decimal" placeholder={`Default: ${minorToInput(d.feeFixedMinor) || "0"}`} value={fixed} onChange={(e) => setFixed(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-hold">Hold before withdrawal (minutes)</Label>
            <Input id="tt-hold" inputMode="numeric" placeholder={`Default: ${d.holdMinutes}`} value={hold} onChange={(e) => setHold(e.target.value)} />
            <p className="text-xs text-muted-foreground">How long money waits after a payment before it can be withdrawn. 0 releases it at once. An organization that turns on automatic withdrawal skips the hold.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-active">Withdrawals switch on from</Label>
            <Input id="tt-active" type="datetime-local" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} />
            <p className="text-xs text-muted-foreground">Until this time the organization cannot withdraw (nor automatically). Leave empty to have withdrawals on now.</p>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" loading={saving}>
              Save payment terms
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
