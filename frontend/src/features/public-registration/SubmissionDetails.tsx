import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, FileDown, FileText, ImageDown, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch, downloadAuthenticatedFile } from "@/lib/api";
import { printSummary, saveBlob, summaryImage, type SubmissionSummary } from "./submissionDocument";

/** The copy of the answers, laid out like the registration or order details page the team sees. */
function SubmissionDocument({ data }: { data: SubmissionSummary }) {
  const isOrder = data.kind === "order_form";
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          {data.business && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{data.business.name}</p>}
          <CardTitle className="break-all">{data.registrationNumber}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isOrder ? "Placed" : "Submitted"} {new Date(data.submittedAt).toLocaleString()}
            {data.applicantName ? ` · ${data.applicantName}` : ""}
          </p>
        </div>
        <Badge variant="default" className="shrink-0">
          {data.statusLabel ?? data.status}
        </Badge>
      </CardHeader>
      <CardContent>
        {data.sections.map((section) => (
          <div key={section.title} className="mt-6 first:mt-0">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{section.title}</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.rows.map((row, i) => (
                <div key={`${row.label}-${i}`}>
                  <dt className="text-xs uppercase text-muted-foreground">{row.label}</dt>
                  <dd className="whitespace-pre-line break-words text-sm">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Lets a registrant (or a customer who placed an order) preview, print, and download the answers
 * they just submitted, as a PDF or a picture. Orders also show their number and status.
 */
export function SubmissionDetails({
  token,
  heading = "Your registration information",
  variant = "registration",
}: {
  token: string;
  heading?: string;
  variant?: "registration" | "order";
}) {
  const isOrder = variant === "order";
  const [previewing, setPreviewing] = React.useState(false);
  const [busy, setBusy] = React.useState<"pdf" | "image" | null>(null);
  const path = `/public/submissions/${encodeURIComponent(token)}`;

  const { data, isError, refetch } = useQuery({
    queryKey: ["submission-summary", token],
    queryFn: () => apiFetch<SubmissionSummary>(path),
    staleTime: 30_000,
    retry: 2,
  });

  const noun = isOrder ? "Order" : "Registration";
  const fileBase = data ? `${noun}-${data.registrationNumber}`.replace(/[^A-Za-z0-9._-]+/g, "-") : noun;

  const downloadPdf = async () => {
    setBusy("pdf");
    try {
      await downloadAuthenticatedFile(`${path}/pdf`, `${fileBase}.pdf`);
    } catch {
      toast.error("The download didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const downloadImage = async () => {
    if (!data) return;
    setBusy("image");
    try {
      saveBlob(await summaryImage(data), `${fileBase}.png`);
    } catch {
      toast.error("The picture couldn't be made. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const ready = !!data;

  return (
    <section className="w-full max-w-xl rounded-xl border border-border/70 text-left" aria-labelledby="submission-heading">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="submission-heading" className="text-sm font-semibold">
              {heading}
            </h2>
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono font-semibold tracking-wide">{data.registrationNumber}</span>
              <Badge variant="default" aria-label={`Status: ${data.statusLabel ?? data.status}`}>
                {data.statusLabel ?? data.status}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewing(true)} disabled={!ready}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={() => data && printSummary(data)} disabled={!ready}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button size="sm" onClick={downloadPdf} loading={busy === "pdf"} disabled={busy !== null}>
            <FileDown className="h-4 w-4" />
            Download PDF
          </Button>
          <Button size="sm" variant="secondary" onClick={downloadImage} loading={busy === "image"} disabled={!ready || busy !== null}>
            <ImageDown className="h-4 w-4" />
            Download image
          </Button>
        </div>
        {isError && (
          <p role="alert" className="text-xs text-destructive">
            We couldn&apos;t load your copy yet.{" "}
            <button type="button" className="font-medium underline" onClick={() => void refetch()}>
              Try again
            </button>
          </p>
        )}
      </div>
      <p className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
        This page is private to you. Keep a copy for your records.
      </p>

      <Dialog open={previewing} onOpenChange={setPreviewing}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>This is your copy, laid out the way the team sees it.</DialogDescription>
          </DialogHeader>
          {data && <SubmissionDocument data={data} />}
          {data && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => printSummary(data)}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button size="sm" onClick={downloadPdf} loading={busy === "pdf"}>
                <FileDown className="h-4 w-4" />
                Download PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
