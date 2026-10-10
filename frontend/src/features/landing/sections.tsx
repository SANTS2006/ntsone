import {
  Gift,
  PiggyBank,
  BarChart3,
  BellRing,
  ScanLine,
  ListChecks,
  Gauge,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileSpreadsheet,
  FileUp,
  Fingerprint,
  GitBranch,
  Hash,
  IdCard,
  KeyRound,
  LayoutTemplate,
  Link2,
  Lock,
  MailCheck,
  Moon,
  QrCode,
  Rocket,
  Share2,
  ShieldCheck,
  Smartphone,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  Printer,
  ShoppingBag,
  Receipt,
  Vote,
  Store,
  FileText,
  Palette,
  Sparkles,
  Ticket,
  UserCog,
  Users,
  Wand2,
  Upload,
  RefreshCw,
  PieChart,
  PencilLine,
  SlidersHorizontal,
  Zap,
  Wallet,
  ScrollText,
  BookOpen,
  Mic,
  TrendingUp,
  Coins,
  Smartphone as PhoneIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal, Tilt } from "./motion";
import { AnalyticsMock, FormBuilderMock, VerificationsMock } from "./visuals";
import { BusinessMock, ImportMock, PollsMock, RulesMock, SmartFormMock, SuccessCopyMock, VerifiedVotersMock } from "./moduleVisuals";
import { DocumentsShowcase, FlipCard3D } from "./lazyShowcase";

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex max-w-2xl flex-col items-center gap-3 text-center", className)}>
      <Reveal>
        <span className="rounded-full bg-gradient-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          {eyebrow}
        </span>
      </Reveal>
      <Reveal delay={100}>
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      </Reveal>
      {description && (
        <Reveal delay={200}>
          <p className="text-base text-muted-foreground sm:text-lg">{description}</p>
        </Reveal>
      )}
    </div>
  );
}

export const CAPABILITIES = [
  { value: "23", label: "question types, from text to file uploads" },
  { value: "50+", label: "ready-made ID card and ticket designs" },
  { value: "14", label: "invoice, quotation and receipt layouts" },
  { value: "8", label: "two-sided business card designs" },
];

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Wand2,
    title: "Drag-and-drop form builder",
    description: "Build a registration form for every program with 23 question types, sections, and step-by-step or single-page layouts.",
  },
  {
    icon: GitBranch,
    title: "Smart form logic",
    description: "Show questions only when they apply, narrow choices by earlier answers (like district, then chiefdom), and pre-fill defaults.",
  },
  {
    icon: Link2,
    title: "Shareable links & QR codes",
    description: "Every published program gets its own link and QR code. Share it to WhatsApp, Facebook, X, LinkedIn, or email in one click.",
  },
  {
    icon: FileUp,
    title: "Document uploads",
    description: "Collect photos, certificates, IDs, and CVs with the form, then open or download any file straight from the registration.",
  },
  {
    icon: ClipboardCheck,
    title: "Registration management",
    description: "Search, filter, and move applicants through statuses (submitted, under review, approved, waitlisted) with a full history.",
  },
  {
    icon: IdCard,
    title: "Participant ID cards",
    description: "Choose from eight two-sided card designs in your colors, with each participant's photo, details, and a QR code anyone can scan to verify.",
  },
  {
    icon: Ticket,
    title: "Event tickets",
    description: "Pick a ticket design or upload your own artwork. Each ticket carries the registrant's name, number, barcode, and QR code.",
  },
  {
    icon: Hash,
    title: "Custom registration numbers",
    description: "Choose your own format: a prefix such as NYS, the year, the number length, and where numbering starts.",
  },
  {
    icon: BarChart3,
    title: "Analytics for every question",
    description: "Track daily registrations and statuses, and see how applicants answered each question: choices, ages, numbers, and text.",
  },
  {
    icon: FileSpreadsheet,
    title: "Excel & CSV exports",
    description: "Download every registration, filtered or complete, as a spreadsheet named after the program and date.",
  },
  {
    icon: Users,
    title: "Teams & roles",
    description: "Invite teammates as program admins or viewers and decide exactly which programs each person can see or manage.",
  },
  {
    icon: BellRing,
    title: "Branded email",
    description: "Registrants get a confirmation with their number; your team gets polished invitation, verification, and security emails.",
  },
  {
    icon: ScanLine,
    title: "ID card & ticket verification",
    description: "Scan the QR code on any ID card or ticket with a phone camera. No app needed: you instantly see who it belongs to and whether it's valid.",
  },
  {
    icon: ListChecks,
    title: "Verification log",
    description: "Every scan is recorded in a table: the person, the document, the result, who scanned it, and when. Search and filter it anytime.",
  },
  {
    icon: Gauge,
    title: "Live check-in numbers",
    description: "See total scans, people verified, scans today, and invalid attempts at a glance while your event is running.",
  },
  {
    icon: Vote,
    title: "Voting polls",
    description: "Run elections with positions and candidates (with photos). Share one link for the whole poll or a link for each position, with QR codes.",
  },
  {
    icon: ShieldCheck,
    title: "One vote per person",
    description: "Voters confirm their email, each email can vote once, and you can limit voting to your own email domain. Ballots stay secret.",
  },
  {
    icon: BarChart3,
    title: "Live results",
    description: "Watch percentages and places update as votes arrive, then export the results and the list of who voted.",
  },
  {
    icon: Store,
    title: "Businesses & order forms",
    description: "Give every business its own branded order page. Customers fill in the form, review their answers, and get a confirmation with their order number.",
  },
  {
    icon: ShoppingBag,
    title: "Order tracking",
    description: "Move orders through your own statuses, like New, Preparing, and Ready, and each customer is emailed at every step.",
  },
  {
    icon: FileText,
    title: "Invoices",
    description: "Create invoices in seconds with three layouts, your colors, tax, and extra fields. Download them or email a PDF to the client.",
  },
  {
    icon: Receipt,
    title: "Receipts",
    description: "Issue receipts for payments received, edit them any time (they show as Updated), and save them as a PDF or a picture.",
  },
  {
    icon: ClipboardList,
    title: "Quotations",
    description: "Send a quotation, then mark it accepted, declined or expired. Same layouts, tax and email-to-client as invoices.",
  },
  {
    icon: LayoutTemplate,
    title: "14 document layouts",
    description: "Nine A4 styles, landscape cash-book receipts and narrow till slips with barcodes, all in your own colours.",
  },
  {
    icon: IdCard,
    title: "Business cards",
    description: "Eight two-sided designs with your logo, a photo and a QR code. Print them, save a PDF or email one to a client.",
  },
  {
    icon: BadgeCheck,
    title: "Verified voters",
    description: "Paste the emails of eligible voters. Everyone else is refused at sign-up, sign-in and voting, with no way round it.",
  },
  {
    icon: CalendarClock,
    title: "Smarter form rules",
    description: "Earliest and latest dates, minimum ages, fields that fill themselves in, and extra boxes that appear only when needed.",
  },
  {
    icon: PhoneIcon,
    title: "Get paid with mobile money",
    description: "Charge for registration, ID cards, tickets and orders. People pay with Orange Money, Africell Money or QMoney through Monime, and documents unlock once the payment is confirmed.",
  },
  {
    icon: ShoppingBag,
    title: "Items, prices and live totals",
    description: "List what you sell on the order form. Customers pick quantities, see the total as they go, and pay before the order goes through.",
  },
  {
    icon: Wallet,
    title: "Payment fund and withdrawals",
    description: "Every payment lands in your fund. Withdraw to your own mobile money or bank account, protected by your password, a waiting period for new accounts, and limits.",
  },
  {
    icon: BarChart3,
    title: "Money on your dashboard",
    description: "See what you collected today and this week, what is waiting to be paid, your top earners and the latest payments, beside your registrations and orders.",
  },
  {
    icon: PieChart,
    title: "Payment analytics",
    description: "For every program and order form: money collected each day, how people paid, best-selling items, and how many who registered went on to pay.",
  },
  {
    icon: ScrollText,
    title: "Audit log for the platform",
    description: "Every action across every account is recorded and grouped by account, including visitors on live pages, with failed and refused attempts highlighted.",
  },
  {
    icon: BookOpen,
    title: "Bookkeeping for your business",
    description: "A cash book with big buttons for sales, expenses, stock, loans and credit. Nothing is ever deleted: a mistake is voided with a reason.",
  },
  {
    icon: Mic,
    title: "Voice notes and read-aloud",
    description: "Record what happened instead of writing it. Every voice note is kept as a record, and the app can read your profit and totals out loud.",
  },
  {
    icon: TrendingUp,
    title: "Profit, loss and cash flow",
    description: "See what you earned, what stock and expenses cost, who owes you and what is overdue, for any month, with a download for your accountant.",
  },
  {
    icon: Gift,
    title: "Wish lists",
    description: "Lists of things to buy or have. Add many items at once with optional quantities and prices, set a budget, and mark each one gotten with the price you paid and the date.",
  },
  {
    icon: Share2,
    title: "Share a wish list",
    description: "Send a private link or QR code to family and friends, on WhatsApp, Facebook, X or email. Choose view-only or edit access. They need no account and see only that list.",
  },
  {
    icon: Smartphone,
    title: "Install it like an app",
    description: "Add NTSOne to the home screen of an iPhone, iPad or Android phone, or install it on a computer. It opens full screen, loads fast, and shows a friendly page when the connection drops.",
  },
  {
    icon: PiggyBank,
    title: "See what you saved",
    description: "The gotten list compares what you paid with what you expected, shows spending by category and month, and keeps a record of every change that cannot be edited.",
  },
  {
    icon: Coins,
    title: "Paid voting",
    description: "Charge for votes: one fixed price per vote, or let voters pay any amount and the votes follow. Each payment is used once, to vote again they pay again.",
  },
  {
    icon: RefreshCw,
    title: "Refunds",
    description: "Send a payment back to the person's mobile money from the payments page, with your password, a reason and a limit, and every step recorded.",
  },
  {
    icon: CalendarClock,
    title: "Filter every table by date",
    description: "Registrations, orders, payments, invoices, voters, team, inbox and more can all be narrowed to a date range, and the download follows the filter.",
  },
  {
    icon: ShoppingBag,
    title: "Orders show what was bought",
    description: "The orders list, the order details, the customer's confirmation page and their PDF or picture all show the items ordered with prices and the total.",
  },
  {
    icon: Wallet,
    title: "A clear fee, a fund for everyone",
    description: "The platform keeps 5% of each payment, and an admin has to agree to it before payments can be turned on. The organization withdraws the rest from its fund; the platform has its own fund too.",
  },
  {
    icon: RefreshCw,
    title: "Refunds with safeguards",
    description: "Refunds open a few minutes after a payment, need the admin's password and a reason, go to the payer's mobile money, return the fee in proportion, and are approved by our team when large.",
  },
  {
    icon: PhoneIcon,
    title: "Made for small screens",
    description: "Every page fits a phone without sideways scrolling, fields don't make the screen zoom, and a spinner with the logo shows whenever something is loading.",
  },
  {
    icon: SlidersHorizontal,
    title: "Rules on everything",
    description: "Show, require, limit or pre-fill almost anything only when another answer matches, or when another question is filled in or left empty.",
  },
  {
    icon: Upload,
    title: "Import from Excel or Word",
    description: "Bring registrations or orders in from an .xlsx, .csv or Word table. Match the columns, preview every row, and import the good ones.",
  },
  {
    icon: FileSpreadsheet,
    title: "Blank import template",
    description: "Download a ready sheet for your form, with a column per question, dropdowns for fixed answers, and a guide for each column.",
  },
  {
    icon: PencilLine,
    title: "Edit and update registrations",
    description: "Update existing registrations from a file, or edit a registration's answers by hand to match your current questions.",
  },
  {
    icon: RefreshCw,
    title: "Tables that refresh themselves",
    description: "New registrations, votes, orders and messages appear on their own, and a Refresh button loads the latest data on demand.",
  },
  {
    icon: PieChart,
    title: "Pie charts and histograms",
    description: "Switch any question between bars, a pie and a histogram to see how applicants answered.",
  },
  {
    icon: Zap,
    title: "Built for busy days",
    description: "Double submissions are blocked, notification emails are queued and retried, and sign-in and uploads are protected against abuse.",
  },
  {
    icon: Printer,
    title: "Print, preview and download",
    description: "Customers keep a copy of their order or registration as a PDF or a picture, and can print or preview it first.",
  },
  {
    icon: Palette,
    title: "Your words and colors",
    description: "Name your own order, invoice, and receipt statuses, set your own order numbers, and keep your logo on everything customers see.",
  },
];

export function FeaturesGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((feature, i) => (
        <Reveal key={feature.title} delay={(i % 3) * 110} variant="tilt" className="h-full">
          <Tilt className="h-full" innerClassName="h-full rounded-2xl" max={8}>
            <div className="group h-full rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm backdrop-blur-sm transition-colors duration-300 hover:border-primary/40 hover:shadow-glow">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow transition-transform duration-300 group-hover:scale-110">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          </Tilt>
        </Reveal>
      ))}
    </div>
  );
}

const STEPS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Sparkles,
    title: "Create your account",
    description: "Sign up and verify your email. You become the admin of your own private workspace.",
  },
  {
    icon: LayoutTemplate,
    title: "Build your program",
    description: "Add program details, design the registration form, and set up ID cards or tickets if you need them.",
  },
  {
    icon: Share2,
    title: "Publish & share",
    description: "Publish the form and share its link or QR code wherever your applicants are.",
  },
  {
    icon: Rocket,
    title: "Review & report",
    description: "Review applications as they arrive, update statuses, issue documents, and export your data.",
  },
];

export function Steps() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-gradient-to-r from-primary/10 via-primary/50 to-primary/10 md:block"
      />
      <ol className="relative grid grid-cols-1 gap-6 md:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative">
            <Reveal delay={i * 150} variant="zoom" className="flex flex-col items-center gap-3 text-center">
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-glow">
                <step.icon className="h-6 w-6" aria-hidden="true" />
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-card text-xs font-bold text-primary">
                  {i + 1}
                </span>
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="max-w-xs text-sm text-muted-foreground">{step.description}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={item}>
          <Reveal delay={i * 80} variant="left" className="flex items-start gap-3 text-sm sm:text-base">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="text-muted-foreground">{item}</span>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

function Spotlight({
  id,
  eyebrow,
  title,
  description,
  points,
  visual,
  reverse,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn("flex flex-col gap-5", reverse && "lg:order-2")}>
        <Reveal variant={reverse ? "right" : "left"}>
          <span className="w-fit rounded-full bg-gradient-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            {eyebrow}
          </span>
        </Reveal>
        <Reveal variant={reverse ? "right" : "left"} delay={100}>
          <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h3>
        </Reveal>
        <Reveal variant={reverse ? "right" : "left"} delay={200}>
          <p className="text-base text-muted-foreground sm:text-lg">{description}</p>
        </Reveal>
        <CheckList items={points} />
      </div>
      <Reveal variant="tilt" delay={150} className={cn(reverse && "lg:order-1")}>
        {visual}
      </Reveal>
    </div>
  );
}

export function Spotlights() {
  return (
    <div className="flex flex-col gap-24">
      <Spotlight
        id="form-builder"
        eyebrow="Form builder"
        title="Forms that fit every program, no code required"
        description="Start from a blank form and add exactly the questions you need. Reorder by dragging, group questions into sections, and preview on desktop, tablet, or phone before you publish."
        points={[
          "23 question types: text, email, phone, dates, choices, ratings, currency, file uploads, consent, and more",
          "Conditional questions, sections and choices, e.g. only the chiefdoms of the selected district",
          "Extra boxes for any option, even several at once on a multiple choice question",
          "Default answers, required fields, length and format rules",
          "“Other (please specify)” answers captured automatically",
          "Your own consent statement and “I have gone through the form” checkbox, shown or hidden as you decide",
          "Missing required answers are listed just above the submit button",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <FormBuilderMock />
          </Tilt>
        }
      />
      <Spotlight
        id="documents"
        eyebrow="ID cards & tickets"
        title="Professional documents, generated for every registrant"
        description="Turn on ID cards or tickets for a program and every registrant gets a ready-to-print PDF, named after them and carrying a QR code that proves it's genuine."
        points={[
          "Eight two-sided ID card designs and two ticket designs, recolored to your brand",
          "Upload your own logo, or your own card or ticket artwork",
          "Participant photos, chosen form answers, venue, dates, terms, and a barcode",
          "Scan any QR code to check a registration's status instantly, with every scan logged",
          "Choose whether registrants can download them right after registering",
        ]}
        visual={<DocumentsShowcase />}
        reverse
      />
      <Spotlight
        id="analytics"
        eyebrow="Analytics & exports"
        title="Understand your applicants at a glance"
        description="Every program has its own analytics. See how registrations are trending, where applicants stand, and how they answered each question, then export everything in one click."
        points={[
          "Daily registration trend and status breakdown",
          "Per-question analysis: choices, age groups, number ranges, and common answers",
          "Switch any question between bars, a pie chart and a histogram",
          "Tables that refresh on their own, with a Refresh button when you want it now",
          "Most common “Other” answers surfaced automatically",
          "Excel and CSV exports with filters by status, date range, and search",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <AnalyticsMock />
          </Tilt>
        }
      />
      <Spotlight
        id="verification"
        eyebrow="Verification & check-in"
        title="Know exactly who has been checked in"
        description="When a QR code on an ID card or ticket is scanned, the platform checks the registration on the spot and records the check in the program's Verifications tab, just like your registrations table."
        points={[
          "Works with any phone camera: scan, and the verification page opens straight away",
          "Shows whether the document is valid, who it belongs to, and their registration status",
          "Every scan logged with the document type, result, time, and the team member who scanned it",
          "Search and filter by name, number, ID card or ticket, and valid or not valid",
          "Each registration shows its own scan history",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <VerificationsMock />
          </Tilt>
        }
        reverse
      />
      <Spotlight
        id="voting"
        eyebrow="Voting polls"
        title="Elections people can trust, with results in real time"
        description="Build a ballot of positions and candidates, open voting, and share a link or QR code. Voters sign in with a confirmed email, vote once, and everyone can follow the standings live."
        points={[
          "Positions and candidates with photos, and a link for the whole poll or for one position",
          "One vote per email, enforced by the system, with optional email-domain limits",
          "Sign up or sign in with email and password or Google, with a forgot-password flow",
          "Automatic closing time, live percentages and places, and a clear “You've already voted” message",
          "Secret ballots: admins see who voted, never who they voted for",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <PollsMock />
          </Tilt>
        }
      />
      <Spotlight
        id="businesses"
        eyebrow="Businesses"
        title="Orders, invoices, and receipts for every business"
        description="Add a business and it gets its own order page built with the same form builder, plus invoices and receipts that carry its name, logo, and colors."
        points={[
          "A live order page with your form, an answers review, and a printable order with its number and status",
          "Your own statuses and order numbers, with a branded email to the customer at each step",
          "Invoices and receipts with three layouts, tax, extra fields, PDF and image downloads",
          "Email an invoice or receipt to the client with the PDF attached",
          "Analytics for orders, amounts invoiced, and top clients, all exportable to Excel or CSV",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <BusinessMock />
          </Tilt>
        }
        reverse
      />
      <Spotlight
        id="cards"
        eyebrow="Business cards"
        title="Cards that make a first impression, front and back"
        description="Pick one of eight designs, add the person, their photo and a QR code of your website, and the card is ready to print or to email to a client."
        points={[
          "Eight two-sided designs: Executive gold, Ring, Diagonal, Portrait and more",
          "Change both colours and see the front and back live",
          "Print it, save a PDF or pictures, or email the PDF to any address you type in",
          "A card for every team member, searchable and exportable",
        ]}
        visual={<FlipCard3D />}
      />
      <Spotlight
        id="verified-voters"
        eyebrow="Verified voting"
        title="Only the people you list can vote"
        description="Switch on verified voters and paste the eligible emails. The system checks the list before it creates an account, signs anyone in or records a vote."
        points={[
          "Unlisted emails are told they are not verified as eligible voters, and no account is created",
          "Works for password sign-up, Google sign-in and the forgot-password code",
          "Shows how many listed voters have signed up and voted",
          "Aliases such as name+1@gmail.com can't slip past the list",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <VerifiedVotersMock />
          </Tilt>
        }
        reverse
      />
      <Spotlight
        id="smart-forms"
        eyebrow="Smarter forms"
        title="Forms that check, fill and ask for more by themselves"
        description="Set date limits and age ranges, copy an answer into another question, cap how many options can be ticked, and show an extra box only when an answer needs one."
        points={[
          "Earliest and latest dates, or a minimum and maximum age for dates of birth",
          "A field that fills itself from an earlier answer until the person edits it",
          "“Choose up to 2” limits and follow-up boxes for text or files",
          "Answers are saved in the browser, so a refresh never loses them",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <SmartFormMock />
          </Tilt>
        }
      />
      <Spotlight
        id="form-rules"
        eyebrow="Form rules"
        title="Every question can react to the answers before it"
        description="Hide a question until it matters, make it required only sometimes, or change what it offers. Each rule checks either the answer someone gave or simply whether another question is filled in."
        points={[
          "Show or hide questions and whole sections, and skip empty steps automatically",
          "Require a question, apply its limits, or pre-fill it only when your rules match",
          "Offer a single choice, a description, the “Other” box or a consent only under conditions",
          "Add several rules to one question: all of them must match",
          "The same rules are checked again on the server, so nothing slips through",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <RulesMock />
          </Tilt>
        }
        reverse
      />
      <Spotlight
        id="import"
        eyebrow="Import"
        title="Bring registrations in from a spreadsheet or a Word table"
        description="Already have a list? Upload it, match each column to a question, and look at every row before anything is saved. Fix what needs fixing and import the rest."
        points={[
          "Excel (.xlsx), CSV and Word (.docx) tables, with a blank template made from your form",
          "Columns are matched for you, and a row-by-row preview shows what will be added, updated or left out",
          "Update existing registrations by registration number or email, changing only what the file contains",
          "Rows with missing required answers still come in, and can be completed by editing them",
          "Download the rows that need attention, fix them, and import again. The same works for orders",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <ImportMock />
          </Tilt>
        }
      />
      <Spotlight
        id="success-page"
        eyebrow="After they submit"
        title="A success page people can keep, print and trust"
        description="Customers and registrants see their number and status, review their answers and keep a copy. You choose whether ID cards, tickets and copies are shown."
        points={[
          "Preview, print, download as PDF or save as a picture",
          "A review step before an order is placed",
          "Switches for the ID card, the ticket and the copy, right on the program overview",
          "Order status in your own words, updated by email",
        ]}
        visual={
          <Tilt max={6} innerClassName="rounded-2xl">
            <SuccessCopyMock />
          </Tilt>
        }
        reverse
      />
    </div>
  );
}

const ROLES: { icon: LucideIcon; name: string; summary: string; can: string[] }[] = [
  {
    icon: UserCog,
    name: "Admin",
    summary: "The account owner, with full control of the workspace.",
    can: ["Create and publish programs", "Build forms, ID cards, and tickets", "Manage every registration", "Invite and manage the team"],
  },
  {
    icon: ClipboardCheck,
    name: "Program admin",
    summary: "Runs the programs they're given access to.",
    can: ["Edit assigned programs and forms", "Review and update registrations", "Download documents and exports", "Create new programs"],
  },
  {
    icon: Eye,
    name: "Viewer",
    summary: "Read-only access for stakeholders.",
    can: ["View assigned programs", "Browse registrations and files", "See analytics", "Export registrations"],
  },
];

export function Roles() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {ROLES.map((role, i) => (
        <Reveal key={role.name} delay={i * 130} className="h-full">
        <div className="flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm transition-shadow duration-300 hover:shadow-glow">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand-soft text-primary">
              <role.icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold">{role.name}</h3>
              <p className="text-xs text-muted-foreground">{role.summary}</p>
            </div>
          </div>
          <CheckList items={role.can} />
        </div>
        </Reveal>
      ))}
    </div>
  );
}

const SECURITY: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Lock,
    title: "Private workspaces",
    description: "Each account's programs, registrations, and team are completely separate from every other account.",
  },
  {
    icon: MailCheck,
    title: "Verified email addresses",
    description: "New accounts and email changes are confirmed with a one-time code sent to the inbox.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    description: "People only see, and can only change, what their role and program access allow.",
  },
  {
    icon: KeyRound,
    title: "Secure sign-in",
    description: "Strong password hashing, short-lived sessions, and self-service password reset by email.",
  },
  {
    icon: Fingerprint,
    title: "Verifiable documents",
    description: "QR codes on ID cards and tickets link to a live verification page for each registration.",
  },
  {
    icon: Zap,
    title: "Safe under load",
    description: "Duplicate submissions are blocked at the database, emails are queued and retried, and sign-in attempts and uploads are limited.",
  },
  {
    icon: ScrollText,
    title: "Tamper-proof audit trail",
    description: "Every change, sign-in, payment and withdrawal is recorded with who, when and from where. Passwords and answers are never stored in it, and entries can't be edited.",
  },
  {
    icon: Wallet,
    title: "Safe payments",
    description: "Payments are confirmed directly with Monime before they count. Withdrawals need your password, new accounts wait before first use, and large amounts need approval.",
  },
  {
    icon: Download,
    title: "Your data, exportable",
    description: "Export registrations at any time and download every uploaded file from its registration.",
  },
];

export function Security() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {SECURITY.map((item, i) => (
        <Reveal key={item.title} delay={(i % 3) * 110} variant="zoom" className="h-full">
        <div className="flex h-full gap-4 rounded-2xl border border-border/70 bg-card/60 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-soft text-primary">
            <item.icon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </div>
        </div>
        </Reveal>
      ))}
    </div>
  );
}

export const USE_CASES = [
  "National & youth service programs",
  "Scholarships & grants",
  "Training & bootcamps",
  "Conferences & events",
  "Recruitment drives",
  "Community & NGO programs",
  "Student and club elections",
  "Shops and small businesses",
  "Order taking and invoicing",
  "Saving for a home, a wedding or a shop",
];

export const EXPERIENCE: { icon: LucideIcon; label: string }[] = [
  { icon: Smartphone, label: "Works on any phone" },
  { icon: Moon, label: "Light & dark mode" },
  { icon: QrCode, label: "Scan-to-register" },
];

const FAQS = [
  {
    q: "Who can see the registrations we collect?",
    a: "Only the people in your account you've given access to, plus the platform administrators who run the service. Every account is a private workspace, and other organizations on the platform can't see your programs, registrations, or team.",
  },
  {
    q: "Can applicants register from their phones?",
    a: "Yes. Registration forms are fully mobile-friendly, support file and photo uploads from the phone, and follow the device's light or dark mode.",
  },
  {
    q: "Can we run several programs at the same time?",
    a: "Yes. Each program has its own form, link, QR code, registration numbers, ID cards, tickets, analytics, and exports.",
  },
  {
    q: "What kinds of questions can a form include?",
    a: "23 types: short and long text, email, phone, numbers, currency, ratings, dates and times, date of birth, single and multiple choice, dropdowns, yes/no, country, gender, address, website links, consent, and image, PDF, or document uploads.",
  },
  {
    q: "How do ID card and ticket QR codes work?",
    a: "Each code links to a verification page for that registration. Scanning it with any phone camera shows who it belongs to and whether the registration is still valid, and the scan is added to the program's Verifications log with the time and, for signed-in team members, who scanned it.",
  },
  {
    q: "How do I give my team access?",
    a: "Invite teammates from the Team page as a program admin or viewer. They receive an email with their sign-in details, and you choose which programs each person can access.",
  },
  {
    q: "How do voting polls keep votes fair and private?",
    a: "Voters create a voter account and confirm their email with a code. When one vote per email is on, the system refuses a second vote for the same position, even from an address written a different way. Admins can see who voted, but never which candidate they chose.",
  },
  {
    q: "What can a business do on the platform?",
    a: "Each business gets an order page, order tracking with your own statuses, and branded invoices and receipts. Customers are emailed a confirmation and updates, and invoices and receipts can be emailed as PDFs or downloaded as pictures.",
  },
  {
    q: "Which invoice, quotation and receipt layouts are there?",
    a: "Fourteen: nine A4 styles (Classic, Modern, Minimal, Wave, Corner, Bold, Soft, Stripe and Diagonal), three landscape cash-book receipts and two narrow till slips with a barcode. Pick one, choose your colours, and every document prints, downloads and emails as a PDF.",
  },
  {
    q: "Can I make business cards?",
    a: "Yes. Choose from eight two-sided designs, add the person, a photo and a QR code of your website, then print the card, save it as a PDF or pictures, or email the PDF to any address.",
  },
  {
    q: "Can I limit a poll to people I have approved?",
    a: "Yes. Turn on verified voters and paste their emails. Anyone who is not on the list cannot create an account, sign in or vote.",
  },
  {
    q: "Can people pay when they register or order?",
    a: "Yes. Turn on payments for a program or an order form and set the prices. People pay with Orange Money, Africell Money or QMoney through Monime, and the money goes to your payment fund. Every payment is confirmed with Monime before it counts, and ID cards and tickets are only released once it is paid.",
  },
  {
    q: "How do I get the money I collect?",
    a: "Open the Payment fund page, add a mobile money number or bank account, and withdraw. You confirm with your password, a new account waits a few minutes before first use, large amounts are approved by our team, and every move is recorded.",
  },
  {
    q: "How much does it cost?",
    a: "Building forms, taking registrations, running free polls and orders, invoices, receipts and bookkeeping are free. When you take payments through Monime, the platform keeps 5% of each payment, and you agree to that before payments can be turned on. Monime's own charges, if any, are separate.",
  },
  {
    q: "Can I filter my tables and download what I see?",
    a: "Yes. Registrations, orders, payments, invoices, receipts, quotations, voters, team members, messages and more can be filtered by date range, and the Excel or CSV download follows the filter.",
  },
  {
    q: "Can I install it as an app on my phone?",
    a: "Yes, on both iPhone and Android, with nothing to download from a store. On Android, tap Install when the page offers it (or use the browser menu). On an iPhone or iPad, open the site in Safari, tap Share, then Add to Home Screen. NTSOne then opens full screen from your home screen like any other app. You can install it on a computer too, using the install icon in Chrome or Edge.",
  },
  {
    q: "Can I use it on a phone?",
    a: "Yes. Every page is built to fit small screens, forms work with the phone's keyboard and camera, and shopkeepers can record voice notes in the bookkeeping section.",
  },
  {
    q: "Can I use it to keep the books of my shop?",
    a: "Yes. Open a business and choose Bookkeeping. Write down sales, expenses, stock you bought, money you lent or borrowed, and credit that is still unpaid. You get your profit or loss, cash flow, and who owes what. Entries are never deleted: a mistake is voided with a reason and stays in the book.",
  },
  {
    q: "What is the wish list for?",
    a: "It is a private list of things you want to buy or have, such as furniture for a new house or equipment for your shop. Add items one by one or many at once, with a quantity and an expected price if you know them. When you get something, press Got it and record the price you paid, the date and where it came from. It moves to your gotten list, and you can see what you saved, what is left of your budget and where the money went.",
  },
  {
    q: "Can other people see my wish list?",
    a: "Only the people you choose. Each wish list belongs to the person who made it. Your account administrator and the platform team cannot open it. You can invite someone with a private link or QR code and decide if they can only view it or also edit it. You can change their access, give them a new link, or remove them at any time. Items you remove are hidden but kept, and every change is written to a record on the list that cannot be edited.",
  },
  {
    q: "Do the people I share a wish list with need an account?",
    a: "No. They open the link or scan the QR code and see only that one wish list. They cannot reach anything else in the system. With edit access they can add items, change them and mark them as gotten, and what they do is recorded under the name you gave them.",
  },
  {
    q: "Can people who find writing hard use it?",
    a: "Yes. The book has big colourful buttons in plain words, and you can record a voice note instead of typing. Voice notes are saved in the book as records, and you or someone you trust can write them down later. The app can also read your totals out loud.",
  },
  {
    q: "How does paid voting work?",
    a: "The poll's admin sets the price of one vote and chooses whether people can pay any amount. A voter signs in, pays on Monime, comes straight back, and chooses a candidate. The votes they paid for are counted once. To vote again they pay again. Payments are confirmed with Monime first, and every payment and vote is recorded.",
  },
  {
    q: "Can a payment be refunded?",
    a: "Yes. An organization admin can refund a payment to the person's mobile money from the payments page. They confirm with their password and give a reason, big refunds are approved by our team, and the platform's fee goes back in proportion. Paid votes that were already used can't be refunded.",
  },
  {
    q: "Who can see what happens in the system?",
    a: "Platform administrators have an audit log that records every action, grouped by account: who did it, what, when, from where and whether it worked, including visitors on the live registration and order pages. Passwords, form answers and who someone voted for are never stored in it, and entries can't be changed or removed. Nobody else can open it.",
  },
  {
    q: "Can I import registrations I already have?",
    a: "Yes. Upload an Excel sheet, CSV file or Word table, match its columns to your form's questions, and preview every row. Valid rows are imported, rows with problems are listed so you can download, fix and import them again, and a blank template for your form is one click away. Orders can be imported the same way.",
  },
  {
    q: "Can questions appear only when they are needed?",
    a: "Yes. Show or hide a question or a whole section, require it, limit it, pre-fill it, or offer a single choice only when another answer matches or another question is filled in or left empty. Follow-up boxes, the “Other” box and consent can have rules too.",
  },
  {
    q: "Can I get my data out?",
    a: "Anytime. Every table, including registrations, orders, invoices, receipts, poll results, and voters, can be exported to Excel or CSV, and any uploaded file can be downloaded.",
  },
];

export function Faq() {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      {FAQS.map((item, i) => (
        <Reveal key={item.q} delay={i * 70}>
        <details
          className="group rounded-2xl border border-border/70 bg-card/80 px-5 py-4 shadow-sm open:border-primary/40 open:shadow-glow"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            {item.q}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-brand-soft text-primary transition-transform duration-200 group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
        </details>
        </Reveal>
      ))}
    </div>
  );
}
