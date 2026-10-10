import * as React from "react";
import { code128, formatLeones, renderTicketSides, sampleQrMatrix } from "@designs";
import { cn } from "@/lib/utils";
import { DesignSvg } from "../designs/DesignSvg";
import type { TicketConfig } from "./api";

const SAMPLE_QR = sampleQrMatrix();
const SAMPLE_BARCODE = code128("REG-2026-000123");
const SAMPLE_VALUES = ["Freetown", "Youth Leader"];

export interface TicketPreviewContext {
  organizationName: string;
  programName: string;
  programDates?: string;
  shortDescription?: string | null;
  fieldLabels?: string[];
}

/** The price as the ticket prints it: "FREE", an amount in leones, or nothing. */
export function ticketPriceText(config: Pick<TicketConfig, "showPrice" | "isPaid" | "priceAmount">): string | undefined {
  if (config.showPrice === false) return undefined;
  if (!config.isPaid) return "FREE";
  return config.priceAmount !== undefined ? formatLeones(config.priceAmount) : undefined;
}

/** The ticket exactly as the download draws it, filled with a sample registrant. */
export function TicketPreview({
  config,
  context,
  side = "front",
  className,
}: {
  config: TicketConfig;
  context: TicketPreviewContext;
  side?: "front" | "back";
  className?: string;
}) {
  const sides = React.useMemo(() => {
    const details = config.showEventDetails !== false;
    const contact = config.showContact !== false;
    return renderTicketSides(
      config.template,
      {
        logo: { image: config.logoUrl ?? null, orgName: context.organizationName, tagline: context.programName },
        kicker: config.kicker || context.organizationName,
        title: config.eventTitle || context.programName,
        subtitle: config.tagline || context.shortDescription || "",
        date: details ? config.eventDate || context.programDates : undefined,
        time: details ? config.eventTime || undefined : undefined,
        venue: details ? config.venue || undefined : undefined,
        price: ticketPriceText(config),
        participantName: config.showParticipantName === false ? "" : "Jordan Avery",
        registrationNumber: config.showRegistrationNumber === false ? "" : "REG-2026-000123",
        fields: (context.fieldLabels ?? []).map((label, i) => ({ label, value: SAMPLE_VALUES[i] ?? "Sample" })),
        phone: contact ? config.contactPhone || undefined : undefined,
        website: contact ? config.website || undefined : undefined,
        terms: config.terms || undefined,
        qr: config.showQrCode ? SAMPLE_QR : null,
        barcode: config.showBarcode === false ? null : SAMPLE_BARCODE,
        background: config.template === "custom" ? (config.backgroundImageUrl ?? null) : null,
        image: config.eventImageUrl ?? null,
        textColor: config.textColor,
        overlayOpacity: config.overlayOpacity,
      },
      { primary: config.primaryColor, secondary: config.secondaryColor },
    );
  }, [config, context]);

  const svg = side === "back" && sides.back ? sides.back : sides.front;
  return (
    <DesignSvg
      svg={svg}
      label={`Ticket preview, ${side}`}
      className={cn("w-full rounded-xl shadow-lg ring-1 ring-black/5", className)}
    />
  );
}
