import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DesignSvg } from "./DesignSvg";

export interface DesignOption {
  id: string;
  name: string;
  svg: string;
}

/** Thumbnails of the built-in designs; extra tiles (like "upload your own") go in `children`. */
export function DesignGallery({
  options,
  selected,
  onSelect,
  columns,
  children,
}: {
  options: DesignOption[];
  selected: string;
  onSelect: (id: string) => void;
  columns: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-3", columns)} role="radiogroup" aria-label="Design">
      {options.map((option) => {
        const active = option.id === selected;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(option.id)}
            className={cn(
              "group relative flex flex-col gap-1.5 rounded-xl border p-2 text-left transition-all duration-200",
              active
                ? "border-primary bg-gradient-brand-soft shadow-md"
                : "border-border hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
            )}
          >
            <DesignSvg svg={option.svg} label={`${option.name} design`} className="rounded-md ring-1 ring-black/5" />
            <span className="flex items-center justify-between px-0.5 text-xs font-medium">
              {option.name}
              {active && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </span>
          </button>
        );
      })}
      {children}
    </div>
  );
}
