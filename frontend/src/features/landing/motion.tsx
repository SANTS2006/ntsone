import * as React from "react";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasFinePointer() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

/** True once the element has scrolled into view (and stays true). */
export function useInView<T extends Element>(options: IntersectionObserverInit = { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }) {
  const ref = React.useRef<T>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, options);
    observer.observe(el);
    return () => observer.disconnect();
    // The options object is fixed for the element's lifetime.
  }, []);

  return [ref, inView] as const;
}

export type RevealVariant = "up" | "left" | "right" | "zoom" | "tilt";

/** Fades and moves its content in when scrolled into view; `delay` staggers siblings. */
export function Reveal({
  children,
  delay = 0,
  variant = "up",
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  variant?: RevealVariant;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn("reveal", `reveal-${variant}`, inView && "is-visible", className)}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** Tilts its content in 3D toward the pointer, with a soft moving highlight. */
export function Tilt({
  children,
  max = 10,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  max?: number;
  className?: string;
  innerClassName?: string;
}) {
  const inner = React.useRef<HTMLDivElement>(null);
  const glare = React.useRef<HTMLSpanElement>(null);
  const enabled = React.useRef(false);

  React.useEffect(() => {
    enabled.current = hasFinePointer() && !prefersReducedMotion();
  }, []);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled.current || !inner.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    inner.current.style.transform = `rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`;
    if (glare.current) {
      glare.current.style.opacity = "1";
      glare.current.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.28), transparent 55%)`;
    }
  };

  const onLeave = () => {
    if (inner.current) inner.current.style.transform = "";
    if (glare.current) glare.current.style.opacity = "0";
  };

  return (
    <div className={cn("[perspective:1100px]", className)} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div ref={inner} className={cn("relative transition-transform duration-300 ease-out [transform-style:preserve-3d]", innerClassName)}>
        {children}
        <span
          ref={glare}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300"
        />
      </div>
    </div>
  );
}

/**
 * How far the element has travelled through the viewport: 0 as it enters at the
 * bottom, 1 as it leaves at the top. Updated once per frame while scrolling.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const total = window.innerHeight + box.height;
      setProgress(Math.min(1, Math.max(0, (window.innerHeight - box.top) / total)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return [ref, progress] as const;
}

/** A 3D scene that turns gently toward the pointer; children place themselves with translateZ. */
export function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  const scene = React.useRef<HTMLDivElement>(null);
  const enabled = React.useRef(false);

  React.useEffect(() => {
    enabled.current = hasFinePointer() && !prefersReducedMotion();
  }, []);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled.current || !scene.current) return;
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    scene.current.style.transform = `rotateX(${(8 - y * 8).toFixed(2)}deg) rotateY(${(-14 + x * 12).toFixed(2)}deg)`;
  };

  return (
    <div className={cn("[perspective:1600px]", className)} onPointerMove={onMove}>
      <div ref={scene} className="stage-scene relative transition-transform duration-500 ease-out [transform-style:preserve-3d]">
        {children}
      </div>
    </div>
  );
}

/** Counts up to a number when scrolled into view; non-numeric values are shown as-is. */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const target = Number(value);
  const numeric = Number.isFinite(target) && value.trim() !== "";
  const [shown, setShown] = React.useState(numeric ? 0 : target);

  React.useEffect(() => {
    if (!numeric || !inView) return;
    if (prefersReducedMotion()) {
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / 1200);
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [inView, numeric, target]);

  return (
    <span ref={ref} className={className}>
      {numeric ? shown : value}
    </span>
  );
}
