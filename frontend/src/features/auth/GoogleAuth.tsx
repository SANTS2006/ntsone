import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/app/AuthContext";
import { GoogleButton } from "../vote/GoogleButton";

/** Whether Google sign-in is switched on for this platform, and its public client id. */
export function useGoogleClientId() {
  const { data } = useQuery({
    queryKey: ["auth-providers"],
    queryFn: () => apiFetch<{ googleClientId: string | null }>("/auth/providers", { skipAuthRetry: true }),
    staleTime: 10 * 60_000,
    retry: false,
  });
  return data?.googleClientId ?? null;
}

/** "Continue with Google" with an "or" line under it. Shows nothing when Google sign-in is not set up. */
export function GoogleAuth({ mode }: { mode: "signin" | "signup" }) {
  const clientId = useGoogleClientId();
  const { googleSignIn } = useAuth();
  const navigate = useNavigate();
  // Each attempt carries its own single-use value from the server; a new one is fetched after every try.
  const [nonce, setNonce] = React.useState<string | null>(null);
  const loadNonce = React.useCallback(() => {
    apiFetch<{ nonce: string }>("/auth/google/nonce", { skipAuthRetry: true })
      .then((r) => setNonce(r.nonce))
      .catch(() => setNonce(null));
  }, []);
  React.useEffect(() => {
    if (clientId) loadNonce();
  }, [clientId, loadNonce]);
  if (!clientId || !nonce) return null;

  const onCredential = async (credential: string) => {
    try {
      const { created } = await googleSignIn(credential);
      // A brand-new account first confirms its email with the emailed code, then names its organization.
      if (created) navigate("/verify-email", { state: { codeJustSent: true } });
      else navigate("/admin");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Google sign-in did not work. Please try again.");
      loadNonce();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <GoogleButton clientId={clientId} nonce={nonce} mode={mode} onCredential={(credential) => void onCredential(credential)} />
      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
