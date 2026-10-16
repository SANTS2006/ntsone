import { Loading, LogoSpinner } from "@/components/Loading";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatMinor } from "@/lib/money";
import { usePageMeta } from "@/lib/seo";
import type { SubmitRegistrationResult } from "../public-registration/api";
import { getPaymentView, retryPayment, type PaymentView } from "./api";

function Lines({ view }: { view: PaymentView }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4 text-sm">
      <ul className="flex flex-col gap-1">
        {view.lineItems.map((line) => (
          <li key={line.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{line.quantity > 1 ? `${line.quantity} x ${line.name}` : line.name}</span>
            <span className="shrink-0 font-medium">{formatMinor(line.totalMinor, view.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between border-t border-border/60 pt-2 text-base font-bold">
        <span>Total</span>
        <span>{formatMinor(view.amountMinor, view.currency)}</span>
      </div>
    </div>
  );
}

/** Where someone lands after paying (or not) on Monime's page, and where an unfinished payment can be picked up again. */
export function PublicPaymentPage() {
  usePageMeta({ title: "Payment" });
  const { token = "" } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const cameBack = search.get("result");

  const { data: view, error, isLoading } = useQuery({
    queryKey: ["payment-view", token],
    queryFn: () => getPaymentView(token, true),
    retry: false,
    // While Monime is still confirming, ask again every few seconds.
    refetchInterval: (query) => (query.state.data?.status === "pending" && (query.state.data?.redirectUrl === null || cameBack === "success") ? 3_000 : false),
    refetchIntervalInBackground: false,
  });

  const retry = useMutation({
    mutationFn: () => retryPayment(token),
    onSuccess: (result) => {
      if (result.redirectUrl && result.redirectUrl.startsWith("https://")) window.location.assign(result.redirectUrl);
      else navigate(`/payment/${result.token}`, { replace: true });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not start the payment again. Please try again in a moment."),
  });

  const goToConfirmation = React.useCallback(
    (v: PaymentView) => {
      // Votes are used on the voting page, where the voter is still signed in.
      if (v.kind === "poll") return navigate(`/vote/${v.programSlug}`, { replace: true });
      const state: SubmitRegistrationResult = {
        registrationNumber: v.registrationNumber,
        status: v.registrationStatus,
        confirmationMessage: v.confirmationMessage,
        showRegistrationNumber: v.showRegistrationNumber,
        idCardAvailable: v.idCardAvailable,
        ticketAvailable: v.ticketAvailable,
        documentsInPerson: v.documentsInPerson,
        receiptToken: v.receiptToken,
      };
      navigate(v.kind === "order_form" ? `/order/${v.programSlug}/confirmation` : `/programs/${v.programSlug}/confirmation`, { state, replace: true });
    },
    [navigate],
  );

  // Paid: carry on to the confirmation page (with the ID card, ticket and copy) after a moment.
  React.useEffect(() => {
    if (view?.status !== "completed") return;
    const timer = window.setTimeout(() => goToConfirmation(view), 2500);
    return () => window.clearTimeout(timer);
  }, [view, goToConfirmation]);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <CardContent>
        <Loading label="Checking your payment" />
      </CardContent>
    );
  } else if (error || !view) {
    body = (
      <>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" /> This payment link isn&apos;t valid
          </CardTitle>
          <CardDescription>The link may have expired. If you were trying to pay, go back to the registration page and start again.</CardDescription>
        </CardHeader>
      </>
    );
  } else if (view.status === "completed" || view.registrationPaymentStatus === "paid") {
    body = (
      <>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" /> Payment received
          </CardTitle>
          <CardDescription>
            {view.kind === "poll"
              ? `Thank you! Your ${view.poll?.votes ?? 0} ${view.poll?.votes === 1 ? "vote" : "votes"} for ${view.poll?.positionTitle ?? "this position"} ${view.poll?.used ? "were already used." : "are ready. Taking you to the voting page to choose your candidate..."}`
              : `Thank you! Your ${view.kind === "order_form" ? "order" : "registration"} for ${view.programName} is confirmed. Taking you to your confirmation...`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{view.kind === "poll" ? "Votes bought" : view.kind === "order_form" ? "Order number" : "Registration number"}</p>
            <p className="text-xl font-bold tracking-tight">{view.kind === "poll" ? `${view.poll?.votes ?? 0} for ${view.poll?.positionTitle ?? ""}` : view.registrationNumber}</p>
            {view.paidAt && <p className="mt-1 text-muted-foreground">Paid on {new Date(view.paidAt).toLocaleString()}</p>}
          </div>
          <Lines view={view} />
          <Button onClick={() => goToConfirmation(view)}>{view.kind === "poll" ? "Go to the voting page" : `See my ${view.kind === "order_form" ? "order" : "registration"} details`}</Button>
        </CardContent>
      </>
    );
  } else if (view.status === "review" || view.registrationPaymentStatus === "review") {
    body = (
      <>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" /> We&apos;re checking your payment
          </CardTitle>
          <CardDescription>
            The amount we received doesn&apos;t match what was asked for. The organizer has been told and will sort it out. Quote {view.registrationNumber} if you contact them. Please don&apos;t pay again.
          </CardDescription>
        </CardHeader>
      </>
    );
  } else if (view.status === "pending") {
    const confirming = cameBack === "success";
    body = (
      <>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {confirming ? <LogoSpinner size="sm" /> : <Clock className="h-5 w-5 text-primary" />}
            {confirming ? "Confirming your payment" : "Complete your payment"}
          </CardTitle>
          <CardDescription>
            {confirming
              ? "This usually takes a few seconds. Please keep this page open."
              : `${view.programName}${view.registrationNumber ? ` (${view.registrationNumber})` : ""} is waiting for payment.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Lines view={view} />
          {view.redirectUrl && !confirming && (
            <Button onClick={() => window.location.assign(view.redirectUrl!)}>
              <ShieldCheck className="h-4 w-4" />
              Pay {formatMinor(view.amountMinor, view.currency)}
            </Button>
          )}
          {!view.redirectUrl && (
            <p className="text-sm text-muted-foreground">If nothing happens after a minute, you can start the payment again.</p>
          )}
          {!view.redirectUrl && (
            <Button variant="outline" loading={retry.isPending} onClick={() => retry.mutate()}>
              Start the payment again
            </Button>
          )}
        </CardContent>
      </>
    );
  } else {
    // failed, cancelled or expired
    const cancelled = view.status === "cancelled" || cameBack === "cancelled";
    body = (
      <>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" /> {cancelled ? "Payment cancelled" : "Payment not completed"}
          </CardTitle>
          <CardDescription>
            {view.kind === "poll" ? "Nothing was charged and no votes were bought. You can try again." : `Nothing was charged. Your ${view.kind === "order_form" ? "order" : "registration"} (${view.registrationNumber}) is saved, but it needs payment to go through.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Lines view={view} />
          {view.canRetry ? (
            <Button loading={retry.isPending} onClick={() => retry.mutate()}>
              Try again
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Please contact the organizer to complete your payment.</p>
          )}
        </CardContent>
      </>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="page-enter mx-auto flex min-h-screen w-full max-w-lg items-center p-4 focus:outline-none">
      <Card className="w-full overflow-hidden">{body}</Card>
    </main>
  );
}
