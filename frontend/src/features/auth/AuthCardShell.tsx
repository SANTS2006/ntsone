import type { LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Centered card with a gradient header, shared by the account-recovery screens. */
export function AuthCardShell({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="page-enter flex min-h-screen items-center justify-center p-4 focus:outline-none sm:p-8">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-2xl">
        <div className="relative bg-gradient-brand px-8 pb-10 pt-6 text-white">
          <div className="pointer-events-none absolute inset-0 bg-gradient-radial-soft opacity-60" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-9 items-center justify-center rounded-lg bg-white px-1.5 shadow-sm">
                <BrandLogo className="h-7" />
              </span>
              NTSOne
            </div>
            <ThemeToggle className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
          </div>
          <div className="relative mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Icon className="h-7 w-7" />
          </div>
          <h1 className="relative mt-4 text-2xl font-bold">{title}</h1>
          <p className="relative mt-1 text-sm text-white/80">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-6 p-8">{children}</div>
      </div>
    </main>
  );
}
