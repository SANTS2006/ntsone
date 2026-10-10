import * as React from "react";
import { useLocation } from "react-router-dom";
import { LazyOutlet } from "@/components/PageLoading";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "./SiteFooter";

/** Header and footer for the website's legal and support pages. */
export function LegalLayout() {
  const { pathname } = useLocation();

  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="page-enter focus:outline-none flex-1">
        <LazyOutlet />
      </main>
      <SiteFooter />
    </div>
  );
}
