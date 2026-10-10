import logoUrl from "@/assets/ntsone-logo.webp";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-8 w-8", logo: "w-[66%]", ring: "border-2" },
  md: { box: "h-12 w-12", logo: "w-[66%]", ring: "border-[3px]" },
  lg: { box: "h-20 w-20", logo: "w-[66%]", ring: "border-4" },
} as const;

/**
 * The application's logo inside a turning ring. It is what the app shows whenever something is loading, so people can
 * see that it is busy. The ring stops turning for people who asked their device for less motion.
 */
export function LogoSpinner({ size = "md", className }: { size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", s.box, className)} aria-hidden="true">
      <span className={cn("absolute inset-0 animate-spin rounded-full border-primary/15 border-t-primary border-r-primary/60 motion-reduce:animate-none", s.ring)} />
      <img src={logoUrl} alt="" width={420} height={258} decoding="async" draggable={false} className={cn("h-auto select-none object-contain animate-pulse motion-reduce:animate-none dark:[filter:drop-shadow(0_0_1px_rgba(255,255,255,0.9))_drop-shadow(0_0_4px_rgba(147,197,253,0.5))]", s.logo)} />
    </span>
  );
}

/**
 * A loading state for a page, a table or a card: the logo spinner and a short line saying what is loading.
 * `inline` is for the inside of a table row or a small box; otherwise it fills the space it is given with some room.
 */
export function Loading({ label = "Loading", inline = false, size, className }: { label?: string; inline?: boolean; size?: keyof typeof SIZES; className?: string }) {
  const text = label.replace(/\.+$/, "");
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground", inline ? "py-4" : "min-h-[30vh] py-10", className)}>
      <LogoSpinner size={size ?? (inline ? "sm" : "md")} />
      <span>{text}</span>
    </div>
  );
}

/** Covers the whole screen, for the very first load of the app or a page that has nothing to show yet. */
export function FullScreenLoading({ label = "Loading" }: { label?: string }) {
  return <Loading label={label} size="lg" className="min-h-screen" />;
}
