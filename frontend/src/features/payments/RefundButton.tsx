import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Re-renders every few seconds while `until` is still in the future, so a countdown can end by itself. */
function useCountdown(until: string | null) {
  const [now, setNow] = React.useState(() => Date.now());
  const target = until ? new Date(until).getTime() : 0;
  React.useEffect(() => {
    if (!target || target <= Date.now()) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= target) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  return Math.max(0, target - now);
}

const clock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * The Refund button of a paid payment. It is always there for a paid payment, but only turns on a few minutes after the
 * payment was received (the server enforces the same wait), counting down until then.
 */
export function RefundButton({ refundableAt, onClick, size = "sm", className }: { refundableAt: string | null; onClick: () => void; size?: "sm" | "default"; className?: string }) {
  const left = useCountdown(refundableAt);
  const waiting = left > 0;
  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      className={className}
      disabled={waiting}
      onClick={onClick}
      title={waiting ? "A payment can be refunded a few minutes after it is received" : "Send this money back to the person who paid"}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {waiting ? `Refund in ${clock(left)}` : "Refund"}
    </Button>
  );
}
