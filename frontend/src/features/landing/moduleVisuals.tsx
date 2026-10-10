import { ArrowRight, ChevronDown, Download, FileSpreadsheet, FileText, Receipt, ShoppingBag, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrowserFrame } from "./visuals";

/** A stylised poll: live results for one position. */
export function PollsMock() {
  const candidates = [
    { name: "Mariama Sesay", percent: 54, place: "1st", color: "bg-blue-600" },
    { name: "Ibrahim Kamara", percent: 31, place: "2nd", color: "bg-sky-500" },
    { name: "Fatmata Bangura", percent: 15, place: "3rd", color: "bg-slate-400" },
  ];
  return (
    <BrowserFrame>
      <div className="flex flex-col gap-4 p-4 sm:p-5" aria-hidden="true">
        <div className="relative h-24 overflow-hidden rounded-xl bg-gradient-brand">
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-3 bottom-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-white">
            <span className="rounded-full bg-black/60 px-2.5 py-1">Student Union Elections</span>
            <span className="rounded-full bg-black/60 px-2.5 py-1">2 positions</span>
            <span className="rounded-full bg-emerald-500 px-2.5 py-1">Open</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">President &middot; live results</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            1,204 votes
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {candidates.map((c) => (
            <div key={c.name} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <UserRound className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.place} &middot; {c.percent}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", c.color)} style={{ width: `${c.percent}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="rounded-lg bg-gradient-brand-soft px-3 py-2 text-[11px] text-primary">One vote per email &middot; secret ballot &middot; only @school.edu addresses</p>
      </div>
    </BrowserFrame>
  );
}

/** A stylised business: its orders, an invoice, and a receipt. */
export function BusinessMock() {
  const orders = [
    { name: "Aminata K.", number: "ORD-2026-00018", status: "Processing", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    { name: "Daniel O.", number: "ORD-2026-00017", status: "Ready", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    { name: "Grace M.", number: "ORD-2026-00016", status: "New", tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  ];
  return (
    <BrowserFrame>
      <div className="flex flex-col gap-4 p-4 sm:p-5" aria-hidden="true">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: ShoppingBag, label: "Orders", value: "128" },
            { icon: FileText, label: "Invoices", value: "64" },
            { icon: Receipt, label: "Receipts", value: "59" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 rounded-xl border border-border/70 bg-background/60 py-3">
              <stat.icon className="h-4 w-4 text-primary" />
              <span className="text-lg font-bold tabular-nums">{stat.value}</span>
              <span className="text-[10px] text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
          {orders.map((order) => (
            <div key={order.number} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{order.name}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{order.number}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold", order.tone)}>{order.status}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-gradient-brand-soft px-3 py-2.5 text-xs">
          <span className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-primary" />
            INV-0064 &middot; Le 2,450
          </span>
          <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-semibold text-white">Paid</span>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** A form with the newer builder rules: an age limit, an auto-filled field, a follow-up box, a selection limit. */
export function SmartFormMock() {
  return (
    <BrowserFrame>
      <div className="flex flex-col gap-3 p-4 sm:p-5" aria-hidden="true">
        <div>
          <p className="text-[11px] font-semibold">Date of birth *</p>
          <div className="mt-1 rounded-lg border border-destructive px-3 py-2 text-xs">03 / 04 / 2012</div>
          <p className="mt-1 text-[10px] font-medium text-destructive">You must be at least 18 years old</p>
        </div>
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold">
            Name on the certificate
            <span className="rounded-full bg-gradient-brand-soft px-2 py-0.5 text-[9px] font-semibold text-primary">Filled from Full name</span>
          </p>
          <div className="mt-1 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs">Aminata Kamara</div>
        </div>
        <div>
          <p className="text-[11px] font-semibold">Do you have a design in mind? *</p>
          <div className="mt-1 flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Yes
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-full border border-border" />
              No
            </span>
          </div>
          <div className="mt-2 rounded-lg border border-border/70 bg-muted/30 p-2.5">
            <p className="text-[10px] font-semibold">Describe or upload your design</p>
            <div className="mt-1 h-9 rounded-md border border-border/70 bg-background/60" />
            <div className="mt-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-center text-[10px] text-muted-foreground">Or upload a file</div>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold">Skills <span className="font-normal text-muted-foreground">· choose up to 2 (2 selected)</span></p>
          <div className="mt-1 flex flex-col gap-1 text-xs">
            {[
              ["Public speaking", true],
              ["Leadership", true],
              ["Writing", false],
            ].map(([label, on]) => (
              <span key={String(label)} className={cn("flex items-center gap-2", !on && "opacity-45")}>
                <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded border", on ? "border-primary bg-primary text-[8px] text-white" : "border-border")}>{on ? "✓" : ""}</span>
                {String(label)}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-gradient-brand px-3 py-2 text-center text-[11px] font-semibold text-white">Review your answers</div>
      </div>
    </BrowserFrame>
  );
}

/** The verified-voters panel and the refusal an unlisted email gets. */
export function VerifiedVotersMock() {
  return (
    <BrowserFrame>
      <div className="flex flex-col gap-3 p-4 sm:p-5" aria-hidden="true">
        <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
          <div>
            <p className="text-xs font-semibold">Only verified voters can vote</p>
            <p className="text-[10px] text-muted-foreground">Anyone not on the list is refused</p>
          </div>
          <span className="flex h-5 w-9 items-center rounded-full bg-primary p-0.5">
            <span className="ml-auto h-4 w-4 rounded-full bg-white" />
          </span>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/60 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          mariama@school.edu
          <br />
          ibrahim@school.edu
          <br />
          fatmata@school.edu
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
          <span className="rounded-full bg-secondary px-2.5 py-1">3 emails</span>
          <span className="rounded-full border border-border/70 px-2.5 py-1">2 signed up</span>
          <span className="rounded-full border border-border/70 px-2.5 py-1">1 voted</span>
          <span className="ml-auto rounded-lg bg-gradient-brand px-3 py-1.5 text-white">Save verified voters</span>
        </div>
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[11px] text-destructive">
          <p className="font-semibold">You can&apos;t create an account</p>
          <p className="mt-0.5 text-[10px]">You cannot create an account because you are not verified by the system as an eligible voter for this poll.</p>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** What a customer sees after placing an order: the number, the status, and ways to keep a copy. */
export function SuccessCopyMock() {
  return (
    <BrowserFrame>
      <div className="flex flex-col items-center gap-3 p-5 text-center" aria-hidden="true">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-success text-lg text-white shadow-glow">✓</span>
        <p className="text-sm font-bold">Order placed!</p>
        <div className="rounded-xl border border-border/70 bg-gradient-brand-soft px-5 py-2">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Order number</p>
          <p className="gradient-text text-sm font-bold tracking-wide">ORD-2026-00018</p>
        </div>
        <span className="rounded-full bg-gradient-brand px-3 py-0.5 text-[10px] font-semibold text-white">Preparing your order</span>
        <div className="flex flex-wrap justify-center gap-1.5 text-[10px] font-semibold">
          {["Preview", "Print", "Download PDF", "Download image"].map((b, i) => (
            <span key={b} className={cn("rounded-lg border px-2.5 py-1.5", i === 2 ? "border-transparent bg-gradient-brand text-white" : "border-border/70")}>
              {b}
            </span>
          ))}
        </div>
        <div className="grid w-full grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg bg-gradient-to-br from-blue-600 to-sky-500 p-3 text-[10px] font-semibold text-white">ID card</div>
          <div className="rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 p-3 text-[10px] font-semibold text-white">Ticket</div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** The import dialog: matched columns, a row-by-row preview and the actions. */
export function ImportMock() {
  const rows: [string, string, string, string][] = [
    ["New", "Aminata Kamara", "aminata@example.com", "Freetown"],
    ["Update", "Musa Bangura", "musa@example.com", "Bo"],
    ["New", "Fatmata Sesay", "fatmata@example.com", "Makeni"],
    ["Problem", "Ibrahim Koroma", "ibrahim@examp", "Kenema"],
  ];
  const tone: Record<string, string> = {
    New: "bg-emerald-500/15 text-emerald-600",
    Update: "bg-sky-500/15 text-sky-600",
    Problem: "bg-destructive/15 text-destructive",
  };
  return (
    <BrowserFrame>
      <div className="flex flex-col gap-3 p-4 sm:p-5" aria-hidden="true">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold">Import registrations</p>
          <span className="ml-auto flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium">
            <FileSpreadsheet className="h-3 w-3 text-primary" />
            attendees.xlsx
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 rounded-xl border border-border/70 p-2.5 text-[10px]">
          {[
            ["Full Name", "Full name"],
            ["E-mail", "Email address"],
            ["Town", "City"],
          ].map(([from, to]) => (
            <div key={from} className="contents">
              <span className="rounded-md bg-muted/60 px-2 py-1 font-medium">{from}</span>
              <ArrowRight className="h-3 w-3 text-primary" />
              <span className="rounded-md border border-primary/40 bg-gradient-brand-soft px-2 py-1 font-medium text-primary">{to}</span>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-border/70 text-[10px]">
          <div className="grid grid-cols-[3.2rem_1fr_1fr_1fr] gap-2 bg-muted/60 px-2.5 py-1.5 font-semibold">
            <span>Result</span>
            <span>Name</span>
            <span>Email</span>
            <span>City</span>
          </div>
          {rows.map(([result, name, email, city]) => (
            <div key={name} className="grid grid-cols-[3.2rem_1fr_1fr_1fr] items-center gap-2 border-t border-border/50 px-2.5 py-1.5">
              <span className={cn("w-fit rounded-full px-1.5 py-0.5 text-[9px] font-semibold", tone[result])}>{result}</span>
              <span className="truncate">{name}</span>
              <span className={cn("truncate", result === "Problem" && "text-destructive")}>{email}</span>
              <span className="truncate">{city}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
          <span className="flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1.5">
            <Download className="h-3 w-3" />
            Download rows to fix (1)
          </span>
          <span className="ml-auto rounded-lg bg-gradient-brand px-3 py-1.5 text-white">Import / update 3</span>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** A question's rules: the answer given, or whether another question is filled in. */
export function RulesMock() {
  const Select = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={cn("flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-[10px]", className)}>
      {children}
      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
    </span>
  );
  return (
    <BrowserFrame>
      <div className="flex flex-col gap-3 p-4 sm:p-5" aria-hidden="true">
        <p className="text-xs font-semibold">Show this question only when…</p>
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
          <Select>Region</Select>
          <div className="grid grid-cols-2 gap-2">
            <Select>The answer given</Select>
            <Select>is</Select>
          </div>
          <Select className="border-primary/40 text-primary">North</Select>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
          <Select>Phone number</Select>
          <div className="grid grid-cols-2 gap-2">
            <Select>Whether it is filled</Select>
            <Select>is filled in</Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
          {["Questions", "Sections", "Required", "Limits", "Defaults", "Choices", "Follow-ups", "“Other” box", "Consent"].map((chip) => (
            <span key={chip} className="rounded-full bg-gradient-brand-soft px-2.5 py-1 text-primary">
              {chip}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">Rules work in all of these places, and are checked again on the server.</p>
      </div>
    </BrowserFrame>
  );
}
