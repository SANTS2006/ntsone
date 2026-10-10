import * as React from "react";
import { BarChart3, CheckCircle2, ListPlus, PackageCheck, PiggyBank, Sparkles, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal, Stage, Tilt } from "./motion";

/** A layer in a 3D scene: raised to `depth` and bobbing gently. */
function Layer({ depth, delay = 0, className, children }: { depth: number; delay?: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("depth absolute", className)} style={{ "--depth": `${depth}px` } as React.CSSProperties}>
      <div className="float" style={{ "--float-delay": `${-delay}s` } as React.CSSProperties}>
        {children}
      </div>
    </div>
  );
}

const WISHED = [
  { name: "Chairs", detail: "4 x NLe 500.00", tag: "Furniture" },
  { name: "Curtains", detail: "No price yet", tag: "Home" },
];
const GOTTEN = [
  { name: "Lamp", detail: "Paid NLe 90.00", date: "2 Oct" },
  { name: "Rug", detail: "Paid NLe 260.00", date: "28 Sep" },
];

// Where the confetti flies, as [x, y] in pixels, when the card lands.
const CONFETTI: [number, number, string][] = [
  [-46, -38, "bg-pink-400"],
  [-18, -58, "bg-amber-400"],
  [22, -52, "bg-sky-400"],
  [50, -30, "bg-emerald-400"],
  [58, 6, "bg-violet-400"],
  [-56, 4, "bg-rose-400"],
  [-30, 34, "bg-teal-400"],
  [34, 36, "bg-orange-400"],
];

/**
 * The wish list at work: an item lifts off the wish list, turns over in the air and lands in the gotten list with its
 * price paid and the money saved, while a budget ring fills, a gift box turns and confetti pops. Pure CSS, looping,
 * and still (landed) for people who asked for less motion.
 */
export function WishlistScene() {
  return (
    <Stage className="relative mx-auto w-full max-w-lg">
      <div className="wl-scene relative h-[27rem] sm:h-[34rem]">
        {/* The board: two panels */}
        <div className="depth absolute left-1/2 top-6 w-[21rem] -translate-x-1/2 sm:w-[25rem]" style={{ "--depth": "0px" } as React.CSSProperties}>
          <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-2xl shadow-pink-900/20">
            <div className="flex items-center gap-2 border-b border-border/70 bg-gradient-to-r from-pink-500/15 via-violet-500/10 to-transparent px-4 py-3 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-pink-500" aria-hidden="true" />
              Home
              <span className="ml-auto rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Budget NLe 10,000</span>
            </div>

            <div className="relative grid grid-cols-2 gap-3 p-3">
              {/* Wish list panel */}
              <div className="flex flex-col gap-2">
                <p className="flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Wish list
                  <span className="relative inline-block h-4 w-4 text-center text-foreground">
                    <span className="wl-count-a absolute inset-0">3</span>
                    <span className="wl-count-b absolute inset-0">2</span>
                  </span>
                </p>
                <div className="wl-slot h-[3.6rem] rounded-xl border-2 border-dashed border-pink-400/40" aria-hidden="true" />
                {WISHED.map((row) => (
                  <div key={row.name} className="rounded-xl border border-border/70 bg-background/60 px-2.5 py-2 text-xs">
                    <p className="truncate font-semibold">{row.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{row.detail}</p>
                  </div>
                ))}
              </div>

              {/* Gotten panel */}
              <div className="flex flex-col gap-2">
                <p className="flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Gotten
                  <span className="relative inline-block h-4 w-4 text-center text-foreground">
                    <span className="wl-count-a absolute inset-0">2</span>
                    <span className="wl-count-b absolute inset-0">3</span>
                  </span>
                </p>
                <div className="wl-slot h-[3.6rem] rounded-xl border-2 border-dashed border-emerald-400/40" aria-hidden="true" />
                {GOTTEN.map((row) => (
                  <div key={row.name} className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-2 text-xs">
                    <p className="flex items-center gap-1 truncate font-semibold">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden="true" />
                      {row.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {row.detail} · {row.date}
                    </p>
                  </div>
                ))}
              </div>

              {/* The traveller: it starts in the wish list slot and ends in the gotten slot, turning over on the way. */}
              <div className="wl-traveler pointer-events-none absolute left-3 top-[3.05rem] w-[calc(50%-1.125rem)]" aria-hidden="true">
                <div className="wl-flip relative h-[3.6rem] [transform-style:preserve-3d]">
                  <div className="face absolute inset-0 flex flex-col justify-center rounded-xl border border-pink-400/50 bg-card px-2.5 text-xs shadow-lg">
                    <p className="truncate font-semibold">Sofa</p>
                    <p className="truncate text-[11px] text-muted-foreground">Expected NLe 4,000.00</p>
                    <span className="mt-0.5 inline-flex w-fit rounded-full bg-gradient-to-r from-pink-500 to-violet-500 px-2 py-px text-[9px] font-bold text-white">Got it</span>
                  </div>
                  <div className="face wl-back absolute inset-0 flex flex-col justify-center rounded-xl border border-emerald-500/60 bg-gradient-to-br from-emerald-500 to-teal-500 px-2.5 text-xs text-white shadow-lg">
                    <p className="flex items-center gap-1 truncate font-semibold">
                      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Sofa
                    </p>
                    <p className="truncate text-[11px] text-white/90">Paid NLe 3,800 · 9 Oct</p>
                    <span className="mt-0.5 inline-flex w-fit rounded-full bg-white/25 px-2 py-px text-[9px] font-bold">Saved NLe 200</span>
                  </div>
                </div>
              </div>

              {/* Confetti where it lands */}
              <div className="wl-confetti pointer-events-none absolute right-[calc(25%-0.4rem)] top-[4.6rem]" aria-hidden="true">
                {CONFETTI.map(([x, y, color], i) => (
                  <span key={i} className={cn("wl-bit absolute block h-1.5 w-1.5 rounded-full", color)} style={{ "--dx": `${x}px`, "--dy": `${y}px` } as React.CSSProperties} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Floating layers */}
        <Layer depth={130} delay={1} className="-right-2 -top-1 w-44 sm:-right-6">
          <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-2xl shadow-violet-900/20">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0 -rotate-90" aria-hidden="true">
                <circle cx="32" cy="32" r="26" fill="none" strokeWidth="7" className="stroke-muted" />
                <circle cx="32" cy="32" r="26" fill="none" strokeWidth="7" strokeLinecap="round" className="wl-ring stroke-pink-500" strokeDasharray="163.4" />
              </svg>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Budget</p>
                <p className="text-sm font-bold tabular-nums">NLe 3,800</p>
                <p className="text-[11px] text-muted-foreground">of 10,000 spent</p>
              </div>
            </div>
          </div>
        </Layer>

        <Layer depth={170} delay={3} className="-left-1 bottom-6 sm:-left-5">
          <GiftBox />
        </Layer>

        <Layer depth={100} delay={5} className="right-0 bottom-3 hidden sm:block">
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-card px-3 py-2 text-xs shadow-xl">
            <PiggyBank className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            <span>
              <span className="block font-semibold">Saved NLe 200</span>
              <span className="block text-[11px] text-muted-foreground">on this list so far</span>
            </span>
          </div>
        </Layer>

        <Layer depth={110} delay={4} className="-left-6 top-24 hidden sm:block">
          <ShareCard />
        </Layer>

        <Layer depth={80} delay={2} className="left-4 top-0 hidden sm:block">
          <div className="rounded-full border border-pink-400/40 bg-card px-3 py-1 text-[11px] font-semibold shadow-lg">
            <span className="text-pink-500">x4</span> Chairs, NLe 500 each
          </div>
        </Layer>
      </div>

      <style>{`
        .wl-traveler{animation:wl-fly 8s cubic-bezier(.45,.05,.25,1) infinite;transform-style:preserve-3d;will-change:transform,opacity}
        .wl-flip{animation:wl-turn 8s cubic-bezier(.45,.05,.25,1) infinite}
        .wl-back{transform:rotateY(180deg)}
        .wl-traveler .face{backface-visibility:hidden;-webkit-backface-visibility:hidden}
        @keyframes wl-fly{
          0%{opacity:0;transform:translate3d(0,6px,0) scale(.96)}
          6%,14%{opacity:1;transform:translate3d(0,0,0) scale(1)}
          26%{transform:translate3d(0,-6px,70px) scale(1.06) rotateZ(-2deg)}
          46%{transform:translate3d(calc(50% + .375rem),-52px,110px) scale(1.08) rotateZ(2deg)}
          64%{transform:translate3d(calc(100% + .75rem),-4px,40px) scale(1.03) rotateZ(0deg)}
          70%,92%{opacity:1;transform:translate3d(calc(100% + .75rem),0,0) scale(1)}
          100%{opacity:0;transform:translate3d(calc(100% + .75rem),0,0) scale(.98)}
        }
        @keyframes wl-turn{0%,24%{transform:rotateY(0deg)}56%,100%{transform:rotateY(180deg)}}

        .wl-count-a{animation:wl-count-out 8s linear infinite}
        .wl-count-b{animation:wl-count-in 8s linear infinite}
        @keyframes wl-count-out{0%,63%{opacity:1}67%,92%{opacity:0}100%{opacity:1}}
        @keyframes wl-count-in{0%,63%{opacity:0}67%,92%{opacity:1}100%{opacity:0}}

        .wl-bit{opacity:0;animation:wl-pop 8s ease-out infinite}
        @keyframes wl-pop{
          0%,63%{opacity:0;transform:translate(0,0) scale(.4)}
          66%{opacity:1}
          80%{opacity:1;transform:translate(var(--dx),var(--dy)) scale(1)}
          90%,100%{opacity:0;transform:translate(calc(var(--dx)*1.25),calc(var(--dy)*1.25 + 14px)) scale(.6)}
        }

        .wl-ring{animation:wl-fill 8s ease-in-out infinite}
        @keyframes wl-fill{0%,10%{stroke-dashoffset:163.4}20%,60%{stroke-dashoffset:119}70%,92%{stroke-dashoffset:101}100%{stroke-dashoffset:163.4}}

        .wl-gift{position:relative;width:64px;height:64px;transform-style:preserve-3d;animation:wl-gift-spin 14s linear infinite}
        .wl-gift-face{position:absolute;inset:0;border-radius:6px;border:1px solid rgba(255,255,255,.4);background-color:#ec4899;background-image:linear-gradient(135deg,rgba(255,255,255,.22),rgba(0,0,0,.12)),linear-gradient(90deg,transparent 42%,#fde68a 42%,#fde68a 58%,transparent 58%)}
        .wl-gift-top{background-image:linear-gradient(135deg,rgba(255,255,255,.3),rgba(0,0,0,.05)),linear-gradient(90deg,transparent 42%,#fde68a 42%,#fde68a 58%,transparent 58%),linear-gradient(0deg,transparent 42%,#fde68a 42%,#fde68a 58%,transparent 58%)}
        @keyframes wl-gift-spin{from{transform:rotateX(-24deg) rotateY(0deg)}to{transform:rotateX(-24deg) rotateY(360deg)}}

        @media (prefers-reduced-motion: reduce){
          .wl-traveler,.wl-flip,.wl-count-a,.wl-count-b,.wl-bit,.wl-ring,.wl-gift{animation:none}
          .wl-traveler{opacity:1;transform:translate3d(calc(100% + .75rem),0,0)}
          .wl-flip{transform:rotateY(180deg)}
          .wl-count-a{opacity:0}.wl-count-b{opacity:1}
          .wl-ring{stroke-dashoffset:101}
          .wl-gift{transform:rotateX(-24deg) rotateY(-30deg)}
        }
      `}</style>
    </Stage>
  );
}

// A small QR-style pattern (a picture, not a real code) for the share card.
const QR_PATTERN = [
  "111111101011111",
  "100000101010001",
  "101110100111101",
  "101110101001101",
  "101110110101101",
  "100000100110001",
  "111111101010111",
  "000000000101000",
  "110101110011010",
  "001011001101101",
  "111000111010011",
];

/** A card showing a wish list shared with someone by a private link and QR code. */
function ShareCard() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-violet-400/30 bg-card p-3 shadow-xl" aria-hidden="true">
      <div className="rounded-lg bg-white p-1.5 shadow-inner">
        <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(15, 3px)" }}>
          {QR_PATTERN.flatMap((row, y) => row.split("").map((c, x) => <span key={`${y}-${x}`} className={cn("block h-[3px] w-[3px]", c === "1" ? "bg-slate-900" : "bg-white")} />))}
        </div>
      </div>
      <div className="min-w-0 text-xs">
        <p className="flex items-center gap-1 font-semibold">
          <Users className="h-3.5 w-3.5 text-violet-500" />
          Shared with Mama
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Can view · no account</p>
        <span className="mt-1 inline-flex rounded-full bg-gradient-to-r from-pink-500 to-violet-500 px-2 py-px text-[9px] font-bold text-white">Link + QR</span>
      </div>
    </div>
  );
}

/** A little gift box that turns slowly. */
function GiftBox() {
  const half = 32;
  const faces = [
    `rotateY(0deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
  ];
  return (
    <div className="[perspective:600px]" aria-hidden="true">
      <div className="wl-gift">
        {faces.map((transform, i) => (
          <div key={i} className={cn("wl-gift-face", i === 4 && "wl-gift-top")} style={{ transform }} />
        ))}
      </div>
      <div className="mx-auto mt-3 h-3 w-14 rounded-full bg-pink-500/30 blur-md" />
    </div>
  );
}

const WISH_POINTS = [
  { icon: ListPlus, title: "Add one item or fifty", text: "Type rows or paste a list. Quantity and price are optional, and you can fill them in later." },
  { icon: PackageCheck, title: "Got it? Record it", text: "Press Got it, then write the price you paid, the date and where from. It moves to your gotten list." },
  { icon: Wallet, title: "A budget that watches itself", text: "Set a limit for a list and see what is spent, what is still expected, and a warning before you go over." },
  { icon: Users, title: "Share it by link or QR code", text: "Invite family or friends with a private link. Choose view-only or edit access. They need no account and see only that one list." },
];

export function WishlistPoints() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {WISH_POINTS.map((p, i) => (
        <Reveal key={p.title} delay={i * 100} variant="zoom">
          <li className="flex h-full gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition hover:border-pink-400/50 hover:shadow-glow">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 text-white shadow-md">
              <p.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">{p.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
            </div>
          </li>
        </Reveal>
      ))}
    </ul>
  );
}

const JOURNEY = [
  { icon: ListPlus, label: "Wish", title: "Write it down", text: "Sofa, 4 chairs, curtains. Add a price if you know it, and a priority so the important things come first.", tone: "from-pink-500 to-rose-400" },
  { icon: PackageCheck, label: "Get", title: "Mark it gotten", text: "When you buy it, record what you really paid and the day. See at once if you saved or paid extra.", tone: "from-violet-500 to-fuchsia-400" },
  { icon: BarChart3, label: "Look back", title: "See where it went", text: "Spending by category and by month, what is left of the budget, and a record of every step.", tone: "from-sky-500 to-indigo-400" },
];

/** Three cards that tilt toward the pointer, joined by a line a dot travels along: wish, get, look back. */
export function WishJourney() {
  return (
    <div className="relative">
      <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-1/2 hidden h-px -translate-y-1/2 border-t-2 border-dashed border-pink-400/40 lg:block">
        <span className="wl-dot absolute -top-[5px] h-2.5 w-2.5 rounded-full bg-pink-500 shadow-[0_0_14px_rgba(236,72,153,.8)]" />
      </div>
      <div className="relative grid gap-6 lg:grid-cols-3">
        {JOURNEY.map((step, i) => (
          <Reveal key={step.label} delay={i * 140} variant="tilt">
            <Tilt max={9} innerClassName="rounded-3xl">
              <div className="relative flex h-full flex-col gap-3 rounded-3xl border border-border/70 bg-card p-6 shadow-lg">
                <span className={cn("absolute -top-4 left-6 rounded-full bg-gradient-to-r px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md", step.tone)}>
                  {i + 1}. {step.label}
                </span>
                <span className={cn("mt-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg [transform:translateZ(40px)]", step.tone)}>
                  <step.icon className="h-7 w-7" />
                </span>
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            </Tilt>
          </Reveal>
        ))}
      </div>
      <style>{`
        .wl-dot{animation:wl-travel 6s ease-in-out infinite}
        @keyframes wl-travel{0%{left:0;opacity:0}8%{opacity:1}92%{opacity:1}100%{left:calc(100% - 10px);opacity:0}}
        @media (prefers-reduced-motion: reduce){.wl-dot{animation:none;left:50%}}
      `}</style>
    </div>
  );
}
