import { CalendarRange, HandCoins, History, LineChart, ListChecks, Table2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal, Tilt } from "./motion";

const ROWS = [
  { name: "Musa", cells: ["paid", "paid", "paid", "unpaid"] },
  { name: "Fatmata", cells: ["paid", "partial", "paid", "paid"] },
  { name: "Ibrahim", cells: ["paid", "unpaid", "unpaid", "unpaid"] },
  { name: "Aminata", cells: ["paid", "paid", "paid", "paid"] },
] as const;

const TONE = {
  paid: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  partial: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  unpaid: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
} as const;
const LABEL = { paid: "Paid", partial: "Part", unpaid: "Not paid" } as const;

/** A small monthly tracker: who paid and who did not, month by month, with the totals under it. */
export function ContributionsScene() {
  return (
    <Tilt max={7} innerClassName="rounded-3xl">
      <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
              <HandCoins className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight">Monthly dues</p>
              <p className="text-[11px] text-muted-foreground">Tracked by month and year</p>
            </div>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">2026</span>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
          <div className="grid grid-cols-[1.2fr_repeat(4,1fr)] bg-muted/50 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
            <span>Name</span>
            {["Jan", "Feb", "Mar", "Apr"].map((m) => (
              <span key={m} className="text-center">
                {m}
              </span>
            ))}
          </div>
          {ROWS.map((row) => (
            <div key={row.name} className="grid grid-cols-[1.2fr_repeat(4,1fr)] items-center gap-1 border-t border-border/50 px-2 py-1.5 text-xs">
              <span className="truncate font-medium">{row.name}</span>
              {row.cells.map((c, i) => (
                <span key={i} className={cn("rounded-md py-1 text-center text-[10px] font-semibold", TONE[c])}>
                  {LABEL[c]}
                </span>
              ))}
            </div>
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Collected", "NLe 1,350"],
            ["Taken out", "NLe 400"],
            ["Still held", "NLe 950"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/40 p-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Tilt>
  );
}

const POINTS = [
  { icon: Table2, title: "Your own columns", text: "For a one-time collection, type the columns you want (Name, Gender, Phone). The Amount column is always there and the total grows as you add rows." },
  { icon: CalendarRange, title: "Months and years", text: "For dues that run for months or years, see every contributor against every month, and flip between years." },
  { icon: ListChecks, title: "Who paid, who did not", text: "Paid, part-paid and missed months are colour coded, with a list of who is behind and for how long." },
  { icon: History, title: "Date and time on everything", text: "Each row and payment records when it was entered and when it was last changed, with a full history." },
  { icon: Wallet, title: "Money taken, with notes", text: "Write down every amount taken out and why. The total taken adds up, and you always see what is still held." },
  { icon: LineChart, title: "Download it", text: "Export any contribution, or any year, to Excel or CSV for your records or your committee." },
];

export function ContributionsPoints() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {POINTS.map((p, i) => (
        <Reveal key={p.title} delay={i * 80} variant="zoom">
          <li className="flex h-full gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur-sm transition hover:border-amber-400/50 hover:shadow-glow">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
              <p.icon className="h-5 w-5" aria-hidden="true" />
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
