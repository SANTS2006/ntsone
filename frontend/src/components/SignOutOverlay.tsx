import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { LogoSpinner } from "@/components/Loading";

type Phase = "working" | "done";
let current: Phase | null = null;
const listeners = new Set<() => void>();
const setPhase = (phase: Phase | null) => {
  current = phase;
  listeners.forEach((l) => l());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Shows the "signing you out" screen over the whole app while `task` runs, then a short "you've been signed out"
 * message, then closes. It stays up at least a moment so people can see that something happened, and it survives the
 * page change that sign-out causes because it lives outside any page.
 */
export async function withSignOutOverlay(task: () => Promise<void>): Promise<void> {
  const started = Date.now();
  setPhase("working");
  try {
    await task();
  } finally {
    await sleep(Math.max(0, 900 - (Date.now() - started)));
    setPhase("done");
    await sleep(900);
    setPhase(null);
  }
}

/** Mounted once at the top of the app. */
export function SignOutOverlayHost() {
  const phase = React.useSyncExternalStore(subscribe, () => current, () => null);
  if (!phase) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-live="assertive" aria-label={phase === "working" ? "Signing you out" : "Signed out"} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl border border-border/70 bg-card px-6 py-8 text-center shadow-2xl">
        {phase === "working" ? (
          <>
            <LogoSpinner size="lg" />
            <div>
              <p className="text-lg font-semibold">Signing you out</p>
              <p className="text-sm text-muted-foreground">Closing your session safely...</p>
            </div>
          </>
        ) : (
          <>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold">You&apos;ve been signed out</p>
              <p className="text-sm text-muted-foreground">See you again soon.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
