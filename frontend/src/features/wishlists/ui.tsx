import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatMinor, parseLeones } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { BudgetPosition, Priority } from "./api";

export const COLOR_STYLES: Record<string, { bar: string; chip: string; label: string }> = {
  blue: { bar: "bg-blue-500", chip: "bg-blue-500/15 text-blue-600 dark:text-blue-300", label: "Blue" },
  green: { bar: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", label: "Green" },
  purple: { bar: "bg-violet-500", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300", label: "Purple" },
  orange: { bar: "bg-orange-500", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-300", label: "Orange" },
  pink: { bar: "bg-pink-500", chip: "bg-pink-500/15 text-pink-600 dark:text-pink-300", label: "Pink" },
  teal: { bar: "bg-teal-500", chip: "bg-teal-500/15 text-teal-600 dark:text-teal-300", label: "Teal" },
  red: { bar: "bg-red-500", chip: "bg-red-500/15 text-red-600 dark:text-red-300", label: "Red" },
  gray: { bar: "bg-slate-500", chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300", label: "Gray" },
};
export const colorOf = (name: string) => COLOR_STYLES[name] ?? COLOR_STYLES.blue!;

export const money = (minor: number | null | undefined) => (minor === null || minor === undefined ? "—" : formatMinor(minor));

/** A day (YYYY-MM-DD) as a readable date, without the time zone shifting it. */
export function dayText(day: string | null | undefined): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** What a person typed as an optional price: empty is "no price", something wrong is `invalid`. */
export function readPrice(text: string): { minor: number | null; invalid: boolean } {
  if (text.trim() === "") return { minor: null, invalid: false };
  const minor = parseLeones(text);
  return minor === null ? { minor: null, invalid: true } : { minor, invalid: false };
}

/** An amount in Leones. Letters, signs and more than two decimals are not accepted. */
export function MoneyInput({ value, onChange, id, placeholder = "0.00", disabled, ariaLabel }: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string; disabled?: boolean; ariaLabel?: string }) {
  const bad = readPrice(value).invalid;
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={bad}
      placeholder={placeholder}
      value={value}
      className={cn(bad && "border-destructive focus-visible:ring-destructive")}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,\s]/g, "").slice(0, 18))}
    />
  );
}

const PRIORITY_STYLE: Record<Priority, { variant: "destructive" | "warning" | "secondary"; label: string }> = {
  high: { variant: "destructive", label: "High" },
  medium: { variant: "warning", label: "Medium" },
  low: { variant: "secondary", label: "Low" },
};
export const PRIORITY_LABEL = (p: Priority) => PRIORITY_STYLE[p].label;
export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge variant={PRIORITY_STYLE[priority].variant}>{PRIORITY_STYLE[priority].label}</Badge>;
}

/** How much of the budget is spent, with what is still planned shown lighter. */
export function BudgetBar({ budget, color = "blue", compact }: { budget: BudgetPosition; color?: string; compact?: boolean }) {
  if (budget.budgetMinor === null) return compact ? null : <p className="text-sm text-muted-foreground">No budget set.</p>;
  const total = Math.max(budget.budgetMinor, budget.spentMinor + budget.plannedMinor, 1);
  const spentPct = (budget.spentMinor / total) * 100;
  const plannedPct = (Math.min(budget.plannedMinor, Math.max(0, total - budget.spentMinor)) / total) * 100;
  const tone = budget.state === "over" ? "bg-destructive" : budget.state === "warning" ? "bg-warning" : colorOf(color).bar;
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label="Budget"
        aria-valuemin={0}
        aria-valuemax={budget.budgetMinor}
        aria-valuenow={Math.min(budget.spentMinor, budget.budgetMinor)}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full", tone)} style={{ width: `${spentPct}%` }} />
        <div className={cn("h-full opacity-40", tone)} style={{ width: `${plannedPct}%` }} />
      </div>
      {!compact && (
        <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
          <span>
            Spent {money(budget.spentMinor)} of {money(budget.budgetMinor)}
          </span>
          <span className={cn(budget.state === "over" && "font-medium text-destructive")}>
            {budget.state === "over" ? `Over budget by ${money(budget.overBudgetBy)} with the wished items` : budget.remainingMinor !== null ? `${money(budget.remainingMinor)} left` : ""}
          </span>
        </p>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/80 px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
