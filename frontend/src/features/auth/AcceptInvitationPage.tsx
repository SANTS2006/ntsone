import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { LockKeyhole, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/app/AuthContext";
import { usePageMeta } from "@/lib/seo";
import { PASSWORD_HINT, passwordProblem } from "@/lib/passwordRules";
import { AuthCardShell } from "./AuthCardShell";

/** The new password and its confirmation, with the checks that do not need the server. Returns the first problem, or "". */
function formProblem(next: string, confirm: string) {
  const problem = passwordProblem(next);
  if (problem) return problem;
  if (next !== confirm) return "Passwords don't match";
  return "";
}

/** The page the "Accept invitation" button in the email opens: a private link in, a password of their own out, signed in. */
export function AcceptInvitationPage() {
  usePageMeta({ title: "Accept invitation" });
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { acceptInvitation } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = !token ? "This invitation link is not complete. Open it again from your email." : formProblem(password, confirm);
    if (problem) return setError(problem);
    setError("");
    setSubmitting(true);
    try {
      await acceptInvitation(token, password);
      toast.success("Welcome aboard! Your password is saved.");
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept the invitation, please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCardShell icon={MailCheck} title="Accept your invitation" subtitle="Choose your own password to join the team.">
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-new">New password</Label>
          <PasswordInput id="invite-new" autoComplete="new-password" autoFocus className="h-12 rounded-full px-5 pr-12" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="px-2 text-xs text-muted-foreground">{PASSWORD_HINT}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-confirm">Confirm new password</Label>
          <PasswordInput id="invite-confirm" autoComplete="new-password" className="h-12 rounded-full px-5 pr-12" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="px-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-12 rounded-full" loading={submitting}>
          {submitting ? "Saving..." : "Save password and continue"}
        </Button>
        <Link to="/login" className="text-center text-sm font-medium text-muted-foreground hover:text-primary">
          Back to sign in
        </Link>
      </form>
    </AuthCardShell>
  );
}

/** Shown instead of the app to someone who signed in with a temporary password: they must choose their own first. */
export function ChooseOwnPasswordScreen() {
  const { user, login, logout } = useAuth();
  const [temporary, setTemporary] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  usePageMeta({ title: "Choose your password" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = !temporary ? "Enter your current password" : password === temporary ? "Choose a password that is different from the current one" : formProblem(password, confirm);
    if (problem) return setError(problem);
    setError("");
    setSubmitting(true);
    try {
      const { changePassword } = await import("@/features/settings/api");
      await changePassword({ currentPassword: temporary, newPassword: password });
      // Changing the password ends every session, so sign in again with the new one.
      await login(user!.email, password);
      toast.success("Your password is saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your password, please try again");
      setSubmitting(false);
    }
  };

  return (
    <AuthCardShell icon={LockKeyhole} title="Choose your own password" subtitle="You signed in with a temporary password. Replace it to continue.">
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="own-temporary">Temporary password</Label>
          <PasswordInput id="own-temporary" autoComplete="current-password" autoFocus className="h-12 rounded-full px-5 pr-12" value={temporary} onChange={(e) => setTemporary(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="own-new">New password</Label>
          <PasswordInput id="own-new" autoComplete="new-password" className="h-12 rounded-full px-5 pr-12" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="px-2 text-xs text-muted-foreground">{PASSWORD_HINT}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="own-confirm">Confirm new password</Label>
          <PasswordInput id="own-confirm" autoComplete="new-password" className="h-12 rounded-full px-5 pr-12" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="px-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-12 rounded-full" loading={submitting}>
          {submitting ? "Saving..." : "Save password and continue"}
        </Button>
        <button type="button" onClick={() => void logout({ redirectTo: "/login" })} className="text-center text-sm font-medium text-muted-foreground hover:text-primary">
          Sign out
        </button>
      </form>
    </AuthCardShell>
  );
}
