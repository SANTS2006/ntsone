import * as React from "react";
import { toast } from "sonner";
import { Hash } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import type { Program, RegistrationNumberConfig } from "@/types/api";
import { useUpdateProgram } from "./hooks";

const DEFAULTS: RegistrationNumberConfig = { prefix: "REG", separator: "-", includeYear: true, digits: 6, startAt: 1 };
const SEPARATORS = [
  { value: "-", label: "Dash ( - )" },
  { value: "/", label: "Slash ( / )" },
  { value: "none", label: "None" },
] as const;

/** e.g. "National Youth Service" -> "NYS" */
function initialsOf(name: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const skip = new Set(["of", "and", "the", "for", "in", "on", "a", "an"]);
  return words
    .filter((w) => !skip.has(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 6);
}

export function formatRegistrationNumber(config: RegistrationNumberConfig, sequence = 1): string {
  const number = String(config.startAt + sequence - 1).padStart(config.digits, "0");
  const parts = [config.prefix.toUpperCase(), config.includeYear ? String(new Date().getFullYear()) : "", number].filter(Boolean);
  return parts.join(config.separator);
}

export function RegistrationNumberCard({ program }: { program: Program }) {
  const noun = program.kind === "order_form" ? "order" : "registration";
  const updateProgram = useUpdateProgram(program.id);
  const saved = React.useMemo(() => ({ ...DEFAULTS, ...program.registrationNumberConfig }), [program.registrationNumberConfig]);
  const [config, setConfig] = React.useState<RegistrationNumberConfig>(saved);
  React.useEffect(() => setConfig(saved), [saved]);

  const set = (patch: Partial<RegistrationNumberConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const initials = initialsOf(program.name);

  const presets: { label: string; config: RegistrationNumberConfig }[] = [
    { label: "Standard", config: DEFAULTS },
    ...(initials && initials !== "REG"
      ? [
          { label: "Program initials + year", config: { ...DEFAULTS, prefix: initials } },
          { label: "Program initials only", config: { ...DEFAULTS, prefix: initials, includeYear: false, digits: 5 } },
        ]
      : []),
    { label: "Numbers only", config: { ...DEFAULTS, prefix: "", includeYear: false, separator: "", digits: 6 } },
  ];

  const save = async () => {
    try {
      await updateProgram.mutateAsync({ registrationNumberConfig: config });
      toast.success(noun === "order" ? "Order number format saved" : "Registration number format saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save the format");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4 text-primary" />
          {noun === "order" ? "Order numbers" : "Registration numbers"}
        </CardTitle>
        <CardDescription>
          {noun === "order"
            ? "Choose how order numbers look. Changes apply to new orders."
            : "Choose how registration numbers look for this program. Changes apply to new registrations."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="rounded-xl border border-border/70 bg-gradient-brand-soft px-5 py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{noun === "order" ? "Order" : "Registration"} numbers will look like</p>
          <p className="gradient-text mt-1 tabular-nums text-xl font-semibold tracking-wide">
            {formatRegistrationNumber(config, 1)}, {formatRegistrationNumber(config, 2)} …
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => setConfig(p.config)}>
              {p.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="regPrefix">Prefix</Label>
            <Input
              id="regPrefix"
              value={config.prefix}
              maxLength={20}
              placeholder="e.g. NYS"
              onChange={(e) => set({ prefix: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase() })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Separator</Label>
            <Select
              value={config.separator === "" ? "none" : config.separator}
              onValueChange={(v) => set({ separator: v === "none" ? "" : (v as "-" | "/") })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEPARATORS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Number length</Label>
            <Select value={String(config.digits)} onValueChange={(v) => set({ digits: Number(v) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} digits
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="regStart">Start from</Label>
            <Input
              id="regStart"
              type="number"
              min={1}
              value={config.startAt}
              onChange={(e) => set({ startAt: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
          <Label htmlFor="regYear" className="font-medium">
            Include the year
            <span className="block text-xs font-normal text-muted-foreground">
              With the year, numbering restarts each January; without it, numbers keep counting up.
            </span>
          </Label>
          <Switch id="regYear" checked={config.includeYear} onCheckedChange={(v) => set({ includeYear: v })} />
        </div>

        <Button onClick={save} loading={updateProgram.isPending} disabled={!dirty} className="w-fit">
          {updateProgram.isPending ? "Saving..." : "Save format"}
        </Button>
      </CardContent>
    </Card>
  );
}
