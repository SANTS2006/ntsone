import * as React from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Wrench } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";
import { apiFetch } from "@/lib/api";

export type MaintenanceArea = "site" | "auth" | "admin" | "registration" | "voting" | "payment" | "verify";

export interface PublicMaintenance {
  active: boolean;
  message: string;
  mode: "banner" | "page";
  scope: "all" | "selected";
  areas: MaintenanceArea[];
  endsAt: string | null;
  updatedAt: string | null;
}

export const AREA_LABEL: Record<MaintenanceArea, { label: string; hint: string }> = {
  site: { label: "The website", hint: "Home page, contact and policy pages" },
  auth: { label: "Sign-in and sign-up pages", hint: "Always a banner, so the platform team can still sign in" },
  admin: { label: "The admin app", hint: "Dashboard, programs, polls, businesses, payments and everything after sign-in" },
  registration: { label: "Registration and order forms", hint: "The public pages people fill in" },
  voting: { label: "Voting pages", hint: "Voter sign-in, voting and paid voting" },
  payment: { label: "Payment status page", hint: "Where people land after paying" },
  verify: { label: "ID card and ticket checks", hint: "The pages opened by scanning a QR code" },
};

/** Which part of the site an address belongs to. */
export function areaFor(pathname: string): MaintenanceArea {
  if (pathname.startsWith("/admin")) return "admin";
  if (/^\/(login|register|verify-email|forgot-password|reset-password)(\/|$)/.test(pathname)) return "auth";
  if (pathname.startsWith("/vote/")) return "voting";
  if (pathname.startsWith("/payment/")) return "payment";
  if (pathname.startsWith("/programs/") || pathname.startsWith("/order/")) return "registration";
  if (pathname.startsWith("/verify")) return "verify";
  return "site";
}

export const maintenanceKey = ["maintenance", "public"] as const;
export const getPublicMaintenance = () => apiFetch<PublicMaintenance>("/public/maintenance");

const endText = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null);

function Strip({ data, staff }: { data: PublicMaintenance; staff: boolean }) {
  const back = endText(data.endsAt);
  return (
    <div role="status" className="relative z-[60] flex items-start gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-sm text-amber-950 dark:text-amber-100">
      <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 break-words">
        <span className="font-semibold">Maintenance. </span>
        {data.message}
        {back ? ` Expected back: ${back}.` : ""}
        {staff ? " (You are signed in as the platform team, so you can keep working.)" : ""}
      </p>
    </div>
  );
}

function MaintenanceScreen({ data }: { data: PublicMaintenance }) {
  const back = endText(data.endsAt);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card/90 p-8 text-center shadow-lg backdrop-blur">
        <BrandLogo className="h-14" />
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
          <Wrench className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">We&apos;ll be right back</h1>
        <p className="break-words text-sm text-muted-foreground">{data.message}</p>
        {back && (
          <p className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Expected back: {back}
          </p>
        )}
        <p className="text-xs text-muted-foreground">This page checks again by itself. You don&apos;t need to do anything.</p>
      </div>
    </main>
  );
}

/**
 * Wraps the whole app. When the platform team has switched maintenance on, it shows the notice on the parts of the site
 * they chose: a strip at the top, or (for "page" mode) the maintenance screen in place of the page. The platform team is
 * never locked out, and the sign-in pages only ever get the strip so they can always sign in.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  // The notice is small and public, so a failure to fetch it simply means "no notice".
  const { data } = useQuery({ queryKey: maintenanceKey, queryFn: getPublicMaintenance, refetchInterval: 60_000, staleTime: 30_000, retry: false, meta: { silent: true } });
  if (!data?.active) return <>{children}</>;

  const area = areaFor(pathname);
  if (!data.areas.includes(area)) return <>{children}</>;

  const staff = user?.role === "super_admin";
  if (data.mode === "page" && !staff && area !== "auth") return <MaintenanceScreen data={data} />;
  return (
    <>
      <Strip data={data} staff={staff} />
      {children}
    </>
  );
}
