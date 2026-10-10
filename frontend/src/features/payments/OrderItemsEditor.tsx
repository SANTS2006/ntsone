import { Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor, minorToInput, parseLeones } from "@/lib/money";
import type { OrderItem } from "@/types/api";

/** An item as it is typed: the price stays text until it is read as money. */
export interface EditableItem extends Omit<OrderItem, "priceMinor"> {
  price: string;
}

export function toEditable(items: OrderItem[]): EditableItem[] {
  return items.map(({ priceMinor, ...rest }) => ({ ...rest, price: minorToInput(priceMinor) }));
}

/** The items as the server wants them, or an error message for the first problem. */
export function fromEditable(items: EditableItem[]): { items: OrderItem[]; error?: string } {
  const out: OrderItem[] = [];
  for (const [index, item] of items.entries()) {
    const name = item.name.trim();
    const priceMinor = parseLeones(item.price);
    if (!name) return { items: [], error: `Item ${index + 1} needs a name.` };
    if (priceMinor === null || priceMinor <= 0) return { items: [], error: `"${name}" needs a price above zero.` };
    out.push({ id: item.id, name, description: item.description?.trim() || undefined, priceMinor, imageUrl: item.imageUrl, maxQuantity: item.maxQuantity });
  }
  return { items: out };
}

const newId = () => `item_${Math.random().toString(36).slice(2, 8)}`;

/**
 * The goods an order form sells, with their prices. They show on the live order page; the customer picks quantities,
 * sees the total and pays. Prices are always read from here on the server, never from the customer's browser.
 */
export function OrderItemsEditor({ items, onChange }: { items: EditableItem[]; onChange: (items: EditableItem[]) => void }) {
  const update = (id: string, patch: Partial<EditableItem>) => onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Items for sale
        </CardTitle>
        <CardDescription>
          List what you sell and its price. Customers choose how many of each on the order page, and the total is worked out for them. Save the form to keep your changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No items yet. Add your first item below.</p>}
        {items.map((item, index) => {
          const price = parseLeones(item.price);
          return (
            <div key={item.id} className="grid gap-3 rounded-xl border border-border/70 p-3 sm:grid-cols-[1fr_9rem_7rem_auto] sm:items-start">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${item.id}-name`}>Item {index + 1}</Label>
                <Input id={`${item.id}-name`} placeholder="e.g. Rice, 25 kg bag" maxLength={100} value={item.name} onChange={(e) => update(item.id, { name: e.target.value })} />
                <Input aria-label={`Description of item ${index + 1}`} placeholder="Short description (optional)" maxLength={300} value={item.description ?? ""} onChange={(e) => update(item.id, { description: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${item.id}-price`}>Price (NLe)</Label>
                <Input id={`${item.id}-price`} inputMode="decimal" placeholder="0.00" value={item.price} onChange={(e) => update(item.id, { price: e.target.value })} aria-invalid={price === null || undefined} />
                <p className="text-xs text-muted-foreground">{price ? formatMinor(price) : "Price per item"}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${item.id}-max`}>Most per order</Label>
                <Input
                  id={`${item.id}-max`}
                  type="number"
                  min={1}
                  max={1000}
                  placeholder="No limit"
                  value={item.maxQuantity ?? ""}
                  onChange={(e) => update(item.id, { maxQuantity: e.target.value ? Math.min(1000, Math.max(1, Number(e.target.value))) : undefined })}
                />
              </div>
              <Button type="button" variant="ghost" size="icon" className="mt-6" aria-label={`Remove item ${index + 1}`} onClick={() => onChange(items.filter((i) => i.id !== item.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <Button type="button" variant="outline" className="w-fit" disabled={items.length >= 200} onClick={() => onChange([...items, { id: newId(), name: "", price: "" }])}>
          <Plus className="h-4 w-4" />
          Add an item
        </Button>
      </CardContent>
    </Card>
  );
}
