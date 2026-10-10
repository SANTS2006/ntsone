import { Loading } from "@/components/Loading";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, BadgeCheck, CreditCard, QrCode, ShieldX, Ticket, UserCheck } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { verifyRegistration, type VerificationResult } from "./api";
import { usePageMeta } from "@/lib/seo";

const DOCUMENTS: Record<VerificationResult["documentType"], { label: string; icon: typeof Ticket }> = {
  id_card: { label: "ID card", icon: CreditCard },
  ticket: { label: "Ticket", icon: Ticket },
  link: { label: "Registration", icon: QrCode },
};

export function VerifyPage() {
  usePageMeta({ title: "Verify a registration" });
  const { slug, registrationNumber } = useParams<{ slug: string; registrationNumber: string }>();
  const [params] = useSearchParams();
  const doc = params.get("doc");
  // Wait for any saved sign-in, so a team member's scan is credited to them in the scan log.
  const { isLoading: authLoading } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["verify", slug, registrationNumber, doc],
    queryFn: () => verifyRegistration(slug!, registrationNumber!, doc),
    enabled: !!slug && !!registrationNumber && !authLoading,
    retry: false,
    staleTime: Infinity,
  });

  if (authLoading || isLoading) return <Loading label="Verifying" />;

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-destructive text-white">
            <ShieldX className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-semibold">Registration not found</h1>
          <p className="text-sm text-muted-foreground">
            We couldn't verify this registration. Double-check the link or QR code.
          </p>
        </CardContent>
      </Card>
    );
  }

  const document = DOCUMENTS[data.documentType];

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${
            data.valid ? "bg-gradient-success" : "bg-gradient-destructive"
          }`}
        >
          {data.valid ? <BadgeCheck className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </span>
        <h1 className="text-xl font-semibold">
          {data.valid ? `Valid ${document.label}` : `${document.label} Not Valid`}
        </h1>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground">
          <document.icon className="h-3.5 w-3.5" />
          Verified {new Date(data.verifiedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </span>
        <div className="mt-2 flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Program: </span>
            <span className="font-medium">{data.programName}</span>
          </p>
          {data.applicantName && (
            <p>
              <span className="text-muted-foreground">Participant: </span>
              <span className="font-medium">{data.applicantName}</span>
            </p>
          )}
          <p>
            <span className="text-muted-foreground">Registration #: </span>
            <span className="font-medium">{data.registrationNumber}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Status: </span>
            <span className="font-medium capitalize">{data.status.replace("_", " ")}</span>
          </p>
          {data.details.map((detail) => (
            <p key={detail.label}>
              <span className="text-muted-foreground">{detail.label}: </span>
              <span className="font-medium">{detail.value}</span>
            </p>
          ))}
          <p>
            <span className="text-muted-foreground">Registered: </span>
            <span className="font-medium">
              {new Date(data.submittedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            </span>
          </p>
        </div>
        {data.alreadyVerified && (
          <p className="mt-2 rounded-lg border border-border/70 px-3 py-2 text-xs text-muted-foreground">
            First checked in{" "}
            {new Date(data.firstVerifiedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Later
            scans are checked but not logged again.
          </p>
        )}
        {data.scannedByTeamMember && !data.alreadyVerified && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-gradient-brand-soft px-3 py-2 text-xs font-medium text-primary">
            <UserCheck className="h-4 w-4" />
            This check was recorded in the program&apos;s Verifications log under your name.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
