import * as React from "react";
import { NavLink } from "react-router-dom";
import { LazyOutlet } from "@/components/PageLoading";
import { Building2, DatabaseBackup, Gift, ScrollText, Vault, Wrench, Inbox, Landmark, Wallet, LayoutDashboard, ListChecks, LogOut, Menu, MessageSquarePlus, Settings, Store, Users, Vote, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "./AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileMenu } from "@/components/ProfileMenu";
import { Avatar } from "@/components/Avatar";
import { FeedbackDialog } from "@/features/support/FeedbackDialog";
import { InstallAppButton } from "@/components/InstallApp";
import { COMPANY_NAME, PRODUCT_NAME, TAGLINE } from "@/lib/contact";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/programs", label: "Programs", icon: ListChecks, end: false },
  { to: "/admin/polls", label: "Voting Polls", icon: Vote, end: false },
  { to: "/admin/businesses", label: "Businesses", icon: Store, end: false },
  // Tenant team management -- only the tenant's own admin (owner) can invite/manage teammates.
  // Personal lists of things to buy and have, and what was gotten.
  { to: "/admin/wishlists", label: "Wish List", icon: Gift, end: false },
  { to: "/admin/users", label: "Users", icon: Users, end: false, adminOnly: true },
  // The payment fund: money received from registrations and orders, and withdrawals.
  { to: "/admin/funds", label: "Payment fund", icon: Wallet, end: false, adminOnly: true },
  { to: "/admin/settings", label: "Settings", icon: Settings, end: false },
  // Cross-tenant, read-only oversight -- only the one platform super_admin sees this.
  { to: "/admin/tenants", label: "Accounts", icon: Building2, end: false, platformOnly: true },
  // Feedback, contact messages, and reports sent to the platform team.
  { to: "/admin/inbox", label: "Inbox", icon: Inbox, end: false, platformOnly: true },
  // Withdrawals waiting for approval, payments that need a look, and Monime balances.
  { to: "/admin/platform-payments", label: "Payments", icon: Landmark, end: false, platformOnly: true },
  { to: "/admin/platform-fund", label: "Platform fund", icon: Vault, end: false, platformOnly: true },
  { to: "/admin/backups", label: "Backup & Recovery", icon: DatabaseBackup, end: false, platformOnly: true },
  { to: "/admin/maintenance", label: "Maintenance", icon: Wrench, end: false, platformOnly: true },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText, end: false, platformOnly: true },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
      <BrandLogo className="h-9" />
      <span className="gradient-text">NTSOne</span>
    </div>
  );
}

function NavList({ role, onNavigate }: { role?: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="-mr-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pb-2 pr-2 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]">
      {navItems
        .filter((item) => (!item.adminOnly || role === "admin") && (!item.platformOnly || role === "super_admin"))
        .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-brand text-white shadow-glow"
                  : "text-muted-foreground hover:bg-gradient-brand-soft hover:text-primary",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
    </nav>
  );
}

function ProfileFooter({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="mt-2 flex shrink-0 flex-col gap-3 border-t border-border/70 pt-4">
      <div className="flex items-center gap-2.5 px-1">
        <Avatar name={user.name} src={user.avatarUrl} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
            {user.role.replace("_", " ")}
          </p>
        </div>
      </div>
      {user.role !== "super_admin" && (
        <FeedbackDialog
          trigger={
            <Button variant="ghost" size="sm" className="justify-start">
              <MessageSquarePlus className="h-4 w-4" />
              Send feedback
            </Button>
          }
        />
      )}
      <InstallAppButton variant="ghost" className="justify-start" />
      <Button variant="ghost" size="sm" className="justify-start text-destructive hover:bg-destructive/10" onClick={onLogout}>
        <LogOut className="h-4 w-4" />
        Log out
      </Button>
    </div>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-transparent">
      {/* Persistent top navbar, shown on every screen size */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border/70 bg-card/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Open navigation"
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <BrandMark />
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </header>

      {/* Desktop sidebar: always visible, permanent, no toggle */}
      <aside className="fixed inset-y-0 left-0 top-16 z-30 hidden w-64 flex-col overflow-hidden border-r border-border/70 bg-card/90 px-4 py-5 backdrop-blur-md md:flex">
        <NavList role={user?.role} />
        <ProfileFooter onLogout={() => logout()} />
      </aside>

      {/* Mobile sidebar drawer: hidden by default, opened via the navbar hamburger.
          It renders above the navbar (higher z-index, full viewport height) with its
          own header row (logo left, close button right), per the small-screen spec. */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-[100dvh] w-64 flex-col overflow-hidden border-r border-border/70 bg-card px-4 py-4 shadow-2xl transition-transform duration-200 md:hidden",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between pb-4">
          <BrandMark />
          <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <NavList role={user?.role} onNavigate={() => setMobileSidebarOpen(false)} />
        <ProfileFooter onLogout={() => logout()} />
      </aside>

      <main id="main-content" tabIndex={-1} className="page-enter focus:outline-none min-h-screen pt-16 md:pl-64">
        <div className="p-4 sm:p-6 lg:p-8">
          <LazyOutlet />
        </div>
        <footer className="border-t border-border/60 px-4 py-5 text-center text-xs text-muted-foreground sm:px-6">
          <p className="gradient-text mx-auto w-fit text-sm font-bold">{TAGLINE}</p>
          <p className="mt-1">
            &copy; {new Date().getFullYear()} {COMPANY_NAME}. {PRODUCT_NAME}.
          </p>
        </footer>
      </main>
    </div>
  );
}
