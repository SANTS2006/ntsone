import { Loading } from "@/components/Loading";
import { NavLink, useOutletContext, useParams } from "react-router-dom";
import { LazyOutlet } from "@/components/PageLoading";
import { ArrowLeft, ImageIcon, MessageSquarePlus } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { Button } from "@/components/ui/button";
import { FeedbackDialog } from "../support/FeedbackDialog";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { ProgramStatusBadge } from "@/components/StatusBadge";
import { LinkButton } from "@/components/ui/link-button";
import { useProgram } from "./hooks";
import type { Program, RegistrationStatus } from "@/types/api";
import { usePageMeta } from "@/lib/seo";

/** Words for the things a form collects: registrations for programs, orders for a business. */
export interface SubmissionTerms {
  singular: string;
  plural: string;
  numberLabel: string;
  statuses: RegistrationStatus[];
  statusLabel: (status: RegistrationStatus) => string;
  /** A status's own colour, when its business has chosen one. */
  statusTone?: (status: RegistrationStatus) => "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
}

const labelize = (status: string) => status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const PROGRAM_TERMS: SubmissionTerms = {
  singular: "registration",
  plural: "registrations",
  numberLabel: "Registration #",
  statuses: ["submitted", "under_review", "approved", "rejected", "waitlisted", "cancelled"],
  statusLabel: labelize,
};

const ORDER_LABELS: Partial<Record<RegistrationStatus, string>> = { submitted: "New", rejected: "Declined" };

export const ORDER_TERMS: SubmissionTerms = {
  singular: "order",
  plural: "orders",
  numberLabel: "Order #",
  statuses: ["submitted", "confirmed", "processing", "ready", "delivered", "completed", "cancelled", "rejected"],
  statusLabel: (status) => ORDER_LABELS[status] ?? labelize(status),
};

interface ProgramOutletContext {
  program: Program;
  /** Where one submission opens; defaults to the program's own registrations page. */
  submissionPath?: (registrationId: string) => string;
  terms?: SubmissionTerms;
}

export function useProgramOutletContext() {
  const context = useOutletContext<ProgramOutletContext>();
  const { program } = context;
  return {
    program,
    submissionPath: context.submissionPath ?? ((id: string) => `/admin/programs/${program.id}/registrations/${id}`),
    terms: context.terms ?? (program.kind === "order_form" ? ORDER_TERMS : PROGRAM_TERMS),
  };
}

const tabs = [
  { to: "", label: "Overview", end: true },
  { to: "form", label: "Form Builder", end: false },
  { to: "analytics", label: "Analytics", end: false },
  { to: "registrations", label: "Registrations", end: false },
  { to: "verifications", label: "Verifications", end: false },
];

export function ProgramDetailLayout() {
  const { programId } = useParams<{ programId: string }>();
  const { data: program, isLoading, error } = useProgram(programId);
  usePageMeta({ title: program?.name ?? "Program" });
  const { user } = useAuth();

  if (error) {
    const message =
      error instanceof ApiError && error.statusCode === 403
        ? "You do not have access to this program."
        : "This program could not be found.";
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-muted-foreground">{message}</p>
        <LinkButton to="/admin/programs" variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Back to programs
        </LinkButton>
      </div>
    );
  }

  if (isLoading || !program) {
    return <Loading label="Loading program" />;
  }

  // The Payments tab appears once the program takes payments.
  const visibleTabs = program.paymentConfig?.enabled
    ? [...tabs.slice(0, 4), { to: "payments", label: "Payments", end: false }, ...tabs.slice(4)]
    : tabs;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero banner: image container uses `relative` positioning so the name/status
          overlay can be laid on top with `absolute`, anchored to its bottom-left. */}
      <div className="relative flex min-h-40 w-full flex-col justify-end overflow-hidden rounded-2xl border border-border/70 bg-gradient-brand shadow-glow sm:min-h-52">
        {program.thumbnailUrl ? (
          <img src={program.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-brand">
            <ImageIcon className="h-10 w-10 text-white/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {user && user.role !== "super_admin" && (
          <div className="absolute right-3 top-3">
            <FeedbackDialog
              programId={program.id}
              programName={program.name}
              trigger={
                <Button size="sm" variant="outline" className="border-white/40 bg-black/30 text-white backdrop-blur hover:bg-black/50 hover:text-white">
                  <MessageSquarePlus className="h-4 w-4" />
                  Feedback
                </Button>
              }
            />
          </div>
        )}
        <div className="relative flex min-w-0 flex-col gap-2 p-4 pt-16 sm:p-6 sm:pt-14">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight text-white drop-shadow sm:text-3xl">{program.name}</h1>
            <ProgramStatusBadge status={program.status} />
          </div>
          <p className="break-all text-sm text-white/80">/{program.slug}</p>
        </div>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-card/60 p-1.5 backdrop-blur-sm sm:mx-0">
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={`/admin/programs/${programId}${tab.to ? `/${tab.to}` : ""}`}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-brand text-white shadow-glow"
                  : "text-muted-foreground hover:bg-gradient-brand-soft hover:text-primary",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <LazyOutlet context={{ program }} />
    </div>
  );
}
