import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown, LayoutDashboard, Menu, X } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#modules", label: "Modules" },
  { href: "#payments", label: "Payments" },
  { href: "#bookkeeping", label: "Bookkeeping" },
  { href: "#wishlist", label: "Wish List" },
  { href: "#paperwork", label: "Documents" },
  { href: "#voting", label: "Voting" },
  { href: "#designs", label: "Designs" },
  { href: "#faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

/** The links shown in the bar itself; the others open from "More" so the bar never runs out of room. */
const NAV_MAIN = NAV.slice(0, 5);
const NAV_MORE = NAV.slice(5);

/** The section the reader is in, from the section ids (the last heading to have passed the top third of the screen). */
function useActiveSection(ids: string[]) {
  const [active, setActive] = React.useState<string>("");
  React.useEffect(() => {
    const update = () => {
      const line = window.innerHeight * 0.35;
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = `#${id}`;
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ids]);
  return active;
}


/** Section links scroll within the landing page (or lead back to it from other pages); others (like Contact) open their own page. */
function NavLink({ href, className, onClick, children }: { href: string; className: string; onClick?: () => void; children: React.ReactNode }) {
  const { pathname } = useLocation();
  if (href.startsWith("/")) {
    return (
      <Link to={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return pathname === "/" ? (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ) : (
    <Link to={`/${href}`} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}

function AuthButtons({ stacked }: { stacked?: boolean }) {
  const { user } = useAuth();
  if (user) {
    return (
      <LinkButton to="/admin" variant="default" size={stacked ? "lg" : "default"} className="rounded-full">
        <LayoutDashboard className="h-4 w-4" />
        Go to dashboard
      </LinkButton>
    );
  }
  return (
    <div className={cn("flex gap-2", stacked && "flex-col")}>
      <LinkButton to="/login" variant="outline" size={stacked ? "lg" : "default"} className="rounded-full">
        Sign in
      </LinkButton>
      <LinkButton to="/register" variant="default" size={stacked ? "lg" : "default"} className="rounded-full">
        Get started
      </LinkButton>
    </div>
  );
}

const SECTION_IDS = NAV.filter((n) => n.href.startsWith("#")).map((n) => n.href.slice(1));

/**
 * A floating dock: a brand capsule, a pill of section links with a lit marker for the current section,
 * and a capsule for theme and sign-in. On smaller screens the links open as a full-screen menu.
 */
export function SiteHeader({ variant = "full" }: { variant?: "full" | "compact" }) {
  const compact = variant === "compact";
  const { pathname } = useLocation();
  const onLanding = pathname === "/";
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const spied = useActiveSection(onLanding ? SECTION_IDS : []);
  // On the landing page the current section lights up; elsewhere the page we are on does (e.g. Contact).
  const active = onLanding ? spied : (NAV.find((n) => n.href.startsWith("/") && n.href === pathname)?.href ?? "");

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The full-screen menu holds the page still and closes on Escape.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const capsule = cn(
    "rounded-full border backdrop-blur-xl transition-all duration-300",
    scrolled || open ? "border-border/70 bg-background/80 shadow-lg shadow-primary/5" : "border-border/40 bg-background/40",
  );

  return (
    <header className="sticky top-0 z-40 pt-3">
      <div className={cn("flex items-center justify-between gap-3", compact ? "mx-auto w-full max-w-5xl px-4" : "site-container")}>
        {/* Brand */}
        {onLanding ? (
          <a href="#top" aria-label="NTSOne, back to top" className={cn(capsule, "flex min-w-0 shrink-0 items-center gap-2 py-1.5 pl-2 pr-4")}>
            <BrandLogo className="h-8" />
            <span className="gradient-text whitespace-nowrap text-sm font-semibold tracking-tight sm:text-base">NTSOne</span>
          </a>
        ) : (
          <Link to="/" aria-label="NTSOne home" className={cn(capsule, "flex min-w-0 shrink-0 items-center gap-2 py-1.5 pl-2 pr-4")}>
            <BrandLogo className="h-8" />
            <span className="gradient-text hidden whitespace-nowrap text-sm font-semibold tracking-tight min-[420px]:inline sm:text-base">NTSOne</span>
          </Link>
        )}

        {/* Section links */}
        <nav aria-label="Sections" className={cn(capsule, "hidden items-center gap-0.5 p-1", compact ? "hidden" : "xl:flex")}>
          {NAV_MAIN.map((item) => {
            const isActive = item.href === active;
            return (
              <NavLink
                key={item.href}
                href={item.href}
                className={cn(
                  "relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-300",
                  isActive ? "bg-gradient-brand text-white shadow-glow" : "text-muted-foreground hover:bg-gradient-brand-soft hover:text-primary",
                )}
              >
                {item.label}
              </NavLink>
            );
          })}
          {/* Not modal: a small menu should not lock the page or take focus away from it. */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-ring",
                NAV_MORE.some((m) => m.href === active) ? "bg-gradient-brand text-white shadow-glow" : "text-muted-foreground hover:bg-gradient-brand-soft hover:text-primary",
              )}
            >
              More
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="min-w-44 rounded-2xl p-2">
              {NAV_MORE.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <NavLink href={item.href} className="w-full cursor-pointer">
                    {item.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Theme, sign in, menu */}
        <div className={cn(capsule, "flex shrink-0 items-center gap-1.5 p-1")}>
          <ThemeToggle />
          {compact ? (
            <LinkButton to="/login" variant="default" size="sm" className="rounded-full">
              Login
            </LinkButton>
          ) : (
            <div className="hidden sm:block">
              <AuthButtons />
            </div>
          )}
          <Button
            variant="outline"
            size="icon"
            className={cn("rounded-full xl:hidden", compact && "hidden")}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Full-screen menu for smaller screens */}
      {open && !compact && (
        <div className="fixed inset-0 z-[-1] animate-fade-in overflow-y-auto bg-background/95 backdrop-blur-xl xl:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="site-container flex min-h-full flex-col justify-center gap-8 pb-10 pt-28">
            <nav aria-label="Sections" className="grid gap-2 sm:grid-cols-2">
              {NAV.map((item, index) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group flex items-baseline gap-4 rounded-2xl border border-border/60 bg-card/60 px-5 py-4 transition-all hover:border-primary/40 hover:bg-gradient-brand-soft",
                    item.href === active && "border-primary/50 bg-gradient-brand-soft",
                  )}
                >
                  <span className="text-xs font-semibold tabular-nums text-primary/70">{String(index + 1).padStart(2, "0")}</span>
                  <span className="text-xl font-semibold tracking-tight">{item.label}</span>
                  <ArrowRight className="ml-auto h-4 w-4 -translate-x-1 self-center text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </NavLink>
              ))}
            </nav>
            <div className="sm:hidden">
              <AuthButtons stacked />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

