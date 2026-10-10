import { NavLink, useOutletContext } from "react-router-dom";
import { BookOpen, Coins, FileBarChart, LayoutGrid, Mic } from "lucide-react";
import { LazyOutlet } from "@/components/PageLoading";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useBusinessOutletContext } from "../businesses/BusinessLayout";
import type { Business } from "../businesses/api";

export interface BooksContext {
  business: Business;
  businessId: string;
  currency: string;
  /** Only people with admin access to the business can write in its books. */
  canEdit: boolean;
}

export const useBooks = () => useOutletContext<BooksContext>();

const sections = [
  { to: "", label: "My book", icon: LayoutGrid, end: true },
  { to: "ledger", label: "All entries", icon: BookOpen, end: false },
  { to: "loans", label: "Loans", icon: Coins, end: false },
  { to: "reports", label: "Reports", icon: FileBarChart, end: false },
  { to: "voice", label: "Voice notes", icon: Mic, end: false },
];

/** The bookkeeping of one business: its own menu, then the page for that part of the books. */
export function BookkeepingLayout() {
  const { business } = useBusinessOutletContext();
  usePageMeta({ title: `Bookkeeping: ${business.name}` });
  const context: BooksContext = { business, businessId: business.id, currency: business.currency, canEdit: business.myRole === "admin" };
  const base = `/admin/businesses/${business.id}/books`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Bookkeeping</h2>
        <p className="text-sm text-muted-foreground">Write down what comes in and goes out, keep track of loans and credit, and see your profit. Nothing is ever deleted.</p>
      </div>
      <nav aria-label="Bookkeeping sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sections.map((section) => (
          <NavLink
            key={section.label}
            to={section.to ? `${base}/${section.to}` : base}
            end={section.end}
            className={({ isActive }) =>
              cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                isActive ? "border-transparent bg-gradient-brand text-white shadow-glow" : "border-border/70 bg-card/70 text-muted-foreground hover:border-primary/40 hover:text-primary",
              )
            }
          >
            <section.icon className="h-4 w-4" />
            {section.label}
          </NavLink>
        ))}
      </nav>
      <LazyOutlet context={context} />
    </div>
  );
}
