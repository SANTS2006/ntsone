import { FullScreenLoading } from "@/components/Loading";
import * as React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/app/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CodeInput } from "@/components/CodeInput";
import { ApiError } from "@/lib/api";
import { confirmEmailChange, requestEmailChange, resendVerificationCode, verifyEmail } from "./api";
import { usePageMeta } from "@/lib/seo";

const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;

type Mode = "verify" | "change-email" | "confirm-new-email";

function useCountdown(initial: number) {
  const [seconds, setSeconds] = React.useState(initial);
  React.useEffect(() => {
    if (seconds <= 0) return;
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [seconds]);
  return [seconds, setSeconds] as const;
}

export function VerifyEmailPage() {
  usePageMeta({ title: "Verify your email" });
  const { user, isLoading, updateLocalUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const justSent = (location.state as { codeJustSent?: boolean } | null)?.codeJustSent === true;

  const [mode, setMode] = React.useState<Mode>("verify");
  const [code, setCode] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [pendingEmail, setPendingEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [cooldown, setCooldown] = useCountdown(justSent ? RESEND_COOLDOWN_SECONDS : 0);

  if (isLoading) {
    return <FullScreenLoading />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to="/admin" replace />;

  const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

  const submitCode = async (value: string) => {
    if (value.length !== CODE_LENGTH || submitting) return;
    setSubmitting(true);
    try {
      const updated = mode === "confirm-new-email" ? await confirmEmailChange(value) : await verifyEmail(value);
      updateLocalUser(updated);
      toast.success("Email verified. Welcome aboard!");
      navigate("/admin", { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, "Verification failed"));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    try {
      if (mode === "confirm-new-email") await requestEmailChange(pendingEmail);
      else await resendVerificationCode();
      toast.success("A new code is on its way");
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(errorMessage(err, "Could not send a new code"));
    }
  };

  const sendToNewEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestEmailChange(newEmail);
      setPendingEmail(newEmail.trim().toLowerCase());
      setCode("");
      setMode("confirm-new-email");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success("Code sent to your new email address");
    } catch (err) {
      toast.error(errorMessage(err, "Could not update your email"));
    } finally {
      setSubmitting(false);
    }
  };

  const targetEmail = mode === "confirm-new-email" ? pendingEmail : user.email;

  return (
    <main id="main-content" tabIndex={-1} className="page-enter flex min-h-screen items-center justify-center p-4 focus:outline-none sm:p-8">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-2xl">
        <div className="relative bg-gradient-brand px-8 pb-10 pt-6 text-white">
          <div className="pointer-events-none absolute inset-0 bg-gradient-radial-soft opacity-60" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-9 items-center justify-center rounded-lg bg-white px-1.5 shadow-sm">
                <BrandLogo className="h-7" />
              </span>
              NTSOne
            </div>
            <ThemeToggle className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
          </div>
          <div className="relative mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <MailCheck className="h-7 w-7" />
          </div>
          <h1 className="relative mt-4 text-2xl font-bold">
            {mode === "change-email" ? "Use a different email" : "Check your inbox"}
          </h1>
          <p className="relative mt-1 text-sm text-white/80">
            {mode === "change-email"
              ? "We'll send a new verification code to the address you enter."
              : "Enter the 6-character code we emailed you to verify your account."}
          </p>
        </div>

        <div className="flex flex-col gap-6 p-8">
          {mode === "change-email" ? (
            <form className="flex flex-col gap-4" onSubmit={sendToNewEmail} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newEmail">New email address</Label>
                <Input
                  id="newEmail"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  className="h-12 rounded-full px-5"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <Button type="submit" size="lg" className="h-12 rounded-full" loading={submitting} disabled={!newEmail.includes("@")}>
                {submitting ? "Sending..." : "Send verification code"}
              </Button>
              <button
                type="button"
                onClick={() => setMode("verify")}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to verification
              </button>
            </form>
          ) : (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Code sent to <span className="font-semibold text-foreground">{targetEmail}</span>
              </p>

              <CodeInput
                value={code}
                onChange={setCode}
                onComplete={submitCode}
                length={CODE_LENGTH}
                disabled={submitting}
                autoFocus
              />

              <Button
                size="lg"
                className="h-12 rounded-full"
                loading={submitting}
                disabled={code.length !== CODE_LENGTH}
                onClick={() => submitCode(code)}
              >
                {submitting ? "Verifying..." : "Verify email"}
              </Button>

              <div className="flex flex-col items-center gap-2 text-sm">
                <p className="text-muted-foreground">
                  Didn&apos;t get it? Check your spam folder or{" "}
                  {cooldown > 0 ? (
                    <span className="font-medium text-foreground">resend in {cooldown}s</span>
                  ) : (
                    <button type="button" onClick={resend} className="font-medium text-primary hover:opacity-80">
                      resend the code
                    </button>
                  )}
                </p>
                {mode === "verify" && (
                  <button
                    type="button"
                    onClick={() => setMode("change-email")}
                    className="font-medium text-muted-foreground hover:text-primary"
                  >
                    Wrong email address? Change it
                  </button>
                )}
              </div>
            </>
          )}

          <div className="border-t border-border/60 pt-4 text-center">
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate("/", { replace: true });
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
