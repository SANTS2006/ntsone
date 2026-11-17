import * as React from "react";
import { useOutletContext } from "react-router-dom";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Globe,
  Images,
  Mail,
  MapPin,
  Minus,
  Moon,
  Phone,
  Play,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Truck,
  Gift,
} from "lucide-react";
import { CoverImage } from "@/components/CoverImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderItem } from "@/types/api";
import type { BareThemeContext } from "@/app/BareLayout";
import { imageAt, itemImages, itemVideos, videoMp4, videoPoster } from "../payments/itemMedia";
import { withQuantity, type Selection } from "./OrderItemsPicker";

export interface StorefrontBusiness {
  name: string;
  logoUrl: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
}

interface OrderStorefrontProps {
  business: StorefrontBusiness | null;
  /** Shown when the business's own details are not available. */
  fallbackName: string;
  /** A wide picture for the top of the page. */
  coverUrl?: string | null;
  formTitle: string;
  formDescription?: string | null;
  formInstructions?: string | null;
  items: OrderItem[];
  /** What the customer had chosen before a refresh. */
  initialSelection?: Selection;
  /** The checkout form, given the chosen items so it can send them with the order. */
  renderCheckout: (selection: Selection, setSelection: React.Dispatch<React.SetStateAction<Selection>>) => React.ReactNode;
}

/** Scrolls to a part of the page without changing the address (the sticky header is allowed for by scroll-margin). */
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * A business's live order page, laid out like a small online shop: a header with the cart, a welcome banner, the
 * items as a browsable catalogue (each with its pictures and videos), the checkout form beside the order summary,
 * and the business's contact details.
 */
export function OrderStorefront({ business, fallbackName, coverUrl, formTitle, formDescription, items, initialSelection, renderCheckout }: OrderStorefrontProps) {
  const themeContext = useOutletContext<BareThemeContext | undefined>();
  const name = business?.name ?? fallbackName;
  const [selection, setSelection] = React.useState<Selection>(() => initialSelection ?? {});
  const [openItemId, setOpenItemId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [checkoutInView, setCheckoutInView] = React.useState(false);
  const checkoutRef = React.useRef<HTMLElement>(null);

  // Only items still for sale count (a saved order may name one that has since been removed).
  const chosen = items.filter((item) => (selection[item.id] ?? 0) > 0);
  const count = chosen.reduce((sum, item) => sum + selection[item.id]!, 0);
  const total = chosen.reduce((sum, item) => sum + item.priceMinor * selection[item.id]!, 0);
  const openItem = items.find((i) => i.id === openItemId) ?? null;

  const changeQuantity = (item: OrderItem, compute: (current: number) => number) => setSelection((previous) => withQuantity(previous, item, compute));

  React.useEffect(() => {
    const el = checkoutRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCheckoutInView(Boolean(entry?.isIntersecting)), { rootMargin: "0px 0px -30% 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const search = query.trim().toLowerCase();
  const shown = search ? items.filter((i) => `${i.name} ${i.description ?? ""}`.toLowerCase().includes(search)) : items;

  const contacts = [
    business?.phone && { icon: Phone, label: "Call or text", value: business.phone, href: `tel:${business.phone.replace(/[^\d+]/g, "")}` },
    business?.email && { icon: Mail, label: "Email", value: business.email, href: `mailto:${business.email}` },
    business?.address && { icon: MapPin, label: "Find us", value: business.address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}` },
    business?.website && {
      icon: Globe,
      label: "Website",
      value: business.website.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
      href: /^https?:\/\//i.test(business.website) ? business.website : `https://${business.website}`,
    },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href: string }[];

  const navLinks = [
    { id: "shop", label: "Shop" },
    { id: "checkout", label: "Checkout" },
    ...(contacts.length > 0 ? [{ id: "contact", label: "Contact" }] : []),
  ];

  const steps = [
    { icon: Images, title: "Browse", text: "Look through the pictures and videos of every item." },
    { icon: ShoppingCart, title: "Add to your order", text: "Choose what you want and how many." },
    { icon: Smartphone, title: "Pay with mobile money", text: "Confirm your order and pay safely online." },
    { icon: Truck, title: "We take it from there", text: "We get your order ready and keep in touch." },
  ];

  return (
    <div id="top" className="sf-page relative flex min-h-screen flex-col overflow-x-clip">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex min-w-0 items-center gap-2.5 text-left">
            {business?.logoUrl ? (
              <img src={imageAt(business.logoUrl, 96)} alt={`${name} logo`} className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain" />
            ) : (
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
                <ShoppingBag className="h-5 w-5" />
              </span>
            )}
            <span className="truncate text-base font-bold tracking-tight">{name}</span>
          </button>
          <nav aria-label="Page sections" className="ml-auto hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <button key={link.id} type="button" onClick={() => scrollToSection(link.id)} className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                {link.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-2">
            {themeContext && (
              <Button type="button" variant="ghost" size="icon" onClick={themeContext.toggleTheme} aria-label={themeContext.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
                {themeContext.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}
            <Button type="button" onClick={() => scrollToSection("checkout")} className="relative gap-2 rounded-full" aria-label={`Your order: ${count} item${count === 1 ? "" : "s"}, ${formatMinor(total)}`}>
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">{count > 0 ? formatMinor(total) : "Cart"}</span>
              {count > 0 && (
                <span key={count} className="sf-pop absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-white ring-2 ring-background">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="sf-hero relative isolate overflow-hidden text-white">
        <div aria-hidden className="sf-aurora absolute inset-0 -z-10" />
        <div aria-hidden className="sf-grid absolute inset-0 -z-10 opacity-40" />
        <div aria-hidden className="sf-blob absolute -left-24 top-10 -z-10 h-72 w-72 rounded-full bg-cyan-400/30 blur-3xl" />
        <div aria-hidden className="sf-blob absolute -bottom-24 right-10 -z-10 h-80 w-80 rounded-full bg-violet-500/30 blur-3xl [animation-delay:-6s]" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-28">
          <div className="flex flex-col items-start gap-6">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                {formTitle && formTitle !== name ? formTitle : "Order online"}
              </span>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="break-words text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
                <span className="bg-gradient-to-r from-white via-cyan-100 to-white bg-clip-text text-transparent">{name}</span>
              </h1>
            </Reveal>
            {(business?.description || formDescription) && (
              <Reveal delay={200}>
                <p className="max-w-xl whitespace-pre-line break-words text-base text-white/85 sm:text-lg">{business?.description || formDescription}</p>
              </Reveal>
            )}
            <Reveal delay={300} className="flex flex-wrap gap-3">
              <Button type="button" size="lg" onClick={() => scrollToSection("shop")} className="sf-shine rounded-full bg-white px-7 text-blue-700 shadow-xl hover:bg-white/90">
                <ShoppingBag className="h-4 w-4" />
                Shop now
                <ArrowRight className="h-4 w-4" />
              </Button>
              {contacts.length > 0 && (
                <Button type="button" size="lg" variant="outline" onClick={() => scrollToSection("contact")} className="rounded-full border-white/40 bg-white/10 px-7 text-white backdrop-blur hover:bg-white/20 hover:text-white">
                  Contact us
                </Button>
              )}
            </Reveal>
            {(business?.phone || business?.address) && (
              <Reveal delay={400} className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
                {business?.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {business.phone}
                  </span>
                )}
                {business?.address && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {business.address}
                  </span>
                )}
              </Reveal>
            )}
          </div>
          <Reveal delay={250} className="flex justify-center">
            <HeroScene coverUrl={coverUrl} count={count} total={total} />
          </Reveal>
        </div>
        <svg aria-hidden viewBox="0 0 1440 60" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-8 w-full text-background sm:h-12">
          <path d="M0 60V30C240 0 480 0 720 24s480 30 720 6v30z" fill="currentColor" />
        </svg>
      </section>

      {/* How it works */}
      <section aria-label="How ordering works" className="mx-auto w-full max-w-6xl px-4 pb-4 pt-8 sm:pt-12">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 90} className="h-full">
                <Tilt className="h-full">
                  <div className="relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                    <span aria-hidden className="absolute -right-2 -top-4 select-none text-7xl font-black text-primary/10">{i + 1}</span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-glow">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <h3 className="text-base font-bold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </Tilt>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* Catalogue */}
      <section id="shop" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 sm:py-16">
        <Reveal className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">Shop</span>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Our products</h2>
            <p className="text-sm text-muted-foreground sm:text-base">
              {formDescription && business?.description ? formDescription : "Tap an item to see its pictures and videos, then add it to your order."}
            </p>
          </div>
          {items.length > 6 && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" placeholder="Search products" aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-full pl-9" />
            </div>
          )}
        </Reveal>

        {items.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">There are no items for sale here yet. Please check back soon.</p>
        ) : shown.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nothing matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((item, i) => (
              <li key={item.id}>
                <Reveal delay={(i % 4) * 80} className="h-full">
                  <ProductCard item={item} quantity={selection[item.id] ?? 0} onOpen={() => setOpenItemId(item.id)} onChange={(compute) => changeQuantity(item, compute)} />
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Checkout */}
      <section id="checkout" ref={checkoutRef} className="relative scroll-mt-16 overflow-hidden border-y border-border/60">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-muted/40 to-primary/5" />
        <div aria-hidden className="sf-blob absolute -right-20 top-10 -z-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
          <Reveal className="mb-8 flex flex-col gap-2">
            <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">Checkout</span>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Almost there</h2>
            <p className="text-sm text-muted-foreground sm:text-base">Check your order, then tell us your details so we can get it to you.</p>
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
            <Reveal delay={120} className="lg:order-2 lg:sticky lg:top-20">
              <CartSummary chosen={chosen} selection={selection} total={total} onChange={changeQuantity} onOpen={(id) => setOpenItemId(id)} />
            </Reveal>
            <Reveal className="min-w-0 lg:order-1">
              <div className="min-w-0 rounded-3xl border border-border/70 bg-card p-4 shadow-lg sm:p-7">{renderCheckout(selection, setSelection)}</div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Contact */}
      {contacts.length > 0 && (
        <section id="contact" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 sm:py-16">
          <Reveal className="mb-8 flex flex-col gap-2">
            <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">Contact</span>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Get in touch</h2>
          </Reveal>
          <ul className="flex flex-wrap gap-4">
            {contacts.map((c, i) => (
              <li key={c.label} className="min-w-0 max-w-full flex-1 sm:min-w-fit">
                <Reveal delay={i * 80} className="h-full">
                  <Tilt className="h-full">
                    <a
                      href={c.href}
                      target={c.href.startsWith("http") ? "_blank" : undefined}
                      rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="group flex h-full items-start gap-3 rounded-3xl border border-border/70 bg-card p-4 shadow-sm transition hover:border-primary/50 hover:shadow-glow"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-glow transition group-hover:scale-110 group-hover:rotate-6">
                        <c.icon className="h-5 w-5" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</span>
                        <span className="break-words text-sm font-semibold sm:whitespace-nowrap">{c.value}</span>
                      </span>
                    </a>
                  </Tilt>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-auto border-t border-border/60 bg-muted/30 py-8">
        <p className="mx-auto w-full max-w-6xl px-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {name}
        </p>
      </footer>

      {/* Floating cart, until the checkout is on screen */}
      {count > 0 && !checkoutInView && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            onClick={() => scrollToSection("checkout")}
            className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-full bg-primary px-5 py-3.5 text-sm text-primary-foreground shadow-2xl ring-1 ring-black/10 transition hover:brightness-110"
          >
            <span className="flex items-center gap-2 font-medium">
              <ShoppingCart className="h-4 w-4" />
              {count} item{count === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              Checkout · {formatMinor(total)}
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}

      <Dialog open={openItem !== null} onOpenChange={(open) => !open && setOpenItemId(null)}>
        {openItem && (
          <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:p-0">
            <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <MediaGallery key={openItem.id} item={openItem} />
              <div className="flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex flex-col gap-2 pr-6">
                  <DialogTitle className="text-xl leading-tight sm:text-2xl">{openItem.name}</DialogTitle>
                  <p className="text-2xl font-bold text-primary">{formatMinor(openItem.priceMinor)}</p>
                </div>
                <DialogDescription className={cn("whitespace-pre-line text-sm", !openItem.description && "sr-only")}>
                  {openItem.description || `Pictures and price of ${openItem.name}.`}
                </DialogDescription>
                {openItem.maxQuantity && <p className="text-xs text-muted-foreground">Up to {openItem.maxQuantity} per order.</p>}
                <div className="mt-auto flex flex-col gap-3 border-t border-border/60 pt-4">
                  {(selection[openItem.id] ?? 0) === 0 ? (
                    <Button type="button" size="lg" onClick={() => changeQuantity(openItem, () => 1)}>
                      <Plus className="h-4 w-4" />
                      Add to order
                    </Button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">In your order</span>
                        <QuantityStepper item={openItem} quantity={selection[openItem.id] ?? 0} onChange={(compute) => changeQuantity(openItem, compute)} size="lg" />
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => {
                          setOpenItemId(null);
                          window.setTimeout(() => scrollToSection("checkout"), 150);
                        }}
                      >
                        Go to checkout · {formatMinor(total)}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** Fades and slides its content in the first time it scrolls into view. */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn("transition-[opacity,transform] duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none", shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0", className)}
    >
      {children}
    </div>
  );
}

/** Tilts toward the pointer in 3D while it hovers. */
function Tilt({ children, className, max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={cn("transition-transform duration-200 ease-out will-change-transform motion-reduce:transform-none", className)}>
      {children}
    </div>
  );
}

/** The 3D picture on the right of the welcome banner: the cover picture on a tilting card, or a spinning cube, with floating chips. */
function HeroScene({ coverUrl, count, total }: { coverUrl?: string | null; count: number; total: number }) {
  const faces = [ShoppingBag, Gift, Star, Truck, ShieldCheck, Sparkles];
  return (
    <Tilt max={10} className="relative w-full max-w-md">
      <div className="sf-scene relative mx-auto flex aspect-square w-full max-w-sm items-center justify-center sm:max-w-md">
        <div aria-hidden className="absolute inset-6 rounded-full bg-white/10 blur-2xl" />
        {coverUrl ? (
          <div className="sf-float relative aspect-[4/3] w-[86%] overflow-hidden rounded-3xl border border-white/30 bg-white/10 shadow-2xl shadow-blue-950/40 [transform:rotateY(-14deg)_rotateX(6deg)]">
            <CoverImage src={imageAt(coverUrl, 1200)} />
          </div>
        ) : (
          <div className="sf-cube" aria-hidden>
            {faces.map((Icon, i) => (
              <span key={i} className="sf-face">
                <Icon className="h-1/2 w-1/2 text-white" />
              </span>
            ))}
          </div>
        )}
        <span className="sf-float absolute left-0 top-6 flex items-center gap-2 rounded-2xl border border-white/30 bg-white/15 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur [animation-delay:-2s]">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          Safe mobile money
        </span>
        <span className="sf-float absolute bottom-8 right-0 flex items-center gap-2 rounded-2xl border border-white/30 bg-white/15 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur [animation-delay:-4s]">
          <ShoppingCart className="h-4 w-4 text-cyan-200" />
          {count > 0 ? `${count} in your order · ${formatMinor(total)}` : "Your order is empty"}
        </span>
        <span className="sf-float absolute -top-1 right-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/15 text-white shadow-xl backdrop-blur [animation-delay:-1s]">
          <Sparkles className="h-5 w-5" />
        </span>
      </div>
    </Tilt>
  );
}

function QuantityStepper({ item, quantity, onChange, size = "sm" }: { item: OrderItem; quantity: number; onChange: (compute: (current: number) => number) => void; size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${item.name}`}>
      <Button type="button" variant="outline" size="icon" className={cn("rounded-full", big ? "h-10 w-10" : "h-8 w-8")} aria-label={`Remove one ${item.name}`} disabled={quantity === 0} onClick={() => onChange((q) => q - 1)}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <input
        aria-label={`${item.name} quantity`}
        inputMode="numeric"
        className={cn("rounded-md border border-input bg-background text-center text-sm font-semibold", big ? "h-10 w-14" : "h-8 w-10")}
        value={quantity}
        onChange={(e) => onChange(() => Number(e.target.value.replace(/\D/g, "")))}
      />
      <Button type="button" variant="outline" size="icon" className={cn("rounded-full", big ? "h-10 w-10" : "h-8 w-8")} aria-label={`Add one ${item.name}`} disabled={quantity >= (item.maxQuantity ?? 1000)} onClick={() => onChange((q) => q + 1)}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ProductCard({ item, quantity, onOpen, onChange }: { item: OrderItem; quantity: number; onOpen: () => void; onChange: (compute: (current: number) => number) => void }) {
  const images = itemImages(item);
  const videos = itemVideos(item);
  const cover = images[0] ? imageAt(images[0], 600) : videos[0] ? videoPoster(videos[0], 600) : undefined;
  return (
    <article className={cn("card-modern group flex h-full flex-col", quantity > 0 && "!border-primary/70 ring-2 ring-primary/30")}>
      <button type="button" onClick={onOpen} className="relative aspect-square overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" aria-label={`View ${item.name}`}>
        {cover ? (
          <CoverImage src={cover} loading="lazy" className="transition duration-500 group-hover:scale-105" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-brand-soft">
            <ShoppingBag className="h-10 w-10 text-primary/40" />
          </span>
        )}
        {!images[0] && videos[0] && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/55 p-3 text-white">
              <Play className="h-5 w-5 fill-current" />
            </span>
          </span>
        )}
        <span className="absolute bottom-2 left-2 flex gap-1.5">
          {images.length > 1 && (
            <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              <Images className="h-3 w-3" />
              {images.length}
            </span>
          )}
          {videos.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              <Play className="h-3 w-3 fill-current" />
              Video
            </span>
          )}
        </span>
        {quantity > 0 && <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow">{quantity} in order</span>}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-sm font-semibold sm:text-base">
          <button type="button" onClick={onOpen} className="text-left hover:underline">
            {item.name}
          </button>
        </h3>
        {item.description && <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">{item.description}</p>}
        <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-extrabold text-primary">{formatMinor(item.priceMinor)}</span>
          {quantity === 0 ? (
            <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => onChange(() => 1)} aria-label={`Add ${item.name} to your order`}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          ) : (
            <QuantityStepper item={item} quantity={quantity} onChange={onChange} />
          )}
        </div>
      </div>
    </article>
  );
}

type Media = { kind: "image" | "video"; url: string };

/** An item's pictures and videos: one large at a time, with arrows and a strip of thumbnails. */
function MediaGallery({ item }: { item: OrderItem }) {
  const media: Media[] = [...itemImages(item).map((url) => ({ kind: "image" as const, url })), ...itemVideos(item).map((url) => ({ kind: "video" as const, url }))];
  const [index, setIndex] = React.useState(0);
  const current = media[index];
  const go = (step: number) => setIndex((i) => (i + step + media.length) % media.length);

  if (!current) {
    return (
      <div className="flex aspect-square items-center justify-center bg-gradient-brand-soft md:aspect-auto md:min-h-[24rem]">
        <ShoppingBag className="h-16 w-16 text-primary/30" />
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col bg-black/95"
      onKeyDown={(e) => {
        if (media.length < 2) return;
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="relative aspect-square w-full md:aspect-[4/5]">
        {current.kind === "image" ? (
          <img src={imageAt(current.url, 1200)} alt={`${item.name}, picture ${index + 1} of ${media.length}`} className="h-full w-full object-contain" />
        ) : (
          <video key={current.url} controls playsInline preload="metadata" poster={videoPoster(current.url, 1000)} className="h-full w-full bg-black object-contain" aria-label={`Video of ${item.name}`}>
            <source src={videoMp4(current.url)} type="video/mp4" />
            <source src={current.url} />
            Your browser cannot play this video.
          </video>
        )}
        {media.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-gray-900 shadow transition hover:bg-white" aria-label="Previous">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-gray-900 shadow transition hover:bg-white" aria-label="Next">
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
              {index + 1} / {media.length}
            </span>
          </>
        )}
      </div>
      {media.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto p-2.5" role="tablist" aria-label={`Pictures and videos of ${item.name}`}>
          {media.map((m, i) => (
            <button
              key={m.url}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={m.kind === "image" ? `Picture ${i + 1}` : `Video ${i + 1 - itemImages(item).length}`}
              onClick={() => setIndex(i)}
              className={cn("relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition", i === index ? "ring-white" : "opacity-60 ring-transparent hover:opacity-100")}
            >
              {m.kind === "image" ? (
                <img src={imageAt(m.url, 160)} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <>
                  {videoPoster(m.url, 160) ? <img src={videoPoster(m.url, 160)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="block h-full w-full bg-gray-700" />}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-4 w-4 fill-white text-white" />
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CartSummary({
  className,
  chosen,
  selection,
  total,
  onChange,
  onOpen,
}: {
  className?: string;
  chosen: OrderItem[];
  selection: Selection;
  total: number;
  onChange: (item: OrderItem, compute: (current: number) => number) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <aside aria-labelledby="cart-heading" className={cn("flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-4 shadow-lg sm:p-5", className)}>
      <h3 id="cart-heading" className="flex items-center gap-2 text-lg font-semibold">
        <ShoppingCart className="h-5 w-5 text-primary" />
        Your order
      </h3>
      {chosen.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-6 text-center">
          <ShoppingBag className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Your order is empty. Add something from the shop to continue.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => scrollToSection("shop")}>
            Browse products
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60" aria-live="polite">
          {chosen.map((item) => {
            const quantity = selection[item.id] ?? 0;
            const thumb = itemImages(item)[0] ?? (itemVideos(item)[0] ? videoPoster(itemVideos(item)[0]!, 160) : undefined);
            return (
              <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <button type="button" onClick={() => onOpen(item.id)} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted" aria-label={`View ${item.name}`}>
                  {thumb ? <img src={imageAt(thumb, 160)} alt="" className="h-full w-full object-cover" /> : <ShoppingBag className="m-auto h-5 w-5 text-muted-foreground/50" />}
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
                    <p className="shrink-0 text-sm font-semibold">{formatMinor(item.priceMinor * quantity)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <QuantityStepper item={item} quantity={quantity} onChange={(compute) => onChange(item, compute)} />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Remove ${item.name} from your order`} onClick={() => onChange(item, () => 0)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-border/60 pt-3 text-base font-bold">
        <span>Total</span>
        <span>{formatMinor(total)}</span>
      </div>
    </aside>
  );
}
