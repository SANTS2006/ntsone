import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { SiteHeader } from "@/components/SiteHeader";
import { LinkButton } from "@/components/ui/link-button";
import { cn } from "@/lib/utils";
import { SiteFooter } from "../legal/SiteFooter";
import { CountUp, Reveal, Stage } from "./motion";
import {
  CAPABILITIES,
  EXPERIENCE,
  Faq,
  FeaturesGrid,
  Roles,
  SectionHeading,
  Security,
  Spotlights,
  Steps,
  USE_CASES,
} from "./sections";
import { HeroDashboard, RegistrationToast, ShareCardMock } from "./visuals";
import { DesignCarousel, DocumentStack3D, HeroIdCard, HeroTicket } from "./lazyShowcase";
import { ModuleCube, ModuleList } from "./moduleCube";
import { BookkeepingPoints, BookkeepingScene, PaymentsPoints, PaymentsScene } from "./paymentsShowcase";
import { WishJourney, WishlistPoints, WishlistScene } from "./wishlistShowcase";
import { usePageMeta } from "@/lib/seo";
import { TAGLINE } from "@/lib/contact";

/** Soft blurred color fields drifting behind a section. */
function Orbs({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="float absolute -left-24 top-10 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
      <div
        className="float absolute right-[-6rem] top-40 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl"
        style={{ "--float-delay": "-3s" } as React.CSSProperties}
      />
      <div
        className="float absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl"
        style={{ "--float-delay": "-5s" } as React.CSSProperties}
      />
    </div>
  );
}

/** A floating layer in the hero scene: raised to `depth` and bobbing on its own rhythm. */
function Layer({
  depth,
  delay,
  className,
  children,
}: {
  depth: number;
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("depth absolute", className)} style={{ "--depth": `${depth}px` } as React.CSSProperties}>
      <div className="float" style={{ "--float-delay": `${-delay}s` } as React.CSSProperties}>
        {children}
      </div>
    </div>
  );
}

function Hero() {
  const { user } = useAuth();

  return (
    <section id="top" className="relative overflow-hidden">
      <Orbs />
      <div className="site-container relative grid items-center gap-14 pb-24 pt-12 lg:grid-cols-[1fr_1.05fr] lg:pt-20">
        <div className="flex flex-col items-start gap-6">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-gradient-brand-soft px-3 py-1 text-xs font-semibold text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              {TAGLINE}
            </span>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              From sign-up form to <span className="gradient-text">approved participant</span>, in one place.
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="max-w-xl text-lg text-muted-foreground">
              Build registration forms, run voting polls (free or paid), take orders, get paid with mobile money, keep your books, plan what you want to buy with wish lists, and send invoices and receipts. Share
              everything with a link or QR code, review every response, and issue ID cards and tickets from a single, secure workspace.
            </p>
          </Reveal>
          <Reveal delay={360} className="flex flex-wrap gap-3">
            {user ? (
              <LinkButton to="/admin" variant="default" size="lg" className="h-12 rounded-full px-7">
                <LayoutDashboard className="h-4 w-4" />
                Go to dashboard
              </LinkButton>
            ) : (
              <>
                <LinkButton to="/register" variant="default" size="lg" className="group h-12 rounded-full px-7">
                  Create your account
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </LinkButton>
                <LinkButton to="/login" variant="outline" size="lg" className="h-12 rounded-full px-7">
                  Sign in
                </LinkButton>
              </>
            )}
          </Reveal>
          <Reveal delay={480} className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {EXPERIENCE.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <item.icon className="h-4 w-4 text-primary" />
                {item.label}
              </span>
            ))}
          </Reveal>
        </div>

        <Reveal variant="zoom" delay={200}>
          <Stage className="relative">
            <div className="depth" style={{ "--depth": "0px" } as React.CSSProperties}>
              <HeroDashboard />
            </div>
            <Layer depth={90} delay={0} className="-right-3 -top-7 hidden sm:block lg:-right-8">
              <RegistrationToast />
            </Layer>
            <Layer depth={70} delay={2} className="-bottom-10 -left-6 hidden md:block xl:hidden">
              <ShareCardMock />
            </Layer>
            <Layer depth={140} delay={4} className="-right-10 bottom-[-4.5rem] hidden w-72 xl:block">
              <HeroTicket />
            </Layer>
            <Layer depth={120} delay={1} className="-bottom-16 -left-10 hidden w-28 xl:block">
              <HeroIdCard />
            </Layer>
          </Stage>
        </Reveal>
      </div>
    </section>
  );
}

function CapabilityStrip() {
  return (
    <section className="border-y border-border/70 bg-card/40">
      <div className="site-container grid grid-cols-2 gap-6 py-10 md:grid-cols-4">
        {CAPABILITIES.map((item, i) => (
          <Reveal key={item.label} delay={i * 120} variant="zoom" className="flex flex-col gap-1 text-center">
            <CountUp value={item.value} className="gradient-text text-3xl font-extrabold sm:text-4xl" />
            <span className="text-sm text-muted-foreground">{item.label}</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("offscreen-lazy relative scroll-mt-20 py-20 sm:py-24", className)}>
      <div className="site-container relative flex flex-col gap-12">{children}</div>
    </section>
  );
}

function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="site-container pb-20">
      <Reveal variant="tilt">
        <div className="relative w-full overflow-hidden rounded-[2rem] bg-gradient-brand px-6 py-14 text-center text-white shadow-glow-lg sm:px-12">
          <div className="float pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10" />
          <div
            className="float pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10"
            style={{ "--float-delay": "-3s" } as React.CSSProperties}
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to run it all from one place?</h2>
            <p className="text-lg text-white/85">
              Create your free NTSOne account and manage registrations, voting, orders, payments, bookkeeping and wish lists from one secure workspace, on any phone or computer.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {user ? (
                <Link
                  to="/admin"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-blue-700 shadow-lg transition hover:bg-white/90"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-blue-700 shadow-lg transition hover:bg-white/90"
                  >
                    Create your account
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex h-12 items-center rounded-full border border-white/40 px-7 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function LandingPage() {
  const { hash } = useLocation();

  // Links such as /#features from other pages land here; scroll once the section exists.
  React.useEffect(() => {
    if (!hash) return;
    const timer = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 60);
    return () => window.clearTimeout(timer);
  }, [hash]);

  usePageMeta({ index: true });

  return (
    <div className="min-h-screen scroll-smooth overflow-x-clip bg-transparent">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <Hero />
        <CapabilityStrip />

        <Section id="modules" className="overflow-hidden">
          <SectionHeading
            eyebrow="One workspace"
            title={
              <>
                Nine modules, <span className="gradient-text">one login</span>
              </>
            }
            description="Registrations, voting polls, orders, invoices, receipts and quotations, business cards, mobile money payments, bookkeeping and wish lists share one account, one team and one set of exports."
          />
          <div className="grid items-center gap-12 lg:grid-cols-[auto_1fr] lg:gap-20">
            <Reveal variant="zoom" className="flex justify-center py-10 lg:px-10">
              <ModuleCube />
            </Reveal>
            <Reveal delay={120}>
              <ModuleList />
            </Reveal>
          </div>
        </Section>

        <Section id="features">
          <SectionHeading
            eyebrow="Features"
            title={
              <>
                Everything you need to <span className="gradient-text">run your programs</span>
              </>
            }
            description="One platform for the whole journey: registrations, voting polls, orders, invoices, and receipts, from building the form to exporting the final list."
          />
          <FeaturesGrid />
        </Section>

        <Section id="payments" className="overflow-hidden bg-card/40">
          <SectionHeading
            eyebrow="Payments"
            title={
              <>
                Get paid with <span className="gradient-text">Orange, Africell and QMoney</span>
              </>
            }
            description="Charge for registration, ID cards, tickets and orders. Customers pick items, watch the total add up, and pay on a secure Monime page. The money lands in your own payment fund."
          />
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal variant="zoom" className="flex justify-center">
              <PaymentsScene />
            </Reveal>
            <Reveal delay={120}>
              <PaymentsPoints />
            </Reveal>
          </div>
        </Section>

        <Section id="bookkeeping" className="overflow-hidden">
          <SectionHeading
            eyebrow="Bookkeeping"
            title={
              <>
                Know your <span className="gradient-text">profit</span>, not just your sales
              </>
            }
            description="A simple book for shops and small businesses: write down sales, expenses, stock, loans and credit, speak a voice note when writing is hard, and see profit, loss and cash flow at any time."
          />
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal delay={120} className="order-2 lg:order-1">
              <BookkeepingPoints />
            </Reveal>
            <Reveal variant="zoom" className="order-1 flex justify-center lg:order-2">
              <BookkeepingScene />
            </Reveal>
          </div>
        </Section>

        <Section id="wishlist" className="overflow-hidden bg-card/40">
          <SectionHeading
            eyebrow="Wish List"
            title={
              <>
                Plan it, get it, and see <span className="gradient-text">what it really cost</span>
              </>
            }
            description="Keep a private list of everything you want to buy or have. When you get something, mark it gotten with the price you paid and the date, and watch your budget and savings add up."
          />
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal variant="zoom" className="flex justify-center">
              <WishlistScene />
            </Reveal>
            <Reveal delay={120}>
              <WishlistPoints />
            </Reveal>
          </div>
          <WishJourney />
        </Section>

        <Section id="paperwork" className="overflow-hidden">
          <SectionHeading
            eyebrow="Invoices, quotations and receipts"
            title={
              <>
                Paperwork that looks <span className="gradient-text">professionally designed</span>
              </>
            }
            description="Fourteen layouts in your colours: flowing waves, bold headers, landscape cash-book receipts and till slips with barcodes. Every one prints, downloads and emails as a PDF."
          />
          <Reveal variant="zoom">
            <DocumentStack3D />
          </Reveal>
        </Section>

        <Section id="how-it-works" className="bg-card/40">
          <SectionHeading
            eyebrow="How it works"
            title="Up and running in four steps"
            description="No installation and no technical setup. If you can fill in a form, you can build one."
          />
          <Steps />
        </Section>

        <Section id="designs" className="overflow-hidden">
          <SectionHeading
            eyebrow="Designs"
            title={
              <>
                ID cards and tickets that look <span className="gradient-text">professionally made</span>
              </>
            }
            description="Choose from more than 50 ID card and ticket designs, many of them two-sided, switch the colors to your brand, and add your logo or event flyer. Every registrant's document is filled in automatically."
          />
          <Reveal variant="zoom">
            <DesignCarousel />
          </Reveal>
        </Section>

        <Section className="bg-card/40">
          <Spotlights />
        </Section>

        <Section id="teams">
          <SectionHeading
            eyebrow="Teams & roles"
            title="Bring your whole team, with the right access"
            description="Invite colleagues and control, program by program, who can manage and who can only view."
          />
          <Roles />
        </Section>

        <Section id="security" className="bg-card/40">
          <SectionHeading
            eyebrow="Security & privacy"
            title="Built to protect applicant data"
            description="Registrations often include personal details and documents. The platform is designed to keep them private."
          />
          <Security />
        </Section>

        <Section>
          <SectionHeading eyebrow="Who it's for" title="Made for programs of every kind" />
          <div className="flex flex-wrap justify-center gap-3">
            {USE_CASES.map((useCase, i) => (
              <Reveal key={useCase} delay={i * 90} variant="zoom">
                <span className="inline-block rounded-full border border-border/70 bg-card px-5 py-2.5 text-sm font-medium shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-glow">
                  {useCase}
                </span>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section id="faq" className="bg-card/40">
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
          <Faq />
        </Section>

        <div className="pt-20">
          <FinalCta />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
