import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, IdCard, Ticket } from "lucide-react";
import { useLocation, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { DesignSvg } from "../designs/DesignSvg";
import { downloadRegistrantDocument, type DocumentKind } from "../designs/documentImage";
import type { SubmitRegistrationResult } from "./api";
import { SubmissionDetails } from "./SubmissionDetails";
import { usePageMeta } from "@/lib/seo";

function downloadUrl(slug: string, registrationNumber: string, kind: "id-card" | "ticket") {
  return `/api/public/programs/${encodeURIComponent(slug)}/registrations/${encodeURIComponent(registrationNumber)}/${kind}`;
}

/** The registrant's own card or ticket, drawn by the server in the program's chosen design. */
// Drawn inline rather than as an <img> so the card uses the page's Poppins font.
function DocumentImage({
  src,
  alt,
  className,
  onSides,
}: {
  src: string;
  alt: string;
  className: string;
  /** Reports how many sides the document has, so a ticket's back can be shown too. */
  onSides?: (sides: number) => void;
}) {
  const [svg, setSvg] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch(src, { credentials: "same-origin" })
      .then((res) => {
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.startsWith("image/svg+xml")) throw new Error("unavailable");
        onSides?.(Number(res.headers.get("x-document-sides") ?? 1));
        return res.text();
      })
      .then((text) => !cancelled && setSvg(text))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) return null;
  if (!svg) return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
  return <DesignSvg svg={svg} label={alt} className={`h-auto rounded-xl shadow-lg ring-1 ring-black/5 ${className}`} />;
}

export function ConfirmationPage({ variant = "registration" }: { variant?: "registration" | "order" }) {
  const isOrder = variant === "order";
  usePageMeta({ title: isOrder ? "Order placed" : "Registration received" });
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const result = React.useMemo(() => {
    const key = `registration-result:${slug}`;
    const fromNavigation = location.state as SubmitRegistrationResult | undefined;
    // Kept for this browser tab so a reload still shows the confirmation.
    try {
      if (fromNavigation) sessionStorage.setItem(key, JSON.stringify(fromNavigation));
      else return JSON.parse(sessionStorage.getItem(key) ?? "null") as SubmitRegistrationResult | null;
    } catch {
      /* storage unavailable */
    }
    return fromNavigation ?? null;
  }, [location.state, slug]);
  const [downloading, setDownloading] = React.useState<DocumentKind | null>(null);
  const [ticketSides, setTicketSides] = React.useState(1);

  const download = async (kind: DocumentKind) => {
    if (!slug || !result) return;
    setDownloading(kind);
    try {
      await downloadRegistrantDocument(
        kind,
        `/public/programs/${encodeURIComponent(slug)}/registrations/${encodeURIComponent(result.registrationNumber)}`,
      );
    } catch {
      toast.error("The download didn't work. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  if (!result) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">We couldn't find your confirmation details.</p>
          <LinkButton to={isOrder ? `/order/${slug}` : `/programs/${slug}`} variant="outline" size="sm">
            {isOrder ? "Back to the order page" : "Back to program"}
          </LinkButton>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-success text-white shadow-glow">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-semibold">{isOrder ? "Order placed!" : "Registration submitted!"}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {result.confirmationMessage ??
            (isOrder
              ? "Thank you for your order. We've emailed you a confirmation and will let you know as it progresses."
              : "Thank you for registering. We've received your submission.")}
        </p>
        {(isOrder || result.showRegistrationNumber !== false) && (
          <div className="rounded-xl border border-border/70 bg-gradient-brand-soft px-6 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{isOrder ? "Order Number" : "Registration Number"}</p>
            <p className="gradient-text text-lg font-semibold tracking-wide">{result.registrationNumber}</p>
          </div>
        )}
        {slug && (result.idCardAvailable || result.ticketAvailable) && (
          <div className="flex w-full flex-col items-center gap-6 py-2">
            {result.idCardAvailable && (
              <div className="flex flex-wrap justify-center gap-4">
                {(["front", "back"] as const).map((side) => (
                  <DocumentImage
                    key={side}
                    src={`${downloadUrl(slug, result.registrationNumber, "id-card")}?format=svg&side=${side}`}
                    alt={`Your ID card (${side})`}
                    className="aspect-[300/476] w-40 sm:w-48"
                  />
                ))}
              </div>
            )}
            {result.ticketAvailable && (
              <DocumentImage
                src={`${downloadUrl(slug, result.registrationNumber, "ticket")}?format=svg`}
                alt="Your ticket"
                className="aspect-[3/1] w-full max-w-xl"
                onSides={setTicketSides}
              />
            )}
            {result.ticketAvailable && ticketSides > 1 && (
              <DocumentImage
                src={`${downloadUrl(slug, result.registrationNumber, "ticket")}?format=svg&side=back`}
                alt="Your ticket (back)"
                className="aspect-[3/1] w-full max-w-xl"
              />
            )}
          </div>
        )}
        {slug && (result.idCardAvailable || result.ticketAvailable) && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {result.idCardAvailable && (
              <Button
                variant="success"
                loading={downloading === "id-card"}
                disabled={downloading !== null}
                onClick={() => download("id-card")}
              >
                <IdCard className="h-4 w-4" />
                Download ID Card
              </Button>
            )}
            {result.ticketAvailable && (
              <Button loading={downloading === "ticket"} disabled={downloading !== null} onClick={() => download("ticket")}>
                <Ticket className="h-4 w-4" />
                Download Ticket
              </Button>
            )}
          </div>
        )}
        {result.receiptToken && <SubmissionDetails token={result.receiptToken} heading={isOrder ? "Your order details" : undefined} variant={variant} />}
      </CardContent>
    </Card>
  );
}

export function OrderConfirmationPage() {
  return <ConfirmationPage variant="order" />;
}
