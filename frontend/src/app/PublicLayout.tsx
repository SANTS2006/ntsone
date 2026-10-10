import { LazyOutlet } from "@/components/PageLoading";
import { SiteHeader } from "@/components/SiteHeader";
import { PublicFormFooter } from "@/features/legal/SiteFooter";

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <SiteHeader variant="compact" />
      <main id="main-content" tabIndex={-1} className="page-enter focus:outline-none mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <LazyOutlet />
      </main>
      <div className="border-t border-border/70 pt-2">
        <PublicFormFooter agreementText="Use of this site is subject to our" />
      </div>
    </div>
  );
}
