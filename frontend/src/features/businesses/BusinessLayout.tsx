import { Loading } from "@/components/Loading";
import { NavLink, useOutletContext, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Store } from "lucide-react";
import { LazyOutlet } from "@/components/PageLoading";
import { LinkButton } from "@/components/ui/link-button";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Program } from "@/types/api";
import { useProgram } from "../programs/hooks";
import type { SubmissionTerms } from "../programs/ProgramDetailLayout";
import { ORDER_TERMS } from "../programs/ProgramDetailLayout";
import { statusLabel, statusTone } from "./statuses";
import { getBusiness, type Business } from "./api";
import { businessKeys } from "./BusinessesListPage";

export function useBusinessOutletContext() {
  return useOutletContext<{ business: Business; program: Program | undefined }>();
}

export function useBusiness(businessId: string | undefined) {
  return useQuery({ queryKey: businessKeys.detail(businessId ?? ""), queryFn: () => getBusiness(businessId!), enabled: !!businessId });
}

const tabs = [
  { to: "", label: "Overview", end: true },
  { to: "order-form", label: "Order Form", end: false },
  { to: "orders", label: "Orders", end: false },
  // Shown once the order form takes payments.
  { to: "payments", label: "Payments", end: false, paidOnly: true },
  { to: "quotations", label: "Quotations", end: false },
  { to: "invoices", label: "Invoices", end: false },
  { to: "receipts", label: "Receipts", end: false },
  { to: "cards", label: "Cards", end: false },
  { to: "books", label: "Bookkeeping", end: false },
  { to: "analytics", label: "Analytics", end: false },
];

/**
 * A business and its tabs. The order form is a program underneath, so the program pages (form
 * builder, orders list and detail, analytics) are reused here with order wording.
 */
export function BusinessLayout() {
  const { businessId } = useParams<{ businessId: string }>();
  const { data: business, isLoading, error } = useBusiness(businessId);
  const { data: program } = useProgram(business?.orderForm?.id);
  usePageMeta({ title: business?.name ?? "Business" });

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-muted-foreground">
          {error instanceof ApiError && error.statusCode === 403 ? "You do not have access to this business." : "This business could not be found."}
        </p>
        <LinkButton to="/admin/businesses" variant="outline" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Back to businesses
        </LinkButton>
      </div>
    );
  }
  if (isLoading || !business) return <Loading label="Loading business" />;

  // Orders use the business's own statuses, worded and coloured as it chose.
  const orderStatuses = business.statusConfig.order;
  const terms: SubmissionTerms = {
    ...ORDER_TERMS,
    statuses: orderStatuses.map((s) => s.key),
    statusLabel: (status) => statusLabel(orderStatuses, status),
    statusTone: (status) => statusTone(orderStatuses, status),
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        className="relative flex min-h-40 w-full flex-col justify-end overflow-hidden rounded-2xl border border-border/70 shadow-glow sm:min-h-48"
        style={{ background: `linear-gradient(135deg, ${business.brandColor}, #0f172a)` }}
      >
        {business.logoUrl ? (
          <img src={business.logoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-start justify-end p-5">
            <Store className="h-12 w-12 text-white/30" aria-hidden="true" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="relative flex min-w-0 flex-col gap-1 p-4 pt-12 sm:p-6">
          <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl">{business.name}</h1>
          <p className="break-words text-sm font-medium text-white drop-shadow">
            {[business.phone, business.email].filter(Boolean).join(" · ") || "Add contact details on the Overview tab"}
          </p>
        </div>
      </div>

      <nav aria-label="Business sections" className="-mx-1 flex gap-1.5 overflow-x-auto rounded-xl border border-border/70 bg-card/60 p-1.5 backdrop-blur-sm sm:mx-0">
        {tabs
          .filter((tab) => !(tab as { paidOnly?: boolean }).paidOnly || program?.paymentConfig?.enabled)
          .map((tab) => (
          <NavLink
            key={tab.label}
            to={`/admin/businesses/${business.id}${tab.to ? `/${tab.to}` : ""}`}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                isActive ? "bg-gradient-brand text-white shadow-glow" : "text-muted-foreground hover:bg-gradient-brand-soft hover:text-primary",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <LazyOutlet
        context={{
          business,
          program,
          submissionPath: (id: string) => `/admin/businesses/${business.id}/orders/${id}`,
          terms,
        }}
      />
    </div>
  );
}

/** Pages built for programs only render once the business's order form has loaded. */
export function OrderFormGate({ children }: { children: React.ReactNode }) {
  const { program } = useBusinessOutletContext();
  if (!program) return <Loading label="Loading order form" />;
  return <>{children}</>;
}
