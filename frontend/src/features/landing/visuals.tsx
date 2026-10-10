import * as React from "react";
import { CheckCircle2, GripVertical, ListChecks, QrCode, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tilt, useScrollProgress } from "./motion";

const BRAND_PRIMARY = "#1d4ed8";
const BRAND_SECONDARY = "#0ea5e9";

const STATUS_STYLES: Record<string, string> = {
  Approved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "Under review": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Submitted: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
};

export function BrowserFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl shadow-blue-500/10", className)}>
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-3 hidden truncate rounded-md bg-background/80 px-3 py-0.5 text-[10px] text-muted-foreground sm:block">
          {typeof window !== "undefined" ? window.location.host : "your-workspace"}/admin
        </span>
      </div>
      {children}
    </div>
  );
}

/** A stylised dashboard: KPI tiles, a weekly chart, and the latest registrations. */
export function HeroDashboard() {
  const bars = [38, 52, 45, 70, 62, 88, 76];
  const rows = [
    { name: "Aminata K.", program: "Youth Service", status: "Approved" },
    { name: "Daniel O.", program: "Scholarship", status: "Under review" },
    { name: "Grace M.", program: "Bootcamp", status: "Submitted" },
  ];
  return (
    <BrowserFrame>
      <div className="grid grid-cols-[44px_1fr] sm:grid-cols-[120px_1fr]">
        <aside className="flex flex-col gap-2 border-r border-border/70 p-2 sm:p-3">
          {["Dashboard", "Programs", "Team", "Settings"].map((item, i) => (
            <div
              key={item}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-medium",
                i === 0 ? "bg-gradient-brand text-white" : "text-muted-foreground",
              )}
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-sm", i === 0 ? "bg-white/80" : "bg-muted-foreground/40")} />
              <span className="hidden sm:inline">{item}</span>
            </div>
          ))}
        </aside>
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Registrations", value: "1,284" },
              { label: "Approved", value: "862" },
              { label: "This week", value: "146" },
            ].map((tile) => (
              <div key={tile.label} className="rounded-lg border border-border/70 p-2">
                <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
                <p className="text-sm font-bold sm:text-base">{tile.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <p className="mb-2 text-[10px] font-semibold text-muted-foreground">Registrations this week</p>
            <div className="flex h-16 items-end gap-1.5 sm:h-20">
              {bars.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-[4px]"
                  style={{ height: `${h}%`, backgroundColor: i === bars.length - 2 ? BRAND_PRIMARY : `${BRAND_SECONDARY}99` }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col divide-y divide-border/70 rounded-lg border border-border/70">
            {rows.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold">{row.name}</p>
                  <p className="truncate text-[9px] text-muted-foreground">{row.program}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold", STATUS_STYLES[row.status])}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

export function RegistrationToast({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-xl", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-success text-white">
        <CheckCircle2 className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs font-semibold">New registration</p>
        <p className="text-[11px] text-muted-foreground">REG-2026-000128 · just now</p>
      </div>
    </div>
  );
}

export function ShareCardMock({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-xl", className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-border/70 bg-white">
        <QrCode className="h-10 w-10 text-slate-900" />
      </span>
      <div>
        <p className="text-xs font-semibold">Share your form</p>
        <p className="text-[11px] text-muted-foreground">Link · QR code · WhatsApp</p>
      </div>
    </div>
  );
}

/** Form builder: sections, draggable fields, and a field-type palette. */
export function FormBuilderMock() {
  const fields = [
    { label: "Full name", type: "Short text", required: true },
    { label: "District", type: "Dropdown", required: true },
    { label: "Chiefdom", type: "Dropdown · depends on District", required: true },
    { label: "Passport photo", type: "Image upload", required: true },
    { label: "Preferred sector", type: "Multiple choice · Other (please specify)", required: false },
  ];
  const palette = ["Short text", "Email", "Phone", "Dropdown", "Date of birth", "File upload", "Yes / No", "Rating"];
  return (
    <BrowserFrame>
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_150px]">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold">Personal information</p>
          {fields.map((field) => (
            <div key={field.label} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2">
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </p>
                <p className="truncate text-[9px] text-muted-foreground">{field.type}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden flex-col gap-1.5 sm:flex">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Add a field</p>
          {palette.map((item) => (
            <span key={item} className="rounded-md bg-gradient-brand-soft px-2 py-1 text-[10px] font-medium text-primary">
              + {item}
            </span>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

/** Analytics: a status breakdown and a per-question chart. */
export function AnalyticsMock() {
  const statuses = [
    { label: "Approved", value: 62, color: "#10b981" },
    { label: "Under review", value: 24, color: "#f59e0b" },
    { label: "Waitlisted", value: 14, color: "#6366f1" },
  ];
  const question = [
    { label: "Education", value: 86 },
    { label: "Health", value: 64 },
    { label: "Agriculture", value: 42 },
    { label: "ICT", value: 38 },
  ];
  return (
    <BrowserFrame>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border/70 p-3">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold">
            <ListChecks className="h-3.5 w-3.5 text-primary" />
            Status breakdown
          </p>
          <div className="flex h-3 overflow-hidden rounded-full">
            {statuses.map((s) => (
              <span key={s.label} style={{ width: `${s.value}%`, backgroundColor: s.color }} className="h-full" />
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {statuses.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold">{s.value}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border/70 p-3">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold">
            <Users2 className="h-3.5 w-3.5 text-primary" />
            Preferred sector
          </p>
          <div className="flex flex-col gap-2">
            {question.map((q) => (
              <div key={q.label} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-[10px] text-muted-foreground">{q.label}</span>
                <span className="h-2.5 rounded-r" style={{ width: `${q.value}%`, backgroundColor: BRAND_PRIMARY }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** Verifications: summary tiles and the scan log, as a program's Verifications tab shows them. */
export function VerificationsMock() {
  const scans = [
    { name: "Aminata K.", number: "YLP-2026-000123", doc: "ID card", valid: true, by: "Gate A · Musa", time: "09:14" },
    { name: "Daniel O.", number: "YLP-2026-000087", doc: "Ticket", valid: true, by: "Public scan", time: "09:12" },
    { name: "Grace M.", number: "YLP-2026-000045", doc: "Ticket", valid: false, by: "Gate B · Fatu", time: "09:09" },
    { name: "Ibrahim S.", number: "YLP-2026-000131", doc: "ID card", valid: true, by: "Gate A · Musa", time: "09:05" },
  ];
  return (
    <BrowserFrame>
      <div className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Scans today", value: "248" },
            { label: "People verified", value: "231" },
            { label: "Not valid", value: "3" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-border/70 p-2">
              <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
              <p className="text-sm font-bold sm:text-base">{tile.value}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-border/70">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_1fr] gap-2 bg-gradient-brand-soft px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-primary">
            <span>Participant</span>
            <span>Document</span>
            <span>Result</span>
            <span className="text-right">Scanned by</span>
          </div>
          {scans.map((scan) => (
            <div
              key={scan.number}
              className="grid grid-cols-[1.4fr_0.8fr_0.7fr_1fr] items-center gap-2 border-t border-border/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold">{scan.name}</p>
                <p className="truncate text-[9px] text-muted-foreground">{scan.number}</p>
              </div>
              <span className="text-[10px] text-muted-foreground">{scan.doc}</span>
              <span
                className={cn(
                  "w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold",
                  scan.valid ? STATUS_STYLES.Approved : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                )}
              >
                {scan.valid ? "Valid" : "Not valid"}
              </span>
              <div className="min-w-0 text-right">
                <p className="truncate text-[10px]">{scan.by}</p>
                <p className="text-[9px] text-muted-foreground">{scan.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}
