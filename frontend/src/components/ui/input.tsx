import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, min, maxLength, onKeyDown, ...props }, ref) => {
    const isNumber = type === "number";
    // Plain text fields have a sensible limit unless a field says otherwise.
    const textual = type === undefined || type === "text" || type === "email" || type === "tel" || type === "url" || type === "search";
    return (
    <input
      type={type}
      ref={ref}
      // Number fields never go below zero unless the field asks for a different floor, and the keys that make a
      // negative, exponent or signed number can't be typed.
      min={isNumber ? (min ?? 0) : min}
      maxLength={maxLength ?? (textual ? 500 : undefined)}
      onKeyDown={(event) => {
        if (isNumber && ["-", "+", "e", "E"].includes(event.key)) event.preventDefault();
        onKeyDown?.(event);
      }}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
        className,
      )}
      {...props}
    />
    );
  },
);
Input.displayName = "Input";
