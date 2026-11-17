import { cn } from "@/lib/utils";

/**
 * A picture that fills its (relatively positioned) parent without being cut off: the whole picture is shown, and
 * the space around it is filled with a soft blurred copy of the same picture, so it never looks letterboxed.
 */
export function CoverImage({ src, alt = "", className, loading }: { src: string; alt?: string; className?: string; loading?: "lazy" | "eager" }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <img src={src} alt="" aria-hidden="true" loading={loading} className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl" />
      <img src={src} alt={alt} loading={loading} className="relative h-full w-full object-contain drop-shadow-xl" />
    </div>
  );
}
