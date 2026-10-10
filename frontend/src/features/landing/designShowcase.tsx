import * as React from "react";
import { DEFAULT_ID_CARD_TERMS, ID_CARD_DESIGNS, idCardDesign, ticketDesign, TICKET_DESIGNS } from "@designs";
import { IdCardPreview, type IdCardPreviewContext } from "../idcards/IdCardPreview";
import type { IdCardConfig } from "../idcards/api";
import { TicketPreview, type TicketPreviewContext } from "../tickets/TicketPreview";
import type { TicketConfig } from "../tickets/api";
import { Tilt, useScrollProgress } from "./motion";

// The landing page's ID card and ticket samples. They need the full design library, so this
// file loads after the page has appeared (see lazyShowcase.tsx).

export function sampleTicket(template: string): TicketConfig {
  const { defaults } = ticketDesign(template);
  return {
    template,
    primaryColor: defaults.primary,
    secondaryColor: defaults.secondary,
    tagline: "Ideas, people, and partnerships",
    eventDate: "14 Nov 2026",
    eventTime: "09:00 AM - 05:00 PM",
    venue: "City Conference Hall",
    contactPhone: "+232 76 000 000",
    website: "www.brightfutures.org",
    visibleFields: [],
    textColor: "light",
    overlayOpacity: 0.35,
    showQrCode: true,
    showOnConfirmation: true,
    isPaid: true,
    priceAmount: 150,
    showPrice: true,
    showParticipantName: true,
    showRegistrationNumber: true,
    showBarcode: true,
    showEventDetails: true,
    showContact: true,
  };
}

export function sampleIdCard(template: string): IdCardConfig {
  const { defaults } = idCardDesign(template);
  return {
    template,
    primaryColor: defaults.primary,
    secondaryColor: defaults.secondary,
    roleText: "Participant",
    visibleFields: [],
    showQrCode: true,
    terms: DEFAULT_ID_CARD_TERMS.join("\n"),
    contactPhone: "+232 76 000 000",
    contactEmail: "hello@brightfutures.org",
    contactWebsite: "www.brightfutures.org",
    signatureLabel: "Program Director",
    showOnConfirmation: true,
    photoSource: "field",
    showRegistrationNumber: true,
    showRole: true,
    showDates: true,
    showTerms: true,
    showContact: true,
    showSignature: true,
    showBarcode: true,
  };
}

export const SAMPLE_TICKET_CONTEXT: TicketPreviewContext = {
  organizationName: "Bright Futures",
  programName: "Leadership Summit 2026",
};

export const SAMPLE_ID_CONTEXT: IdCardPreviewContext = {
  organizationName: "Bright Futures",
  programName: "Youth Leadership Program",
  fieldLabels: ["District", "Phone"],
  validUntil: "30 Nov 2026",
};

/** The ticket and ID card floating beside the hero on wide screens. */
export function HeroTicket() {
  const ticket = React.useMemo(() => sampleTicket("orbit"), []);
  return <TicketPreview config={ticket} context={SAMPLE_TICKET_CONTEXT} className="shadow-2xl" />;
}

export function HeroIdCard() {
  const card = React.useMemo(() => sampleIdCard("aurora"), []);
  return <IdCardPreview config={card} context={SAMPLE_ID_CONTEXT} className="shadow-2xl" />;
}

/** An ID card that turns over in 3D as the page scrolls past it, front to back. */
function FlipCard({ template }: { template: string }) {
  const [ref, progress] = useScrollProgress<HTMLDivElement>();
  const config = React.useMemo(() => sampleIdCard(template), [template]);
  // Hold the front, turn through the middle of the scroll, then hold the back.
  const turn = Math.min(1, Math.max(0, (progress - 0.3) / 0.35));
  return (
    <div ref={ref} className="[perspective:1200px]">
      <div
        className="relative w-44 transition-transform duration-150 ease-out [transform-style:preserve-3d] sm:w-52"
        style={{ transform: `rotateY(${turn * 180}deg) rotateZ(-3deg)` }}
      >
        <div className="face">
          <IdCardPreview config={config} context={SAMPLE_ID_CONTEXT} side="front" className="max-w-none" />
        </div>
        <div className="face absolute inset-0 [transform:rotateY(180deg)]">
          <IdCardPreview config={config} context={SAMPLE_ID_CONTEXT} side="back" className="max-w-none" />
        </div>
      </div>
    </div>
  );
}

/** ID card and ticket, drawn by the same renderer the downloads use. */
export function DocumentsShowcase() {
  const ticket = React.useMemo(() => sampleTicket("horizon"), []);
  return (
    <div className="relative mx-auto flex w-full max-w-xl flex-col items-center gap-8">
      <Tilt className="w-full" innerClassName="rounded-xl">
        <TicketPreview config={ticket} context={SAMPLE_TICKET_CONTEXT} />
      </Tilt>
      <div className="flex w-full items-center justify-center gap-6">
        <FlipCard template="business" />
        <p className="hidden max-w-[12rem] text-sm text-muted-foreground sm:block">
          Two-sided ID cards: photo and details on the front, terms, contacts, and QR code on the back.
        </p>
      </div>
    </div>
  );
}

// The website shows a sample of the designs; admins see all of them when setting up a program.
const SHOWCASE_ID_CARDS = ["aurora", "business", "noir", "crew-tape", "conclave", "vision", "engineer", "inauguration"];
const SHOWCASE_TICKETS = ["horizon", "neon-pass", "boarding-pass", "vip-pass"];

/** A sample of the ID card designs on a slowly turning 3D ring, with a few ticket designs below. */
export function DesignCarousel() {
  const cards = React.useMemo(
    () =>
      ID_CARD_DESIGNS.filter((d) => SHOWCASE_ID_CARDS.includes(d.id)).map((d) => ({ id: d.id, name: d.name, config: sampleIdCard(d.id) })),
    [],
  );
  const tickets = React.useMemo(
    () =>
      TICKET_DESIGNS.filter((d) => SHOWCASE_TICKETS.includes(d.id)).map((d) => ({ id: d.id, name: d.name, config: sampleTicket(d.id) })),
    [],
  );
  const step = 360 / cards.length;

  return (
    <div className="flex flex-col gap-14">
      <div className="carousel-wrap relative mx-auto h-[330px] w-full overflow-hidden [perspective:1400px] sm:h-[420px]">
        <div className="absolute left-1/2 top-6 h-[270px] w-[170px] -translate-x-1/2 [--radius:230px] sm:h-[330px] sm:w-[208px] sm:[--radius:340px]">
          <div className="carousel-ring relative h-full w-full">
            {cards.map((card, i) => (
              <div
                key={card.id}
                className="carousel-item absolute inset-0 flex flex-col items-center gap-2"
                style={{ "--angle": `${i * step}deg` } as React.CSSProperties}
              >
                <IdCardPreview config={card.config} context={SAMPLE_ID_CONTEXT} className="max-w-none shadow-2xl" />
                <span className="rounded-full bg-card/90 px-3 py-0.5 text-xs font-semibold shadow">{card.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {tickets.map((t) => (
          <Tilt key={t.id} innerClassName="rounded-xl">
            <TicketPreview config={t.config} context={SAMPLE_TICKET_CONTEXT} />
            <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">{t.name} ticket</p>
          </Tilt>
        ))}
      </div>
    </div>
  );
}
