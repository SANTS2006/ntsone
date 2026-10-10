import * as React from "react";
import { cn } from "@/lib/utils";

const ALLOWED = /[A-Za-z0-9]/;

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

/** One box per character; supports typing, backspace/arrow navigation, and pasting the whole code. */
export function CodeInput({ value, onChange, onComplete, length = 6, disabled, autoFocus }: CodeInputProps) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const chars = Array.from({ length }, (_, i) => value[i] ?? "");

  const focusBox = (index: number) => refs.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  const commit = (next: string) => {
    const clean = next.toUpperCase().slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const handleChange = (index: number, raw: string) => {
    const typed = raw.split("").filter((c) => ALLOWED.test(c)).join("");
    if (!typed) return;
    // Typing into a filled box replaces it; multi-char input (autofill) spreads across boxes.
    const next = (value.slice(0, index) + typed + value.slice(index + typed.length)).slice(0, length);
    commit(next);
    focusBox(index + typed.length);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (chars[index]) {
        commit(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").split("").filter((c) => ALLOWED.test(c)).join("");
    if (!pasted) return;
    commit(pasted);
    focusBox(pasted.length);
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {chars.map((char, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={char}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="text"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={length}
          aria-label={`Character ${i + 1} of ${length}`}
          className={cn(
            "h-12 w-10 rounded-xl border border-input bg-background text-center tabular-nums text-xl font-bold uppercase text-foreground shadow-sm transition-all sm:h-14 sm:w-12 sm:text-2xl",
            "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40",
            char && "border-primary/60 bg-gradient-brand-soft text-primary",
            disabled && "opacity-60",
          )}
        />
      ))}
    </div>
  );
}
