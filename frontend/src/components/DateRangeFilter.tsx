import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface DateRangeState {
  fromDay: string;
  toDay: string;
  setFromDay: (day: string) => void;
  setToDay: (day: string) => void;
  /** The start of the first day, and the end of the last, in the viewer's time zone, as the server expects them. */
  dateFrom: string | undefined;
  dateTo: string | undefined;
  active: boolean;
  clear: () => void;
}

/** A day range for a table. The two values go to the server as `dateFrom` and `dateTo`. */
export function useDateRange(): DateRangeState {
  const [fromDay, setFromDay] = React.useState("");
  const [toDay, setToDay] = React.useState("");
  const dateFrom = fromDay ? new Date(`${fromDay}T00:00:00`).toISOString() : undefined;
  const dateTo = toDay ? new Date(`${toDay}T23:59:59.999`).toISOString() : undefined;
  return {
    fromDay,
    toDay,
    setFromDay,
    setToDay,
    dateFrom,
    dateTo,
    active: Boolean(fromDay || toDay),
    clear: () => {
      setFromDay("");
      setToDay("");
    },
  };
}

/** "From" and "To" day pickers for filtering a table by date. `onChange` is called whenever the range changes (e.g. to go back to page 1). */
export function DateRangeFilter({ range, onChange, label = "Date" }: { range: DateRangeState; onChange?: () => void; label?: string }) {
  return (
    <div role="group" aria-label={`${label} range`} className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        From
        <Input
          type="date"
          aria-label={`${label} from`}
          className="h-9 w-40"
          value={range.fromDay}
          max={range.toDay || undefined}
          onChange={(e) => {
            range.setFromDay(e.target.value);
            onChange?.();
          }}
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        To
        <Input
          type="date"
          aria-label={`${label} to`}
          className="h-9 w-40"
          value={range.toDay}
          min={range.fromDay || undefined}
          onChange={(e) => {
            range.setToDay(e.target.value);
            onChange?.();
          }}
        />
      </label>
      {range.active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            range.clear();
            onChange?.();
          }}
        >
          Clear dates
        </Button>
      )}
    </div>
  );
}

/** Keeps rows whose date falls inside the range, for tables that are filtered in the browser. */
export function inDateRange(value: string | null | undefined, range: Pick<DateRangeState, "dateFrom" | "dateTo">): boolean {
  if (!range.dateFrom && !range.dateTo) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (range.dateFrom && time < new Date(range.dateFrom).getTime()) return false;
  if (range.dateTo && time > new Date(range.dateTo).getTime()) return false;
  return true;
}
