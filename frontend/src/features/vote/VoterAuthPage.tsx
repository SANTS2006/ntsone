import { Loading } from "@/components/Loading";
import * as React from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtSign, BadgeCheck, MailCheck } from "lucide-react";
import { CodeInput } from "@/components/CodeInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { googleVoter, loginVoter, registerVoter, resendVoterCode, verifyVoter, type AuthResult } from "./api";
import { GoogleButton } from "./GoogleButton";
import { PollLogo, useVotePoll, useVoterSession, VoteShell } from "./VoteShell";
import { VoteMessage } from "./VoteMessage";

/**
 * The poll's own sign-in and sign-up pages, branded with its name and picture. These are voter
 * accounts only: they work for every poll but never give access to the rest of the system.
 */
export function VoterAuthPage({ mode }: { mode: "login" | "register" }) {
  const { slug = "" } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith(`/vote/${slug}`) ? params.get("next")! : `/vote/${slug}`;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: poll, isLoading, error } = useVotePoll(slug);
  const { data: session } = useVoterSession(slug);
  usePageMeta({ title: poll ? `${mode === "login" ? "Sign in" : "Sign up"} to vote: ${poll.name}` : "Vote" });

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [verifyEmail, setVerifyEmail] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = React.useState(false);

  // What is wrong with each field right now; shown once the person has left the field or tried to continue.
  const trimmedEmail = email.trim();
  const fieldErrors = {
    name:
      mode !== "register"
        ? ""
        : !name.trim()
          ? "Please enter your full name"
          : name.trim().length < 2
            ? "Enter your full name (at least 2 letters)"
            : !/[A-Za-z]/.test(name)
              ? "Your name should contain letters"
              : "",
    email: !trimmedEmail ? "Please enter your email address" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) ? "Enter a valid email address, like name@example.com" : "",
    password: !password
      ? mode === "register"
        ? "Please create a password"
        : "Please enter your password"
      : mode === "register" && password.length < 10
        ? "Use at least 10 characters"
        : "",
  };
  const shown = (key: keyof typeof fieldErrors) => ((touched[key] || submitted) && fieldErrors[key]) || "";
  const touch = (key: string) => () => setTouched((t) => ({ ...t, [key]: true }));

  if (isLoading) return <VoteShell><Loading label="Loading" /></VoteShell>;
  if (error || !poll) {
    return (
      <VoteShell>
        <VoteMessage tone="error" title="Poll not found" message={error instanceof ApiError ? error.message : "This poll doesn't exist or has been removed."} />
      </VoteShell>
    );
  }
  if (session?.voter) return <Navigate to={next} replace />;

  const domains = poll.allowedDomains;
  const domainText = domains.map((d) => `@${d}`).join(" or ");

  const finish = async (result: AuthResult) => {
    if (result.status === "verify") {
      setVerifyEmail(result.email);
      setCode("");
      toast.success(`We sent a 6-character code to ${result.email}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["vote"] });
    toast.success(`Welcome, ${result.voter.name}`);
    navigate(next, { replace: true });
  };

  const attempt = async (action: () => Promise<AuthResult>) => {
    setBusy(true);
    setProblem(null);
    try {
      await finish(await action());
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const firstBad = (["name", "email", "password"] as const).find((key) => fieldErrors[key]);
    if (firstBad) {
      setSubmitted(true);
      document.getElementById(`voter-${firstBad}`)?.focus();
      return;
    }
    if (mode === "register") void attempt(() => registerVoter({ pollSlug: slug, name, email, password }));
    else void attempt(() => loginVoter({ pollSlug: slug, email, password }));
  };

  const header = (
    <div className="flex flex-col items-center gap-3 text-center">
      <PollLogo poll={poll} size="h-20 w-20" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{mode === "login" ? "Sign in to vote" : "Create a voter account"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{poll.name}</h1>
      </div>
      {poll.verifiedVotersOnly && (
        <p className="flex items-center gap-2 rounded-full border border-primary/25 bg-gradient-brand-soft px-3 py-1 text-xs font-medium text-primary">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Only verified voters can create an account
        </p>
      )}
      {domains.length > 0 && (
        <p className="flex items-center gap-2 rounded-full border border-primary/25 bg-gradient-brand-soft px-3 py-1 text-xs font-medium text-primary">
          <AtSign className="h-3.5 w-3.5" aria-hidden="true" />
          Only email addresses ending in {domainText} can vote
        </p>
      )}
    </div>
  );

  return (
    <VoteShell poll={poll}>
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
          {header}

          {problem && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {problem}
            </p>
          )}

          {verifyEmail ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <MailCheck className="h-8 w-8 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Enter the code we sent to <span className="font-medium text-foreground">{verifyEmail}</span> to confirm your email.
              </p>
              <CodeInput
                value={code}
                onChange={setCode}
                onComplete={(value) => void attempt(() => verifyVoter({ pollSlug: slug, email: verifyEmail, code: value }))}
                disabled={busy}
                autoFocus
              />
              <Button className="w-full" loading={busy} disabled={code.length < 6} onClick={() => void attempt(() => verifyVoter({ pollSlug: slug, email: verifyEmail, code }))}>
                Confirm and continue
              </Button>
              <div className="flex gap-3 text-sm">
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => void attempt(() => resendVoterCode({ pollSlug: slug, email: verifyEmail }))}>
                  Send a new code
                </button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setVerifyEmail(null)}>
                  Use a different email
                </button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
                {mode === "register" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="voter-name">Full name</Label>
                    <Input
                      id="voter-name"
                      autoComplete="name"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={touch("name")}
                      aria-invalid={shown("name") ? true : undefined}
                      aria-describedby={shown("name") ? "voter-name-error" : undefined}
                    />
                    {shown("name") && (
                      <p id="voter-name-error" role="alert" className="text-sm text-destructive">
                        {shown("name")}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="voter-email">Email</Label>
                  <Input
                    id="voter-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={touch("email")}
                    aria-invalid={shown("email") ? true : undefined}
                    aria-describedby={shown("email") ? "voter-email-error" : undefined}
                  />
                  {shown("email") && (
                    <p id="voter-email-error" role="alert" className="text-sm text-destructive">
                      {shown("email")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="voter-password">Password</Label>
                    {mode === "login" && (
                      <Link
                        to={`/vote/${slug}/forgot-password?next=${encodeURIComponent(next)}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <PasswordInput
                    id="voter-password"
                    placeholder="Enter your password"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={touch("password")}
                    aria-invalid={shown("password") ? true : undefined}
                    aria-describedby={shown("password") ? "voter-password-error" : undefined}
                  />
                  {shown("password") ? (
                    <p id="voter-password-error" role="alert" className="text-sm text-destructive">
                      {shown("password")}
                    </p>
                  ) : (
                    mode === "register" && <p className="text-xs text-muted-foreground">At least 10 characters, with a letter and a number.</p>
                  )}
                </div>
                <Button type="submit" loading={busy} className="w-full">
                  {mode === "register" ? "Create account" : "Sign in"}
                </Button>
              </form>
              {poll.googleClientId && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex w-full items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    {mode === "register" ? "or sign up with" : "or sign in with"}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <GoogleButton
                    iconOnly
                    clientId={poll.googleClientId}
                    mode={mode === "register" ? "signup" : "signin"}
                    onCredential={(credential) => void attempt(() => googleVoter({ pollSlug: slug, credential }))}
                  />
                </div>
              )}
              <p className="text-center text-sm text-muted-foreground">
                {mode === "register" ? "Already have a voter account? " : "New here? "}
                <Link
                  to={`/vote/${slug}/${mode === "register" ? "login" : "register"}?next=${encodeURIComponent(next)}`}
                  className="font-medium text-primary hover:underline"
                >
                  {mode === "register" ? "Sign in" : "Create a voter account"}
                </Link>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                A voter account works for every poll here and is only used for voting.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </VoteShell>
  );
}

export function VoterLoginPage() {
  return <VoterAuthPage mode="login" />;
}

export function VoterRegisterPage() {
  return <VoterAuthPage mode="register" />;
}
