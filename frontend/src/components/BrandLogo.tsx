import logoUrl from "@/assets/ntsone-logo.webp";
import { cn } from "@/lib/utils";

/**
 * The NTSOne logo (420x258), sized by height so its aspect ratio is kept. Its darkest blues would sink into a dark
 * background, so in dark mode it gets a soft light outline.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt=""
      width={420}
      height={258}
      decoding="async"
      className={cn("h-8 w-auto shrink-0 select-none object-contain dark:[filter:drop-shadow(0_0_1px_rgba(255,255,255,0.9))_drop-shadow(0_0_5px_rgba(147,197,253,0.55))]", className)}
      draggable={false}
    />
  );
}
