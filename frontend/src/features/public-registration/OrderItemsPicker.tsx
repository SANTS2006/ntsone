import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMinor } from "@/lib/money";
import type { OrderItem } from "@/types/api";

export type Selection = Record<string, number>;

export function selectionTotal(items: OrderItem[], selection: Selection): number {
  return items.reduce((sum, item) => sum + item.priceMinor * (selection[item.id] ?? 0), 0);
}

/** The chosen items as the server expects them. */
export function selectionList(items: OrderItem[], selection: Selection) {
  return items.filter((item) => (selection[item.id] ?? 0) > 0).map((item) => ({ itemId: item.id, quantity: selection[item.id]! }));
}

/** What the customer can order: tap + to add, and the total updates as they go. The server works the total out again itself. */
export function OrderItemsPicker({ items, selection, onChange, error }: { items: OrderItem[]; selection: Selection; onChange: (update: (previous: Selection) => Selection) => void; error?: boolean }) {
  // Always built from the latest selection, so quick taps on one or several items never undo each other.
  const change = (item: OrderItem, compute: (current: number) => number) => {
    const limit = item.maxQuantity ?? 1000;
    onChange((previous) => {
      const next = { ...previous };
      const clamped = Math.max(0, Math.min(limit, Math.floor(compute(previous[item.id] ?? 0)) || 0));
      if (clamped === 0) delete next[item.id];
      else next[item.id] = clamped;
      return next;
    });
  };
  const total = selectionTotal(items, selection);
  const count = Object.values(selection).reduce((a, b) => a + b, 0);

  return (
    <section aria-labelledby="order-items-heading" className={`flex flex-col gap-3 rounded-2xl border p-4 ${error ? "border-destructive" : "border-border/70"} bg-gradient-brand-soft`}>
      <h3 id="order-items-heading" className="flex items-center gap-2 text-base font-semibold">
        <ShoppingBag className="h-4 w-4 text-primary" />
        What would you like to order?
      </h3>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const quantity = selection[item.id] ?? 0;
          return (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/80 p-3">
              {item.imageUrl && <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                <p className="text-sm font-semibold text-primary">{formatMinor(item.priceMinor)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={`Quantity of ${item.name}`}>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-full" aria-label={`Remove one ${item.name}`} disabled={quantity === 0} onClick={() => change(item, (q) => q - 1)}>
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <input
                  aria-label={`${item.name} quantity`}
                  inputMode="numeric"
                  className="h-8 w-12 rounded-md border border-input bg-background text-center text-sm"
                  value={quantity}
                  onChange={(e) => change(item, () => Number(e.target.value.replace(/\D/g, "")))}
                />
                <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-full" aria-label={`Add one ${item.name}`} disabled={quantity >= (item.maxQuantity ?? 1000)} onClick={() => change(item, (q) => q + 1)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between rounded-xl bg-card/80 px-4 py-3 text-sm" aria-live="polite">
        <span className="text-muted-foreground">
          {count === 0 ? "Nothing chosen yet" : `${count} item${count === 1 ? "" : "s"}`}
        </span>
        <span className="text-base font-bold">Total {formatMinor(total)}</span>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-destructive">Choose at least one item to order.</p>}
    </section>
  );
}
