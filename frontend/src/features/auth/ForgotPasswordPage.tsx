import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { requestPasswordReset } from "./api";
import { AuthCardShell } from "./AuthCardShell";
import { usePageMeta } from "@/lib/seo";

export function ForgotPasswordPage() {
  usePageMeta({ title: "Forgot password" });
  const [email, setEmail] = React.useState("");
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [touched, setTouched] = React.useState(false);
  const address = email.trim();
  const problem = !address ? "Please enter your email address" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? "Enter a valid email address, like name@example.com" : "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) {
      setTouched(true);
      document.getElementById("email")?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(address);
      setSentTo(address);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the reset link, please try again");
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <AuthCardShell icon={MailCheck} title="Check your inbox" subtitle="Follow the link in the email to choose a new password.">
        <p className="text-sm text-muted-foreground">
          If an account exists for <span className="font-semibold text-foreground">{sentTo}</span>, we&apos;ve sent it a
          password reset link. The link expires in 10 minutes. Didn&apos;t get it? Check your spam folder.
        </p>
        <Button variant="outline" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
        <Link to="/login" className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:opacity-80">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell icon={KeyRound} title="Forgot your password?" subtitle="Enter your email and we'll send you a link to reset it.">
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="Enter your email"
            className="h-12 rounded-full px-5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && problem ? true : undefined}
            aria-describedby={touched && problem ? "email-error" : undefined}
          />
          {touched && problem && (
            <p id="email-error" role="alert" className="px-2 text-sm text-destructive">
              {problem}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="h-12 rounded-full" loading={submitting}>
          {submitting ? "Sending..." : "Send reset link"}
        </Button>
      </form>
      <Link to="/login" className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>
    </AuthCardShell>
  );
}
