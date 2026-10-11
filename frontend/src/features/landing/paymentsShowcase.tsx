import * as React from "react";
import { BadgeCheck, CheckCircle2, Coins, Landmark, Lock, Mic, ScrollText, Smartphone, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal, Stage } from "./motion";

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

function Coin({ size, className }: { size: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block rounded-full border border-white/40 bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-[0_10px_24px_rgba(180,83,9,0.35),inset_0_2px_4px_rgba(255,255,255,0.7)]", className)}
      style={{ width: size, height: size }}
    >
      <span className="m-auto mt-[22%] block rounded-full border border-amber-700/30" style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}

const MOMO = [
  { name: "Orange Money", dot: "bg-orange-500" },
  { name: "Africell Money", dot: "bg-sky-500" },
  { name: "QMoney", dot: "bg-emerald-500" },
];

/** A phone showing an order being paid for, with a payment fund card and a "payment received" notice floating around it. */
export function PaymentsScene() {
  return (
    <Stage className="relative mx-auto w-full max-w-md">
      <div className="relative h-[30rem] sm:h-[34rem]">
      <div className="depth absolute left-1/2 top-4 w-64 -translate-x-1/2 sm:w-72" style={{ "--depth": "0px" } as React.CSSProperties}>
        <div className="rounded-[2.4rem] border-[7px] border-slate-900 bg-slate-900 shadow-2xl shadow-blue-900/30 dark:border-slate-700">
          <div className="overflow-hidden rounded-[1.9rem] bg-background">
            <div className="mx-auto mt-2 h-1.5 w-16 rounded-full bg-slate-300 dark:bg-slate-700" />
            <div className="flex flex-col gap-3 px-4 pb-5 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review your order</p>
              <div className="rounded-xl border border-border/70 bg-card p-3 text-sm">
                {[
                  ["2 × Rice (25 kg)", "NLe 700.00"],
                  ["1 × Cooking oil", "NLe 120.00"],
                  ["3 × Sugar (1 kg)", "NLe 90.00"],
                ].map(([item, price]) => (
                  <div key={item} className="flex items-center justify-between gap-2 py-1 text-xs">
                    <span className="truncate">{item}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{price}</span>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2 font-semibold">
                  <span>Total</span>
                  <span className="gradient-text tabular-nums">NLe 910.00</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {MOMO.map((m) => (
                  <span key={m.name} className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs font-medium">
                    <span className={cn("h-2.5 w-2.5 rounded-full", m.dot)} />
                    {m.name}
                  </span>
                ))}
              </div>
              <span className="flex h-10 items-center justify-center gap-2 rounded-full bg-gradient-brand text-sm font-semibold text-white shadow-md">
                <Lock className="h-3.5 w-3.5" /> Confirm and pay NLe 910.00
              </span>
            </div>
          </div>
        </div>
      </div>

      <Layer depth={110} delay={1} className="-left-2 top-24 hidden w-48 sm:block">
        <div className="rounded-2xl bg-[radial-gradient(120%_120%_at_0%_0%,#2563eb,#0b1f55)] p-4 text-white shadow-2xl shadow-blue-900/30">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-blue-100/80">
            <Wallet className="h-3.5 w-3.5" /> Payment fund
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums">NLe 12,450.00</p>
          <p className="text-[11px] text-blue-100/75">Ready to withdraw</p>
          <span className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">Withdraw</span>
        </div>
      </Layer>

      <Layer depth={150} delay={3} className="-right-2 bottom-24 w-52">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-card p-3 shadow-xl">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Payment received</p>
            <p className="truncate text-[11px] text-muted-foreground">NLe 910.00 · order unlocked</p>
          </div>
        </div>
      </Layer>

      <Layer depth={170} delay={2} className="-right-1 top-6">
        <Coin size={56} />
      </Layer>
      <Layer depth={90} delay={4} className="left-2 bottom-10">
        <Coin size={40} />
      </Layer>
      <Layer depth={60} delay={5} className="left-24 -bottom-2 hidden sm:block">
        <Coin size={28} />
      </Layer>
      </div>
    </Stage>
  );
}

const POINTS = [
  { icon: Smartphone, title: "Mobile money, Orange, Africell and QMoney", text: "People pay on Monime's secure page. You never handle a PIN or a card number." },
  { icon: BadgeCheck, title: "Every payment is verified", text: "A payment only counts after the platform asks Monime directly and the amount matches. Fake notices do nothing." },
  { icon: Landmark, title: "Your own payment fund", text: "Every payment lands in your fund. Withdraw to mobile money or a bank, with a password check and limits." },
  { icon: Lock, title: "Documents unlock on payment", text: "ID cards, tickets and orders stay locked until the money is confirmed." },
];

export function PaymentsPoints() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {POINTS.map((p, i) => (
        <Reveal key={p.title} delay={i * 100} variant="zoom">
          <li className="flex h-full gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition hover:border-primary/40 hover:shadow-glow">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md">
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

const LEDGER = [
  { what: "Sold 3 bags of rice", who: "Fatmata", amount: "+ NLe 450.00", tone: "text-emerald-600" },
  { what: "Taxi to the market", who: "Cash", amount: "- NLe 120.00", tone: "text-foreground" },
  { what: "Cooking oil on credit", who: "Mohamed owes NLe 500", amount: "+ NLe 800.00", tone: "text-emerald-600" },
  { what: "Lent to Ibrahim", who: "Due in 14 days", amount: "- NLe 1,000.00", tone: "text-foreground" },
];

/** A cash book with entries, a profit card and a voice note bubble floating around it. */
export function BookkeepingScene() {
  return (
    <Stage className="relative mx-auto w-full max-w-lg">
      <div className="relative h-[28rem] sm:h-[31rem]">
        <div className="depth absolute left-1/2 top-3 w-[19rem] -translate-x-1/2 sm:w-[22rem]" style={{ "--depth": "0px" } as React.CSSProperties}>
          <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-2xl shadow-blue-900/20">
            <div className="flex items-center gap-2 border-b border-border/70 bg-gradient-brand-soft px-4 py-3 text-sm font-semibold">
              <BookOpenIcon /> My book
              <span className="ml-auto rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">October</span>
            </div>
            <ul className="divide-y divide-border/70">
              {LEDGER.map((row) => (
                <li key={row.what} className="flex items-center gap-3 px-4 py-3 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.what}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{row.who}</span>
                  </span>
                  <span className={cn("shrink-0 font-semibold tabular-nums", row.tone)}>{row.amount}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 border-t border-border/70 p-3">
              {["I sold", "I spent", "I lent"].map((label, i) => (
                <span key={label} className={cn("flex-1 rounded-xl bg-gradient-to-br py-2 text-center text-[11px] font-bold text-white", ["from-emerald-500 to-teal-400", "from-rose-500 to-orange-400", "from-blue-500 to-indigo-400"][i])}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <Layer depth={120} delay={1} className="-right-2 top-2 w-44">
          <div className="rounded-2xl bg-[radial-gradient(120%_120%_at_0%_0%,#059669,#064e3b)] p-4 text-white shadow-2xl shadow-emerald-900/30">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-100/80">Profit this month</p>
            <p className="mt-1 text-xl font-bold tabular-nums">NLe 2,200.00</p>
            <p className="text-[11px] text-emerald-100/75">Earned 5,200 · cost 3,000</p>
          </div>
        </Layer>

        <Layer depth={150} delay={3} className="-left-3 bottom-8 w-56">
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-xl">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-white">
              <MicIcon />
            </span>
            <div className="min-w-0">
              <div className="flex h-5 items-end gap-0.5" aria-hidden="true">
                {[6, 12, 8, 16, 10, 18, 7, 13, 9, 15, 6, 11].map((h, i) => (
                  <span key={i} className="w-1 rounded-full bg-primary/70" style={{ height: h }} />
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Voice note · 0:14 · saved</p>
            </div>
          </div>
        </Layer>

        <Layer depth={90} delay={5} className="-right-1 bottom-4">
          <div className="rounded-2xl border border-amber-500/30 bg-card px-3 py-2 text-xs shadow-xl">
            <span className="font-semibold">1 loan overdue</span>
            <span className="block text-[11px] text-muted-foreground">Ibrahim · NLe 800.00 left</span>
          </div>
        </Layer>
      </div>
    </Stage>
  );
}

function BookOpenIcon() {
  return <ScrollText className="h-4 w-4 text-primary" />;
}
function MicIcon() {
  return <Mic className="h-5 w-5" />;
}

const BOOK_POINTS = [
  { icon: ScrollText, title: "A cash book anyone can use", text: "Big buttons: I sold, I spent, I bought stock, I lent, I borrowed. Say how much, who with, and whether it was paid or on credit." },
  { icon: Mic, title: "Speak instead of writing", text: "Record a voice note and it is kept in the book as a record. Write it down later, or let someone you trust do it. The app can also read your totals out loud." },
  { icon: TrendingUp, title: "Profit and loss, always up to date", text: "See what you earned, what stock and expenses cost, and what is left, for any month or period, with cash flow beside it." },
  { icon: Coins, title: "Loans and credit that never get lost", text: "Who owes you, who you owe, what is overdue and what was paid back. Nothing is deleted, mistakes are voided with a reason." },
];

export function BookkeepingPoints() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {BOOK_POINTS.map((p, i) => (
        <Reveal key={p.title} delay={i * 100} variant="zoom">
          <li className="flex h-full gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition hover:border-primary/40 hover:shadow-glow">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md">
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
