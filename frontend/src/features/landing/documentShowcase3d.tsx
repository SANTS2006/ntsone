import * as React from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import {
  CARD_TEMPLATES,
  defaultDocumentSettings,
  renderBusinessCard,
  renderBusinessDocument,
  sampleQrMatrix,
  type BusinessDocumentKind,
  type CardTemplate,
  type DocumentTemplate,
} from "@designs";
import { cn } from "@/lib/utils";
import { DesignSvg } from "../designs/DesignSvg";

// Landing-page showcases drawn with the same code that makes the real PDFs, so what visitors see
// is exactly what a business gets. They need the whole design library, so they load lazily
// (see lazyShowcase.tsx).

const BUSINESS = {
  name: "Freetown Tech Solutions",
  logo: null,
  email: "hello@freetowntech.sl",
  phone: "+232 73 031 533",
  address: "12 Siaka Stevens Street, Freetown",
  website: "www.freetowntech.sl",
  taxNumber: null,
};

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function documentSvg(kind: BusinessDocumentKind, template: DocumentTemplate, accent: string): string {
  const settings = { ...defaultDocumentSettings(kind, accent), template, showLogo: false };
  const client = kind === "quotation" ? "Bright Futures Foundation" : "Mariama Sesay";
  return renderBusinessDocument(
    {
      kind,
      number: `${settings.prefix}-0042`,
      status: kind === "receipt" ? "issued" : kind === "invoice" ? "partially_paid" : "accepted",
      issueDate: new Date("2026-10-01"),
      dueDate: new Date("2026-10-31"),
      paymentMethod: kind === "receipt" ? "Orange Money" : null,
      client: { name: client, email: "accounts@client.org", phone: "076 123 456", address: "12 Wilkinson Road, Freetown" },
      items: [
        { description: "Website design and development", quantity: 1, unitPrice: 4500 },
        { description: "Printed ID cards", quantity: 120, unitPrice: 15 },
        { description: "Branded business cards", quantity: 4, unitPrice: 250 },
      ],
      discount: 100,
      taxRate: 5,
      amountPaid: kind === "quotation" ? 0 : 3000,
      notes: settings.defaultNotes,
      terms: settings.defaultTerms,
      customFields: [],
      currency: "SLE",
    },
    BUSINESS,
    settings,
  )[0]!;
}

interface Slide {
  id: string;
  label: string;
  svg: string;
  /** Width over height of the drawing. */
  ratio: number;
}

function ratioOf(svg: string) {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return Number(match?.[1] ?? 1) / Number(match?.[2] ?? 1);
}

const slide = (id: string, label: string, svg: string): Slide => ({ id, label, svg, ratio: ratioOf(svg) });

const GROUPS: { id: string; label: string; make: () => Slide[] }[] = [
  {
    id: "invoices",
    label: "Invoices",
    make: () => [
      slide("inv-wave", "Wave", documentSvg("invoice", "wave", "#2563eb")),
      slide("inv-bold", "Bold", documentSvg("invoice", "bold", "#ea580c")),
      slide("inv-corner", "Corner", documentSvg("invoice", "corner", "#dc2626")),
      slide("inv-soft", "Soft", documentSvg("invoice", "soft", "#0d9488")),
      slide("inv-diag", "Diagonal", documentSvg("invoice", "diagonal", "#7c3aed")),
    ],
  },
  {
    id: "quotations",
    label: "Quotations",
    make: () => [
      slide("quo-classic", "Classic", documentSvg("quotation", "classic", "#2563eb")),
      slide("quo-stripe", "Stripe", documentSvg("quotation", "stripe", "#9333ea")),
      slide("quo-modern", "Modern", documentSvg("quotation", "modern", "#0f766e")),
      slide("quo-wave", "Wave", documentSvg("quotation", "wave", "#c2410c")),
    ],
  },
  {
    id: "receipts",
    label: "Receipts",
    make: () => [
      slide("rct-cash", "Cash book", documentSvg("receipt", "cashbook", "#2563eb")),
      slide("rct-slip", "Till slip", documentSvg("receipt", "slip", "#111827")),
      slide("rct-wave", "Cash book wave", documentSvg("receipt", "cashbook-wave", "#16a34a")),
      slide("rct-bold", "Bold slip", documentSvg("receipt", "slip-bold", "#dc2626")),
      slide("rct-stripe", "Cash book stripe", documentSvg("receipt", "cashbook-stripe", "#b91c1c")),
    ],
  },
];

/** A coverflow of real sample documents that fans out in 3D; it turns by itself, or by hand. */
export function DocumentStack3D() {
  const [group, setGroup] = React.useState(0);
  const slides = React.useMemo(() => GROUPS[group]!.make(), [group]);
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const stage = React.useRef<HTMLDivElement>(null);
  const scene = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setActive(Math.floor(slides.length / 2)), [slides]);

  React.useEffect(() => {
    if (paused || reducedMotion()) return;
    const timer = window.setInterval(() => setActive((a) => (a + 1) % slides.length), 3400);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  const move = (by: number) => setActive((a) => (a + by + slides.length) % slides.length);

  const onPointerMove = (e: React.PointerEvent) => {
    if (reducedMotion() || e.pointerType === "touch") return;
    const box = stage.current?.getBoundingClientRect();
    if (!box || !scene.current) return;
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    scene.current.style.transform = `rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg)`;
  };
  const resetTilt = () => {
    if (scene.current) scene.current.style.transform = "rotateX(0deg) rotateY(0deg)";
    setPaused(false);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div role="tablist" aria-label="Kinds of documents" className="flex flex-wrap justify-center gap-2 rounded-full border border-border/70 bg-card/70 p-1.5 backdrop-blur">
        {GROUPS.map((g, i) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={group === i}
            type="button"
            onClick={() => setGroup(i)}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold transition-all",
              group === i ? "bg-gradient-brand text-white shadow-glow" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div
        ref={stage}
        className="relative h-[380px] w-full max-w-5xl select-none sm:h-[480px]"
        style={{ perspective: "1500px" }}
        onPointerMove={onPointerMove}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={resetTilt}
        aria-roledescription="carousel"
        aria-label={`${GROUPS[group]!.label} layouts`}
      >
        {/* A soft floor glow under the stack */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] bottom-2 h-10 rounded-[50%] bg-primary/25 blur-2xl" />
        <div ref={scene} className="absolute inset-0 transition-transform duration-300 ease-out" style={{ transformStyle: "preserve-3d" }}>
          {slides.map((s, i) => {
            let d = i - active;
            // Wrap around so the nearest copy sits beside the front one.
            if (d > slides.length / 2) d -= slides.length;
            if (d < -slides.length / 2) d += slides.length;
            const distance = Math.abs(d);
            const height = s.ratio < 1 ? 420 : s.ratio < 1.3 ? 300 : 200;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${s.label} layout${d === 0 ? " (showing)" : ""}`}
                tabIndex={distance > 2 ? -1 : 0}
                className="absolute left-1/2 top-1/2 block cursor-pointer rounded-md border-0 bg-white p-0 shadow-2xl ring-1 ring-black/10 transition-all duration-700 ease-out will-change-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/60"
                style={{
                  height: `min(${height}px, 78%)`,
                  aspectRatio: String(s.ratio),
                  transform: `translate(-50%, -50%) translateX(${d * 46}%) translateZ(${-distance * 140}px) rotateY(${d * -32}deg) scale(${1 - distance * 0.05})`,
                  zIndex: 20 - distance,
                  opacity: distance > 2 ? 0 : 1 - distance * 0.18,
                  filter: distance === 0 ? "none" : `brightness(${1 - distance * 0.12})`,
                  pointerEvents: distance > 2 ? "none" : "auto",
                  transformStyle: "preserve-3d",
                }}
              >
                <DesignSvg svg={s.svg} label={`${s.label} ${GROUPS[group]!.label.toLowerCase()} sample`} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-md bg-gradient-to-br from-white/25 via-transparent to-black/10"
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button type="button" aria-label="Previous layout" onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-sm transition hover:border-primary/50 hover:text-primary">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="min-w-40 text-center text-sm font-semibold" aria-live="polite">
          {slides[active]?.label} <span className="font-normal text-muted-foreground">· {active + 1} of {slides.length}</span>
        </p>
        <button type="button" aria-label="Next layout" onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-sm transition hover:border-primary/50 hover:text-primary">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const QR = sampleQrMatrix();

function cardSides(template: CardTemplate) {
  const info = CARD_TEMPLATES.find((t) => t.id === template)!;
  return renderBusinessCard(
    {
      name: "Aminata Kamara",
      title: "Chief Executive Officer",
      company: "Freetown Tech Solutions",
      phone: "+232 73 031 533",
      email: "aminata@freetowntech.sl",
      website: "www.freetowntech.sl",
      address: "12 Siaka Stevens Street, Freetown",
      tagline: "Technology that works",
      qr: QR,
    },
    { template, primaryColor: info.primary, secondaryColor: info.secondary },
  );
}

/** A business card that floats, tilts toward the pointer, and flips between its front and back. */
export function FlipCard3D() {
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const holder = React.useRef<HTMLDivElement>(null);
  const template = CARD_TEMPLATES[index]!;
  const sides = React.useMemo(() => cardSides(template.id), [template.id]);

  React.useEffect(() => {
    if (paused || reducedMotion()) return;
    const timer = window.setInterval(() => setFlipped((f) => !f), 3200);
    return () => window.clearInterval(timer);
  }, [paused]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (reducedMotion() || e.pointerType === "touch" || !holder.current) return;
    const box = holder.current.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    holder.current.style.transform = `rotateX(${(-y * 16).toFixed(2)}deg) rotateY(${(x * 20).toFixed(2)}deg)`;
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className="relative w-full max-w-md"
        style={{ perspective: "1400px" }}
        onPointerMove={onPointerMove}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => {
          setPaused(false);
          if (holder.current) holder.current.style.transform = "rotateX(0deg) rotateY(0deg)";
        }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-[10%] -bottom-6 h-8 rounded-[50%] bg-black/30 blur-xl" />
        <div ref={holder} className="transition-transform duration-300 ease-out" style={{ transformStyle: "preserve-3d" }}>
          <div className="landing-float" style={{ transformStyle: "preserve-3d" }}>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              aria-label={flipped ? "Showing the back of the card. Flip to the front" : "Showing the front of the card. Flip to the back"}
              className="relative block w-full cursor-pointer rounded-2xl border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/60"
              style={{
                aspectRatio: "504 / 288",
                transformStyle: "preserve-3d",
                transition: "transform 900ms cubic-bezier(.2,.8,.2,1)",
                transform: `rotateY(${flipped ? 180 : 0}deg)`,
              }}
            >
              {/* Edge of the card, so it has some thickness as it turns */}
              <span aria-hidden="true" className="absolute inset-0 rounded-2xl bg-slate-300" style={{ transform: "translateZ(-3px)" }} />
              <span aria-hidden="true" className="absolute inset-0 rounded-2xl bg-slate-400" style={{ transform: "translateZ(-6px)" }} />
              <DesignSvg
                svg={sides[0]}
                label={`${template.name} business card, front`}
                className="flip-face absolute inset-0 rounded-2xl shadow-2xl ring-1 ring-black/10"
              />
              <DesignSvg
                svg={sides[1]}
                label={`${template.name} business card, back`}
                className="flip-face flip-back absolute inset-0 rounded-2xl shadow-2xl ring-1 ring-black/10"
              />
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .landing-float{animation:landing-float 6s ease-in-out infinite}
        @keyframes landing-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @media (prefers-reduced-motion: reduce){.landing-float{animation:none}}
        .flip-face{backface-visibility:hidden;-webkit-backface-visibility:hidden}
        .flip-back{transform:rotateY(180deg)}
      `}</style>

      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Business card designs">
        {CARD_TEMPLATES.map((t, i) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={i === index}
            onClick={() => {
              setIndex(i);
              setFlipped(false);
            }}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              i === index ? "border-primary bg-gradient-brand-soft text-primary" : "border-border/70 bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            <span aria-hidden="true" className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: `linear-gradient(135deg, ${t.primary} 50%, ${t.secondary} 50%)` }} />
            {t.name}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setFlipped((f) => !f)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Flip the card
      </button>
    </div>
  );
}
