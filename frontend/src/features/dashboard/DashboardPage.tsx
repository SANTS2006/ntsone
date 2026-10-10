import { Loading } from "@/components/Loading";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ExportButtons } from "@/components/ExportButtons";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FolderKanban,
  Hourglass,
  ListChecks,
  ScanLine,
  ShieldAlert,
  Ticket,
  UserCheck,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { ProgramStatusBadge, RegistrationStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RegistrationTrendChart, StatusPieChart } from "../analytics/charts";
import { getDashboardTrend } from "../analytics/api";
import { CATEGORICAL_LIGHT } from "../analytics/palette";
import { DocumentBadge, ResultBadge } from "../verifications/VerificationsPage";
import { getDashboardInsights, type DashboardInsights } from "./insights";
import { OwnSpaceCard } from "../access/OwnSpace";
import { ModuleSections } from "./ModuleSections";
import type { DashboardOverview } from "@/types/api";
import { useAuth } from "@/app/AuthContext";
import { usePageMeta } from "@/lib/seo";

const SCAN_COLOR = CATEGORICAL_LIGHT[2]!;

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** A labelled bar showing part of a whole, e.g. how many registrants have been checked in. */
function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value} <span className="text-muted-foreground">({percent}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function CheckInSummary({ insights }: { insights: DashboardInsights }) {
  const v = insights.verification;
  return (
    <div className="flex flex-col gap-5">
      <ProgressRow
        label="Registrants checked in"
        value={Math.min(v.peopleVerified, v.eligibleRegistrations)}
        total={v.eligibleRegistrations}
        color={SCAN_COLOR}
      />
      <ProgressRow label="ID card scans" value={v.idCardScans} total={v.totalScans} color={CATEGORICAL_LIGHT[0]!} />
      <ProgressRow label="Ticket scans" value={v.ticketScans} total={v.totalScans} color={CATEGORICAL_LIGHT[1]!} />
      <ProgressRow label="Scans that weren't valid" value={v.invalidScans} total={v.totalScans} color={CATEGORICAL_LIGHT[7]!} />
      <p className="text-xs text-muted-foreground">
        {v.eligibleRegistrations === 0
          ? "Turn on ID cards or tickets for a program to start checking people in."
          : `${v.eligibleRegistrations} registrations have an ID card or ticket to scan.`}
      </p>
    </div>
  );
}

function ProgramPerformance({ insights }: { insights: DashboardInsights }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-gradient-brand-soft">
          <TableRow className="hover:bg-transparent">
            {["Program", "Status", "Registrations", "This week", "Approved", "Scans", "Checked in"].map((h) => (
              <TableHead key={h} className="whitespace-nowrap font-semibold">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {insights.programs.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No programs yet.
              </TableCell>
            </TableRow>
          )}
          {insights.programs.map((p) => {
            const checkedIn = p.registrations ? Math.round((Math.min(p.peopleVerified, p.registrations) / p.registrations) * 100) : 0;
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link to={`/admin/programs/${p.id}`} className="text-primary hover:opacity-80">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <ProgramStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="tabular-nums">{p.registrations}</TableCell>
                <TableCell className="tabular-nums">{p.registrationsThisWeek}</TableCell>
                <TableCell className="tabular-nums">{p.approved}</TableCell>
                <TableCell className="tabular-nums">{p.documentsEnabled ? p.scans : "—"}</TableCell>
                <TableCell className="min-w-32">
                  {p.documentsEnabled ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${checkedIn}%`, backgroundColor: SCAN_COLOR }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{checkedIn}%</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No ID cards or tickets</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RecentActivity({ insights }: { insights: DashboardInsights }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest registrations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/70">
          {insights.recentRegistrations.length === 0 && (
            <p className="text-sm text-muted-foreground">No registrations yet.</p>
          )}
          {insights.recentRegistrations.map((r) => (
            <Link
              key={r.id}
              to={`/admin/programs/${r.programId}/registrations/${r.id}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.applicantName ?? r.registrationNumber}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.programName} &middot; {timeAgo(r.submittedAt)}
                </p>
              </div>
              <RegistrationStatusBadge status={r.status} />
            </Link>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest scans</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/70">
          {insights.recentScans.length === 0 && (
            <p className="text-sm text-muted-foreground">No ID card or ticket has been scanned yet.</p>
          )}
          {insights.recentScans.map((s) => (
            <Link
              key={s.id}
              to={`/admin/programs/${s.programId}/registrations/${s.registrationId}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.applicantName ?? s.registrationNumber}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.programName} &middot; {s.verifiedByName ?? "Public scan"} &middot; {timeAgo(s.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <DocumentBadge type={s.documentType} />
                <ResultBadge valid={s.valid} />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardPage() {
  usePageMeta({ title: "Dashboard" });
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => apiFetch<DashboardOverview>("/dashboard/overview"),
  });
  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ["dashboard-analytics-trend"],
    queryFn: () => getDashboardTrend(30),
  });
  // Separate from the overview so the core numbers still show if this part fails.
  const { data: insights } = useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: getDashboardInsights,
    refetchInterval: 60_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back, <span className="gradient-text">{user?.name.split(" ")[0]}</span>
          </h1>
          <p className="text-sm text-muted-foreground">Here's what's happening across your programs, polls, and businesses.</p>
        </div>
        <ExportButtons path="/dashboard/export" fileLabel="Dashboard" />
      </div>

      <OwnSpaceCard />

      {isLoading && <Loading label="Loading dashboard" />}

      {isError && !data && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-border/70 p-8 text-center">
          <p className="font-medium">The dashboard could not be loaded.</p>
          <p className="text-sm text-muted-foreground">This is usually a short interruption. Your data is safe.</p>
          <Button size="sm" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Total programs" value={data.totalPrograms} icon={FolderKanban} />
            <StatCard label="Active programs" value={data.activePrograms} icon={ListChecks} />
            <StatCard label="Total registrations" value={data.totalRegistrations} icon={ClipboardList} />
            <StatCard label="Registrations today" value={data.registrationsToday} icon={CalendarDays} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="This week" value={data.registrationsThisWeek} />
            <StatCard label="This month" value={data.registrationsThisMonth} />
            <StatCard label="Approved" value={data.byStatus.approved ?? 0} icon={CheckCircle2} />
            <StatCard label="Rejected" value={data.byStatus.rejected ?? 0} icon={XCircle} />
          </div>
          {insights && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard label="Waiting for review" value={insights.review.pending} icon={Hourglass} />
              <StatCard label="Approval rate" value={`${insights.review.approvalRate}%`} icon={BadgeCheck} />
              <StatCard label="Programs with ID cards" value={insights.documents.idCardPrograms} icon={CreditCard} />
              <StatCard label="Programs with tickets" value={insights.documents.ticketPrograms} icon={Ticket} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Registrations in the last 30 days</CardTitle>
              </CardHeader>
              <CardContent>
                {trendLoading || !trend ? (
                  <Loading label="Loading trend" />
                ) : (
                  <RegistrationTrendChart data={trend} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusPieChart byStatus={data.byStatus} />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ModuleSections />

      {insights && (
        <>
          <SectionTitle
            title="Check-ins & verification"
            description="Scans of ID card and ticket QR codes, from phone cameras and the in-app scanner."
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Scans today" value={insights.verification.scansToday} icon={ScanLine} />
            <StatCard label="Scans this week" value={insights.verification.scansThisWeek} icon={CalendarDays} />
            <StatCard
              label="Check-in rate"
              value={`${insights.verification.checkInRate}%`}
              icon={UserCheck}
            />
            <StatCard label="Scans that weren't valid" value={insights.verification.invalidScans} icon={ShieldAlert} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Scans in the last 30 days</CardTitle>
                <CardDescription>{insights.verification.totalScans} scans in total</CardDescription>
              </CardHeader>
              <CardContent>
                <RegistrationTrendChart data={insights.scanTrend} name="Scans" color={SCAN_COLOR} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Check-in progress</CardTitle>
                <CardDescription>
                  {insights.verification.peopleVerified} people verified at least once
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CheckInSummary insights={insights} />
              </CardContent>
            </Card>
          </div>

          <SectionTitle title="Programs" description="How each program is doing, busiest first." />
          <Card>
            <CardContent className="p-0">
              <ProgramPerformance insights={insights} />
            </CardContent>
          </Card>

          <SectionTitle title="Latest activity" description="The newest registrations and scans across your programs." />
          <RecentActivity insights={insights} />
        </>
      )}
    </div>
  );
}
