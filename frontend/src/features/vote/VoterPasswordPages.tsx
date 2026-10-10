import { Loading } from "@/components/Loading";
import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, MailCheck } from "lucide-react";
import { CodeInput } from "@/components/CodeInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { forgotVoterPassword, resetVoterPassword } from "./api";
import { PollLogo, useVotePoll, VoteShell } from "./VoteShell";
import { VoteMessage } from "./VoteMessage";

const MIN_LENGTH = 8;

function safeNext(slug: string, value: string | null) {
  return value?.startsWith(`/vote/${slug}`) ? value : `/vote/${slug}`;
}

function PasswordCardHeader({ poll, title, subtitle }: { poll: Parameters<typeof PollLogo>[0]["poll"]; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <PollLogo poll={poll} size="h-20 w-20" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{poll.name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function usePollOrMessage(slug: string) {
  const { data: poll, isLoading, error } = useVotePoll(slug);
  let early: React.ReactNode = null;
  if (isLoading) {
    early = <VoteShell><Loading label="Loading" /></VoteShell>;
  } else if (error || !poll) {
    early = (
      <VoteShell>
        <VoteMessage tone="error" title="Poll not found" message={error instanceof ApiError ? error.message : "This poll doesn't exist or has been removed."} />
      </VoteShell>
    );
  }
  return { poll, early };
}

/** Step one: the voter enters their email and we send a code. */
export function VoterForgotPasswordPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const next = safeNext(slug, params.get("next"));
  const navigate = useNavigate();
  const { poll, early } = usePollOrMessage(slug);
  usePageMeta({ title: poll ? `Forgot password: ${poll.name}` : "Forgot password" });
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);
  const emailProblem = !email.trim() ? "Please enter your email address" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter a valid email address, like name@example.com" : "";

  if (early) return <>{early}</>;
  if (!poll) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailProblem) {
      setTouched(true);
      document.getElementById("forgot-email")?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await forgotVoterPassword({ pollSlug: slug, email });
      toast.success("If that email has an account, we've sent it a code");
      navigate(`/vote/${slug}/reset-password?email=${encodeURIComponent(result.email)}&next=${encodeURIComponent(next)}`);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <VoteShell poll={poll}>
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
          <PasswordCardHeader poll={poll} title="Forgot your password?" subtitle="Enter your email and we'll send you a code to choose a new one." />
          {problem && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {problem}
            </p>
          )}
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={touched && emailProblem ? true : undefined}
                aria-describedby={touched && emailProblem ? "forgot-email-error" : undefined}
                autoFocus
              />
              {touched && emailProblem && (
                <p id="forgot-email-error" role="alert" className="text-sm text-destructive">
                  {emailProblem}
                </p>
              )}
            </div>
            <Button type="submit" loading={busy} className="w-full">
              Send me a code
            </Button>
          </form>
          <Link to={`/vote/${slug}/login?next=${encodeURIComponent(next)}`} className="text-center text-sm font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </VoteShell>
  );
}

/** Step two: the code from the email, then the new password (with show/hide on both fields). */
export function VoterResetPasswordPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const next = safeNext(slug, params.get("next"));
  const { poll, early } = usePollOrMessage(slug);
  usePageMeta({ title: poll ? `Reset password: ${poll.name}` : "Reset password" });
  const [email, setEmail] = React.useState(params.get("email") ?? "");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  if (early) return <>{early}</>;
  if (!poll) return null;

  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [triedSubmit, setTriedSubmit] = React.useState(false);
  const errs = {
    email: !email.trim() ? "Please enter your email address" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter a valid email address, like name@example.com" : "",
    code: code.length < 6 ? "Please enter the 6-character code from your email" : "",
    password: !password ? "Please enter a new password" : password.length < MIN_LENGTH ? `Use at least ${MIN_LENGTH} characters` : "",
    confirm: !confirm ? "Please confirm your new password" : confirm !== password ? "Passwords don't match" : "",
  };
  const shown = (key: keyof typeof errs) => ((touched[key] || triedSubmit) && errs[key]) || "";
  const touch = (key: string) => () => setTouched((t) => ({ ...t, [key]: true }));
  const tooShort = !!shown("password");
  const mismatch = !!shown("confirm");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const firstBad = (["email", "code", "password", "confirm"] as const).find((key) => errs[key]);
    if (firstBad) {
      setTriedSubmit(true);
      document.getElementById(firstBad === "email" ? "reset-email" : firstBad === "password" ? "reset-password" : firstBad === "confirm" ? "reset-confirm" : "code-0")?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await resetVoterPassword({ pollSlug: slug, email, code, password });
      setDone(true);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <VoteShell poll={poll}>
        <Card className="mx-auto w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:p-8">
            <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight">Password changed</h1>
            <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
            <Link
              to={`/vote/${slug}/login?next=${encodeURIComponent(next)}`}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-gradient-brand px-6 text-sm font-semibold text-white shadow-glow"
            >
              Sign in
            </Link>
          </CardContent>
        </Card>
      </VoteShell>
    );
  }

  return (
    <VoteShell poll={poll}>
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
          <PasswordCardHeader poll={poll} title="Choose a new password" subtitle="Enter the code we emailed you, then pick a new password." />
          {problem && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {problem}
            </p>
          )}
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {!params.get("email") && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={touch("email")}
                  aria-invalid={shown("email") ? true : undefined}
                />
                {shown("email") && (
                  <p role="alert" className="text-sm text-destructive">
                    {shown("email")}
                  </p>
                )}
              </div>
            )}
            {params.get("email") && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <MailCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                Code sent to <span className="font-medium text-foreground">{email}</span>
              </p>
            )}
            <div className="flex flex-col items-center gap-1.5">
              <Label className="self-start">Code from your email</Label>
              <CodeInput value={code} onChange={setCode} disabled={busy} autoFocus />
              {shown("code") && (
                <p role="alert" className="self-start text-sm text-destructive">
                  {shown("code")}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-password">New password</Label>
              <PasswordInput
                id="reset-password"
                autoComplete="new-password"
                placeholder="Enter your new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={touch("password")}
                aria-invalid={tooShort ? true : undefined}
              />
              <p role={tooShort ? "alert" : undefined} className={tooShort ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
                {tooShort ? shown("password") : `At least ${MIN_LENGTH} characters.`}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-confirm">Confirm new password</Label>
              <PasswordInput
                id="reset-confirm"
                autoComplete="new-password"
                placeholder="Confirm your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={touch("confirm")}
                aria-invalid={mismatch ? true : undefined}
              />
              {mismatch && (
                <p role="alert" className="text-sm text-destructive">
                  {shown("confirm")}
                </p>
              )}
            </div>
            <Button type="submit" loading={busy} className="w-full">
              <KeyRound className="h-4 w-4" />
              Save new password
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            No code?{" "}
            <Link to={`/vote/${slug}/forgot-password?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
              Send a new one
            </Link>
          </p>
        </CardContent>
      </Card>
    </VoteShell>
  );
}
