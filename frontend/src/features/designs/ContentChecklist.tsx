import { Checkbox } from "@/components/ui/checkbox";

export interface ChecklistItem<K extends string> {
  key: K;
  label: string;
  hint?: string;
}

/** Tick boxes for what appears on a card or ticket. */
export function ContentChecklist<K extends string>({
  items,
  values,
  onChange,
}: {
  items: ChecklistItem<K>[];
  values: Record<K, boolean | undefined>;
  onChange: (key: K, checked: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 p-3 sm:grid-cols-2">
      {items.map((item) => (
        <label key={item.key} className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={values[item.key] !== false}
            onCheckedChange={(checked) => onChange(item.key, checked === true)}
          />
          <span>
            {item.label}
            {item.hint && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
