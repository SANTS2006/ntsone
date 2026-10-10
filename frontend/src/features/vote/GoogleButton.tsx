import * as React from "react";

interface GoogleId {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: "popup" }) => void;
  renderButton: (
    element: HTMLElement,
    options: { theme?: string; size?: string; text?: string; shape?: string; width?: number; logo_alignment?: string },
  ) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Google sign-in couldn't load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Google's own "Sign in with Google" button; hands back the signed ID token Google issues. */
export function GoogleButton({
  clientId,
  mode,
  onCredential,
}: {
  clientId: string;
  mode: "signin" | "signup";
  onCredential: (credential: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const callback = React.useRef(onCredential);
  callback.current = onCredential;
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => callback.current(r.credential), ux_mode: "popup" });
        window.google.accounts.id.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: mode === "signup" ? "signup_with" : "continue_with",
          width: Math.min(360, ref.current.offsetWidth || 320),
          logo_alignment: "center",
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, mode]);

  if (failed) return <p className="text-center text-xs text-muted-foreground">Google sign-in isn&apos;t available right now.</p>;
  return <div ref={ref} className="flex min-h-[44px] w-full justify-center" />;
}
