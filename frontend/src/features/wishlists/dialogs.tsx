import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { minorToInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { addItems, createWishlist, markGotten, parseLines, updateItem, updateWishlist, wishKeys, type Priority, type WishItem, type Wishlist } from "./api";
import { COLOR_STYLES, MoneyInput, money, readPrice, todayInput } from "./ui";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

// ------------------------------------------------------------------ a list: create or change

export function ListFormDialog({ list, onClose, onSaved }: { list?: Wishlist; onClose: () => void; onSaved?: (list: Wishlist) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(list?.name ?? "");
  const [description, setDescription] = React.useState(list?.description ?? "");
  const [budget, setBudget] = React.useState(list?.budgetMinor ? minorToInput(list.budgetMinor) : "");
  const [targetDate, setTargetDate] = React.useState(list?.targetDate ?? "");
  const [color, setColor] = React.useState(list?.color ?? "blue");
  const price = readPrice(budget);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null, budgetMinor: price.minor, targetDate: targetDate || null, color };
      return list ? updateWishlist(list.id, body) : createWishlist(body);
    },
    onSuccess: (saved) => {
      toast.success(list ? "Saved" : "Wish list created");
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => toast.error(errorText(err, "Could not save the list")),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{list ? "Edit wish list" : "New wish list"}</DialogTitle>
          <DialogDescription>For example "Home", "Wedding" or "Shop equipment". Only you can see your lists.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error("Give the list a name");
            if (price.invalid) return toast.error("Enter the budget as a number, like 1500 or 1500.50");
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="wl-name">Name</Label>
            <Input id="wl-name" value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wl-desc">What is it for? (optional)</Label>
            <Textarea id="wl-desc" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wl-budget">Budget (optional)</Label>
              <MoneyInput id="wl-budget" value={budget} onChange={setBudget} placeholder="Most you want to spend" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-date">Want it all by (optional)</Label>
              <Input id="wl-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COLOR_STYLES).map(([key, style]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={style.label}
                  aria-pressed={color === key}
                  onClick={() => setColor(key)}
                  className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-background transition", style.bar, color === key ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100")}
                />
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {list ? "Save" : "Create list"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ adding items, one or many

interface Row {
  key: number;
  name: string;
  quantity: string;
  price: string;
}
let rowKey = 0;
const blankRow = (): Row => ({ key: (rowKey += 1), name: "", quantity: "", price: "" });

export function AddItemsDialog({ wishlistId, categories, onClose }: { wishlistId: string; categories: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = React.useState<Row[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [pasted, setPasted] = React.useState("");
  const [mode, setMode] = React.useState("rows");
  const [priority, setPriority] = React.useState<Priority>("medium");
  const [category, setCategory] = React.useState("");

  const save = useMutation({
    mutationFn: (items: Parameters<typeof addItems>[1]) => addItems(wishlistId, items),
    onSuccess: ({ items }) => {
      toast.success(items.length === 1 ? "Item added" : `${items.length} items added`);
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
      onClose();
    },
    onError: (err) => toast.error(errorText(err, "Could not add the items")),
  });

  const parsedPaste = React.useMemo(() => parseLines(pasted), [pasted]);
  const filled = rows.filter((r) => r.name.trim());
  const count = mode === "rows" ? filled.length : parsedPaste.length;

  const submit = () => {
    const common = { priority, category: category.trim() || null };
    const items: Parameters<typeof addItems>[1] = [];
    if (mode === "rows") {
      for (const r of filled) {
        const p = readPrice(r.price);
        if (p.invalid) return toast.error(`The price for "${r.name.trim()}" is not a valid amount`);
        const quantity = r.quantity ? Number(r.quantity) : undefined;
        if (quantity !== undefined && quantity < 1) return toast.error(`The quantity for "${r.name.trim()}" must be at least 1`);
        items.push({ name: r.name.trim(), quantity, unitPriceMinor: p.minor, ...common });
      }
    } else {
      for (const r of parsedPaste) {
        const p = readPrice(r.priceText ?? "");
        if (p.invalid) return toast.error(`The price for "${r.name}" is not a valid amount`);
        items.push({ name: r.name, quantity: r.quantity, unitPriceMinor: p.minor, ...common });
      }
    }
    if (items.length === 0) return toast.error("Write at least one item");
    save.mutate(items);
  };

  const update = (key: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = rows.reduce((sum, r) => {
    const p = readPrice(r.price).minor;
    return p === null || !r.name.trim() ? sum : sum + p * (Number(r.quantity) || 1);
  }, 0);

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to the wish list</DialogTitle>
          <DialogDescription>Add one item or many at once. Quantity and price are optional; you can fill them in later.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="rows">Type them in</TabsTrigger>
            <TabsTrigger value="paste">Paste a list</TabsTrigger>
          </TabsList>
          <TabsContent value="rows" className="space-y-3">
            <div className="hidden grid-cols-[1fr_5rem_8rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
              <span>Item</span>
              <span>Quantity</span>
              <span>Price each</span>
              <span />
            </div>
            {rows.map((r, index) => (
              <div key={r.key} className="grid grid-cols-[1fr_4.5rem_6.5rem_2rem] items-center gap-2 sm:grid-cols-[1fr_5rem_8rem_2rem]">
                <Input aria-label={`Item ${index + 1}`} placeholder={index === 0 ? "e.g. Sofa" : "Item"} maxLength={200} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
                <Input aria-label={`Quantity for item ${index + 1}`} inputMode="numeric" placeholder="Qty" value={r.quantity} onChange={(e) => update(r.key, { quantity: digits(e.target.value) })} />
                <MoneyInput ariaLabel={`Price each for item ${index + 1}`} placeholder="Price" value={r.price} onChange={(v) => update(r.key, { price: v })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" disabled={rows.length >= 100} onClick={() => setRows((all) => [...all, blankRow(), blankRow()])}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add more rows
              </Button>
              {total > 0 && <span className="text-sm text-muted-foreground">Expected total: {money(total)}</span>}
            </div>
          </TabsContent>
          <TabsContent value="paste" className="space-y-2">
            <Label htmlFor="wl-paste">One item per line. Optionally add the quantity and price each, separated by commas.</Label>
            <Textarea id="wl-paste" rows={8} placeholder={"Rice, 5, 350\nCooking oil, 2, 120\nSchool bag"} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {parsedPaste.length === 0 ? "Nothing to add yet." : `${parsedPaste.length} item${parsedPaste.length === 1 ? "" : "s"} found (up to 100 at a time).`}
            </p>
          </TabsContent>
        </Tabs>
        <div className="grid gap-3 rounded-xl border border-border/70 p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Priority (for all of these)</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wl-cat">Category (optional)</Label>
            <Input id="wl-cat" list="wl-cat-list" maxLength={60} placeholder="e.g. Furniture" value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="wl-cat-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} loading={save.isPending} disabled={count === 0}>
            {count > 1 ? `Add ${count} items` : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ marking items as gotten

export function GotDialog({ wishlistId, items, onClose }: { wishlistId: string; items: WishItem[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [day, setDay] = React.useState(todayInput());
  const [store, setStore] = React.useState("");
  const [note, setNote] = React.useState("");
  const [paid, setPaid] = React.useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, i.proposedTotalMinor ? minorToInput(i.proposedTotalMinor) : ""])));

  const save = useMutation({
    mutationFn: () =>
      markGotten(wishlistId, {
        gottenAt: day,
        store: store.trim() || null,
        note: note.trim() || null,
        items: items.map((i) => ({ itemId: i.id, paidMinor: readPrice(paid[i.id] ?? "").minor ?? undefined })),
      }),
    onSuccess: ({ items: done, skipped }) => {
      toast.success(done.length === 1 ? "Marked as gotten" : `${done.length} items marked as gotten`);
      if (skipped.length) toast.info(`${skipped.length} item${skipped.length === 1 ? " was" : "s were"} already gotten and left as they were`);
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
      onClose();
    },
    onError: (err) => toast.error(errorText(err, "Could not save")),
  });

  const total = items.reduce((sum, i) => sum + (readPrice(paid[i.id] ?? "").minor ?? 0), 0);
  const invalid = items.find((i) => readPrice(paid[i.id] ?? "").invalid);

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{items.length === 1 ? "I got this" : `I got these ${items.length} items`}</DialogTitle>
          <DialogDescription>Record what you paid and the day you got {items.length === 1 ? "it" : "them"}. {items.length === 1 ? "It" : "They"} will move to your Gotten list.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid) return toast.error(`The price for "${invalid.name}" is not a valid amount`);
            save.mutate();
          }}
        >
          <div className="space-y-3">
            {items.map((i) => (
              <div key={i.id} className="grid items-end gap-2 sm:grid-cols-[1fr_11rem]">
                <div className="min-w-0">
                  <p className="break-words font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.quantity > 1 ? `${i.quantity} wanted` : "1 wanted"}
                    {i.proposedTotalMinor !== null ? `, expected ${money(i.proposedTotalMinor)}` : ", no expected price"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`paid-${i.id}`} className="text-xs">
                    Total price paid
                  </Label>
                  <MoneyInput id={`paid-${i.id}`} value={paid[i.id] ?? ""} onChange={(v) => setPaid((p) => ({ ...p, [i.id]: v }))} placeholder="0.00" />
                </div>
              </div>
            ))}
          </div>
          {items.length > 1 && <p className="text-right text-sm font-medium">Total paid: {money(total)}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="got-date">Date you got {items.length === 1 ? "it" : "them"}</Label>
              <Input id="got-date" type="date" required max={todayInput()} value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="got-store">Where from (optional)</Label>
              <Input id="got-store" maxLength={120} placeholder="Shop, person or website" value={store} onChange={(e) => setStore(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="got-note">Note (optional)</Label>
            <Input id="got-note" maxLength={500} placeholder="Receipt number, warranty, anything to remember" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Mark as gotten
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ asking before something that is hard to undo

export function ConfirmDialog({ title, description, confirmLabel, destructive, busy, onConfirm, onClose }: { title: string; description: string; confirmLabel: string; destructive?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ editing an item

export function EditItemDialog({ wishlistId, item, categories, onClose }: { wishlistId: string; item: WishItem; categories: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const gotten = item.status === "gotten";
  const [name, setName] = React.useState(item.name);
  const [quantity, setQuantity] = React.useState(String(item.quantity));
  const [price, setPrice] = React.useState(item.unitPriceMinor !== null ? minorToInput(item.unitPriceMinor) || "0" : "");
  const [priority, setPriority] = React.useState<Priority>(item.priority);
  const [category, setCategory] = React.useState(item.category ?? "");
  const [notes, setNotes] = React.useState(item.notes ?? "");
  const [link, setLink] = React.useState(item.link ?? "");
  const [paid, setPaid] = React.useState(item.paidMinor !== null ? minorToInput(item.paidMinor) || "0" : "");
  const [day, setDay] = React.useState(item.gottenAt ?? "");
  const [store, setStore] = React.useState(item.store ?? "");
  const [gotNote, setGotNote] = React.useState(item.gottenNote ?? "");

  const save = useMutation({
    mutationFn: () => {
      const unit = readPrice(price);
      const paidP = readPrice(paid);
      return updateItem(wishlistId, item.id, {
        name: name.trim(),
        quantity: Number(quantity) || 1,
        unitPriceMinor: unit.minor,
        priority,
        category: category.trim() || null,
        notes: notes.trim() || null,
        link: link.trim() || null,
        ...(gotten ? { paidMinor: paidP.minor ?? 0, gottenAt: day, store: store.trim() || null, gottenNote: gotNote.trim() || null } : {}),
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      void queryClient.invalidateQueries({ queryKey: wishKeys.all });
      onClose();
    },
    onError: (err) => toast.error(errorText(err, "Could not save")),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
          <DialogDescription>Every change is kept in the activity record.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error("Write what the item is");
            if (readPrice(price).invalid || (gotten && readPrice(paid).invalid)) return toast.error("Enter prices as numbers, like 150 or 150.50");
            if (!Number(quantity) || Number(quantity) < 1) return toast.error("Quantity must be at least 1");
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ei-name">Item</Label>
            <Input id="ei-name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ei-qty">Quantity</Label>
              <Input id="ei-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(digits(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ei-price">Expected price each</Label>
              <MoneyInput id="ei-price" value={price} onChange={setPrice} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ei-cat">Category</Label>
              <Input id="ei-cat" list="ei-cat-list" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} />
              <datalist id="ei-cat-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ei-link">Web link</Label>
              <Input id="ei-link" type="url" maxLength={500} placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ei-notes">Notes</Label>
            <Textarea id="ei-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {gotten && (
            <div className="space-y-4 rounded-xl border border-border/70 p-3">
              <p className="text-sm font-medium">When you got it</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ei-paid">Total price paid</Label>
                  <MoneyInput id="ei-paid" value={paid} onChange={setPaid} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ei-day">Date</Label>
                  <Input id="ei-day" type="date" required max={todayInput()} value={day} onChange={(e) => setDay(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ei-store">Where from</Label>
                  <Input id="ei-store" maxLength={120} value={store} onChange={(e) => setStore(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ei-gnote">Note</Label>
                <Input id="ei-gnote" maxLength={500} value={gotNote} onChange={(e) => setGotNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
