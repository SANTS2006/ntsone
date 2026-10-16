import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/app/AuthContext";
import { usePageMeta } from "@/lib/seo";
import type { AuthUser } from "@/types/api";
import { AuthCardShell } from "./AuthCardShell";

/** Shown to someone who signed up with Google: name the organization and agree to the terms, then the system opens. */
export function OrganizationSetupScreen() {
  usePageMeta({ title: "Set up your organization" });
  const { user, updateLocalUser, logout } = useAuth();
  const [name, setName] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; terms?: string; form?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const next: typeof errors = {};
    if (!trimmed) next.name = "Enter the name of your organization or company";
    else if (trimmed.length < 2) next.name = "The organization's name needs at least 2 characters";
    if (!agreed) next.terms = "Tick the box to agree to the Terms of Service and Privacy Policy";
    setErrors(next);
    if (next.name || next.terms) return;
    setSubmitting(true);
    try {
      const updated = await apiFetch<AuthUser>("/auth/me/complete-setup", { method: "POST", body: { organizationName: trimmed, acceptTerms: true } });
      updateLocalUser(updated);
      toast.success("Your organization is ready");
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "We could not save your organization. Please try again." });
      setSubmitting(false);
    }
  };

  return (
    <AuthCardShell icon={Building2} title="Set up your organization" subtitle={`Welcome${user ? `, ${user.name.split(" ")[0]}` : ""}! One last step before you start.`}>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-name">Organization or company name</Label>
          <Input
            id="org-name"
            autoFocus
            autoComplete="organization"
            placeholder="For example, NTS Digital Solutions"
            className="h-12 rounded-full px-5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
          />
          {errors.name && <p role="alert" className="px-2 text-sm text-destructive">{errors.name}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I agree to the{" "}
              <Link to="/terms" target="_blank" className="font-medium text-primary hover:opacity-80">Terms of Service</Link> and{" "}
              <Link to="/privacy" target="_blank" className="font-medium text-primary hover:opacity-80">Privacy Policy</Link>.
            </span>
          </label>
          {errors.terms && <p role="alert" className="px-2 text-sm text-destructive">{errors.terms}</p>}
        </div>
        {errors.form && <p role="alert" className="px-2 text-sm text-destructive">{errors.form}</p>}
        <Button type="submit" size="lg" className="h-12 rounded-full" loading={submitting}>
          {submitting ? "Saving..." : "Continue"}
        </Button>
        <button type="button" onClick={() => void logout({ redirectTo: "/login" })} className="text-center text-sm font-medium text-muted-foreground hover:text-primary">
          Sign out
        </button>
      </form>
    </AuthCardShell>
  );
}
