import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-20 w-20 text-2xl" }[size];

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(sizeClasses, "shrink-0 rounded-full object-cover ring-2 ring-white/70 dark:ring-white/10", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        sizeClasses,
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-brand font-semibold text-white shadow-sm",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
