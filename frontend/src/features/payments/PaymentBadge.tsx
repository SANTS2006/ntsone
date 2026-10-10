import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/types/api";

const LOOK: Record<string, { label: string; className: string }> = {
  pending: { label: "Awaiting payment", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  review: { label: "Needs review", className: "bg-destructive/15 text-destructive" },
  waived: { label: "Waived", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  refunded: { label: "Refunded", className: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  partially_refunded: { label: "Partly refunded", className: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
  completed: { label: "Paid", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  expired: { label: "Expired", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  cancelled: { label: "Cancelled", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
};

/** A small label for where a payment stands. Nothing is shown for registrations that never needed one. */
export function PaymentBadge({ status }: { status: PaymentStatus | string | undefined }) {
  const look = status ? LOOK[status] : undefined;
  if (!look) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" className={cn("whitespace-nowrap", look.className)}>
      {look.label}
    </Badge>
  );
}
