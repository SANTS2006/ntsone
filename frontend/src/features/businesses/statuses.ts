import type { StatusColor, StatusDef } from "@designs";

export type BadgeTone = "default" | "secondary" | "success" | "warning" | "destructive" | "outline";

export const COLOR_TONE: Record<StatusColor, BadgeTone> = {
  gray: "secondary",
  blue: "default",
  green: "success",
  amber: "warning",
  red: "destructive",
};

const humanize = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const statusLabel = (defs: StatusDef[], key: string) => defs.find((d) => d.key === key)?.label ?? humanize(key);
export const statusTone = (defs: StatusDef[], key: string): BadgeTone => COLOR_TONE[defs.find((d) => d.key === key)?.color ?? "gray"];
