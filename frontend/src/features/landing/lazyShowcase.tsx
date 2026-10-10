import * as React from "react";

// The design samples need the whole card and ticket design library, so they download after the
// rest of the landing page instead of holding up its first paint.
const load = () => import("./designShowcase");

function lazyNamed(name: "HeroTicket" | "HeroIdCard" | "DocumentsShowcase" | "DesignCarousel") {
  return React.lazy(() => load().then((m) => ({ default: m[name] })));
}

const HeroTicketLazy = lazyNamed("HeroTicket");
const HeroIdCardLazy = lazyNamed("HeroIdCard");
const DocumentsShowcaseLazy = lazyNamed("DocumentsShowcase");
const DesignCarouselLazy = lazyNamed("DesignCarousel");

export function HeroTicket() {
  return (
    <React.Suspense fallback={<div className="aspect-[3/1] w-full" />}>
      <HeroTicketLazy />
    </React.Suspense>
  );
}

export function HeroIdCard() {
  return (
    <React.Suspense fallback={<div className="aspect-[300/476] w-full" />}>
      <HeroIdCardLazy />
    </React.Suspense>
  );
}

export function DocumentsShowcase() {
  return (
    <React.Suspense fallback={<div className="mx-auto min-h-[420px] w-full max-w-xl" aria-busy="true" />}>
      <DocumentsShowcaseLazy />
    </React.Suspense>
  );
}

export function DesignCarousel() {
  return (
    <React.Suspense fallback={<div className="min-h-[900px] w-full" aria-busy="true" />}>
      <DesignCarouselLazy />
    </React.Suspense>
  );
}

// The document and card showcases draw real samples with the design library, so they load lazily too.
const loadDocs = () => import("./documentShowcase3d");
const DocumentStack3DLazy = React.lazy(() => loadDocs().then((m) => ({ default: m.DocumentStack3D })));
const FlipCard3DLazy = React.lazy(() => loadDocs().then((m) => ({ default: m.FlipCard3D })));

export function DocumentStack3D() {
  return (
    <React.Suspense fallback={<div className="mx-auto h-[480px] w-full max-w-5xl" aria-busy="true" />}>
      <DocumentStack3DLazy />
    </React.Suspense>
  );
}

export function FlipCard3D() {
  return (
    <React.Suspense fallback={<div className="mx-auto aspect-[504/288] w-full max-w-md" aria-busy="true" />}>
      <FlipCard3DLazy />
    </React.Suspense>
  );
}
