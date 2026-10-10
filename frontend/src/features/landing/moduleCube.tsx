import * as React from "react";
import { BookOpen, ClipboardList, FileText, Gift, IdCard, Receipt, ShoppingBag, Smartphone, Vote, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const MODULES: { icon: LucideIcon; name: string; line: string; face: string }[] = [
  { icon: ClipboardList, name: "Registrations", line: "Forms with smart logic, ID cards, tickets and check-ins.", face: "from-blue-500 to-sky-400" },
  { icon: Vote, name: "Voting polls", line: "Secret ballots, verified voters and live results.", face: "from-violet-500 to-fuchsia-400" },
  { icon: ShoppingBag, name: "Orders", line: "Branded order pages, your own statuses, customer emails.", face: "from-emerald-500 to-teal-400" },
  { icon: FileText, name: "Invoices", line: "Nine page styles, tax, PDF and email to the client.", face: "from-orange-500 to-amber-400" },
  { icon: Receipt, name: "Receipts and quotations", line: "Cash-book, till-slip and A4 layouts, in your colours.", face: "from-rose-500 to-pink-400" },
  { icon: IdCard, name: "Business cards", line: "Eight two-sided designs with a QR code, ready to print.", face: "from-cyan-500 to-indigo-400" },
];

// More modules that are listed beside the cube (it has six faces).
const MORE_MODULES: typeof MODULES = [
  { icon: Smartphone, name: "Payments", line: "Orange Money, Africell Money and QMoney, refunds, and a payment fund you can withdraw from.", face: "from-orange-500 to-rose-400" },
  { icon: Gift, name: "Wish List", line: "Private lists of what you want to buy, a gotten list with the price and date, and a budget that watches itself.", face: "from-pink-500 to-violet-500" },
  { icon: BookOpen, name: "Bookkeeping", line: "A cash book, loans, credit, profit and loss, and voice notes for anyone who finds writing hard.", face: "from-lime-500 to-emerald-400" },
];

// Where each face sits on the cube.
const TRANSFORMS = [
  "rotateY(0deg) translateZ(var(--half))",
  "rotateY(90deg) translateZ(var(--half))",
  "rotateY(180deg) translateZ(var(--half))",
  "rotateY(-90deg) translateZ(var(--half))",
  "rotateX(90deg) translateZ(var(--half))",
  "rotateX(-90deg) translateZ(var(--half))",
];

/** A slowly turning cube with one module on each face; hovering pauses it so a face can be read. */
export function ModuleCube() {
  return (
    <div className="module-cube-scene mx-auto" aria-hidden="true">
      <div className="module-cube-floor" />
      <div className="module-cube">
        {MODULES.map((m, i) => (
          <div key={m.name} className={cn("module-cube-face bg-gradient-to-br", m.face)} style={{ transform: TRANSFORMS[i] }}>
            <m.icon className="h-14 w-14 drop-shadow" strokeWidth={1.6} />
            <span className="px-3 text-center text-base font-bold leading-tight drop-shadow">{m.name}</span>
          </div>
        ))}
      </div>
      <style>{`
        .module-cube-scene{--size:220px;--half:110px;position:relative;width:var(--size);height:var(--size);perspective:900px}
        @media (min-width:640px){.module-cube-scene{--size:280px;--half:140px}}
        .module-cube{position:absolute;inset:0;transform-style:preserve-3d;animation:module-cube-spin 26s linear infinite}
        .module-cube-scene:hover .module-cube{animation-play-state:paused}
        .module-cube-face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#fff;border-radius:18px;border:1px solid rgba(255,255,255,.35);box-shadow:inset 0 0 40px rgba(255,255,255,.18);backface-visibility:hidden;-webkit-backface-visibility:hidden}
        .module-cube-floor{position:absolute;left:8%;right:8%;bottom:-46px;height:34px;border-radius:50%;background:rgba(37,99,235,.35);filter:blur(22px)}
        @keyframes module-cube-spin{from{transform:rotateX(-22deg) rotateY(0deg)}to{transform:rotateX(-22deg) rotateY(360deg)}}
        @media (prefers-reduced-motion: reduce){.module-cube{animation:none;transform:rotateX(-22deg) rotateY(-30deg)}}
      `}</style>
    </div>
  );
}

/** The same six modules as a readable list, for the side of the cube. */
export function ModuleList() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {[...MODULES, ...MORE_MODULES].map((m) => (
        <li key={m.name} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition hover:border-primary/40 hover:shadow-glow">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", m.face)}>
            <m.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{m.name}</p>
            <p className="text-sm text-muted-foreground">{m.line}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
