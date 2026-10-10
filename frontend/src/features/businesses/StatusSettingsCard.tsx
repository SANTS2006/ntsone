import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ListChecks, Plus, RotateCcw, Trash2 } from "lucide-react";
import { DEFAULT_STATUSES, STATUS_COLORS, statusKeyFromLabel, type StatusColor, type StatusDef, type StatusKind } from "@designs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { saveStatusConfig, type Business } from "./api";
import { businessKeys } from "./BusinessesListPage";

const COLOR_LABEL: Record<StatusColor, string> = { gray: "Grey", blue: "Blue", green: "Green", amber: "Amber", red: "Red" };
const COLOR_DOT: Record<StatusColor, string> = {
  gray: "bg-slate-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const SECTIONS: { kind: StatusKind; title: string; hint: string }[] = [
  { kind: "order", title: "Orders", hint: "Steps an order goes through. New orders always start on “New”." },
  { kind: "invoice", title: "Invoices", hint: "New invoices start on the first status in the list." },
  { kind: "receipt", title: "Receipts", hint: "New receipts start on the first status in the list." },
  { kind: "quotation", title: "Quotations", hint: "New quotations start on the first status in the list." },
];

interface Row extends StatusDef {
  /** Existing statuses keep their key; new ones get one when saved. */
  existing: boolean;
}

const toRows = (defs: StatusDef[]): Row[] => defs.map((d) => ({ ...d, existing: true }));

/** Lets a business name its own order, invoice, and receipt statuses. */
export function StatusSettingsCard({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const saved = business.statusConfig;
  const [rows, setRows] = React.useState<Record<StatusKind, Row[]>>(() => ({
    order: toRows(saved.order),
    invoice: toRows(saved.invoice),
    receipt: toRows(saved.receipt),
    quotation: toRows(saved.quotation),
  }));
  const [saving, setSaving] = React.useState(false);

  const dirty = JSON.stringify(rows) !== JSON.stringify({ order: toRows(saved.order), invoice: toRows(saved.invoice), receipt: toRows(saved.receipt), quotation: toRows(saved.quotation) });

  const update = (kind: StatusKind, next: Row[]) => setRows((r) => ({ ...r, [kind]: next }));
  const patch = (kind: StatusKind, index: number, change: Partial<Row>) =>
    update(kind, rows[kind].map((row, i) => (i === index ? { ...row, ...change } : row)));
  const move = (kind: StatusKind, index: number, by: -1 | 1) => {
    const list = [...rows[kind]];
    const target = index + by;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    update(kind, list);
  };

  const save = async () => {
    const config = {} as Record<StatusKind, StatusDef[]>;
    for (const { kind, title } of SECTIONS) {
      const used = new Set(rows[kind].filter((r) => r.existing).map((r) => r.key));
      const list: StatusDef[] = [];
      for (const row of rows[kind]) {
        const label = row.label.trim();
        if (!label) return toast.error(`Every ${title.toLowerCase()} status needs a name`);
        let key = row.key;
        if (!row.existing) {
          const base = statusKeyFromLabel(label) || "status";
          key = base;
          for (let n = 2; used.has(key); n++) key = `${base.slice(0, 26)}_${n}`;
          used.add(key);
        }
        list.push({ key, label, color: row.color });
      }
      config[kind] = list;
    }
    setSaving(true);
    try {
      const updated = await saveStatusConfig(business.id, config);
      queryClient.setQueryData(businessKeys.detail(business.id), updated);
      setRows({
        order: toRows(updated.statusConfig.order),
        invoice: toRows(updated.statusConfig.invoice),
        receipt: toRows(updated.statusConfig.receipt),
        quotation: toRows(updated.statusConfig.quotation),
      });
      toast.success("Statuses saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the statuses");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
          Statuses
        </CardTitle>
        <CardDescription>
          Name the steps your orders, invoices, and receipts go through. Customers see your order wording in their emails.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {SECTIONS.map(({ kind, title, hint }) => (
          <fieldset key={kind} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">{title}</legend>
            <p className="text-xs text-muted-foreground">{hint}</p>
            <ul className="flex flex-col gap-2">
              {rows[kind].map((row, index) => {
                const locked = kind === "order" && row.key === "submitted";
                return (
                  <li key={row.existing ? row.key : `new-${index}`} className="flex items-center gap-2">
                    <Input
                      aria-label={`${title} status ${index + 1} name`}
                      value={row.label}
                      maxLength={40}
                      onChange={(e) => patch(kind, index, { label: e.target.value })}
                      className="min-w-0 flex-1"
                    />
                    <Select value={row.color} onValueChange={(color) => patch(kind, index, { color: color as StatusColor })}>
                      <SelectTrigger className="w-28 shrink-0" aria-label={`${row.label || "Status"} colour`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_COLORS.map((color) => (
                          <SelectItem key={color} value={color}>
                            <span className="flex items-center gap-2">
                              <span className={cn("h-2.5 w-2.5 rounded-full", COLOR_DOT[color])} aria-hidden="true" />
                              {COLOR_LABEL[color]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Move ${row.label || "status"} up`} disabled={index === 0} onClick={() => move(kind, index, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${row.label || "status"} down`}
                      disabled={index === rows[kind].length - 1}
                      onClick={() => move(kind, index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${row.label || "status"}`}
                      disabled={locked || rows[kind].length <= 1}
                      title={locked ? "Every new order starts here, so it can be renamed but not removed" : undefined}
                      onClick={() => update(kind, rows[kind].filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows[kind].length >= 20}
                onClick={() => update(kind, [...rows[kind], { key: "", label: "", color: "gray", existing: false }])}
              >
                <Plus className="h-4 w-4" />
                Add a status
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => update(kind, toRows(DEFAULT_STATUSES[kind]))}>
                <RotateCcw className="h-4 w-4" />
                Use the standard ones
              </Button>
            </div>
          </fieldset>
        ))}
        <Button onClick={save} loading={saving} disabled={!dirty} className="w-fit">
          {saving ? "Saving..." : "Save statuses"}
        </Button>
      </CardContent>
    </Card>
  );
}
