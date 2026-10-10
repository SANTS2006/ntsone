import * as React from "react";
import { code128, renderIdCard, sampleQrMatrix, type IdCardContent } from "@designs";
import { cn } from "@/lib/utils";
import { DesignSvg } from "../designs/DesignSvg";
import type { IdCardConfig } from "./api";

const SAMPLE_VALUES = ["Freetown", "+232 76 123 456", "Youth Leader"];
const SAMPLE_QR = sampleQrMatrix();
const SAMPLE_BARCODE = code128("REG-2026-000123");

export interface IdCardPreviewContext {
  organizationName: string;
  programName: string;
  /** Labels of the form fields chosen to appear on the card. */
  fieldLabels?: string[];
  validUntil?: string;
  /** Per-registrant previews: their role and photo. */
  role?: string;
  photoUrl?: string;
}

export function idCardPreviewContent(config: IdCardConfig, context: IdCardPreviewContext): IdCardContent {
  return {
    logo: { image: config.logoUrl ?? null, orgName: context.organizationName, tagline: context.programName },
    name: "Jordan Avery",
    role: config.showRole === false ? "" : context.role || config.roleText || "Participant",
    registrationNumber: config.showRegistrationNumber === false ? "" : "REG-2026-000123",
    fields: (context.fieldLabels ?? []).map((label, i) => ({ label, value: SAMPLE_VALUES[i] ?? "Sample" })),
    issued:
      config.showDates === false
        ? undefined
        : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    validUntil: config.showDates === false ? undefined : context.validUntil,
    photo: context.photoUrl ?? (config.photoSource === "flyer" ? (config.flyerUrl ?? null) : null),
    hidePhoto: config.photoSource === "none" && !context.photoUrl,
    qr: config.showQrCode ? SAMPLE_QR : null,
    barcode: config.showBarcode === false ? null : SAMPLE_BARCODE,
    terms:
      config.showTerms === false
        ? []
        : (config.terms ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 4),
    contact:
      config.showContact === false
        ? {}
        : {
            phone: config.contactPhone,
            email: config.contactEmail,
            website: config.contactWebsite,
            address: config.contactAddress,
          },
    signatureLabel: config.showSignature === false ? "" : config.signatureLabel || "Authorized Signature",
    background: config.template === "custom" ? (config.backgroundImageUrl ?? null) : null,
  };
}

/** The card exactly as the PDF draws it, filled with sample registrant details. */
export function IdCardPreview({
  config,
  context,
  side = "front",
  className,
}: {
  config: IdCardConfig;
  context: IdCardPreviewContext;
  side?: "front" | "back";
  className?: string;
}) {
  const rendered = React.useMemo(
    () =>
      renderIdCard(config.template, idCardPreviewContent(config, context), {
        primary: config.primaryColor,
        secondary: config.secondaryColor,
      }),
    [config, context],
  );

  return (
    <DesignSvg
      svg={rendered[side]}
      label={`ID card preview, ${side}`}
      className={cn("w-full max-w-[240px] rounded-xl shadow-lg ring-1 ring-black/5", className)}
    />
  );
}
