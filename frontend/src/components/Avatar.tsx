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
    // The whole picture is shown inside the circle (nothing cut off); the space around it is a blurred copy.
    return (
      <span className={cn(sizeClasses, "relative inline-block shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-white/70 dark:ring-white/10", className)}>
        <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-125 object-cover blur-md" />
        <img src={src} alt={name} className="relative h-full w-full object-contain" />
      </span>
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
