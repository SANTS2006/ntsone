import * as React from "react";
import { Download, Plus, Share, SquarePlus, WifiOff, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dismissInstallPrompt, installPromptDismissed, promptInstall, useInstall, useOnline } from "@/lib/pwa";
import { PRODUCT_NAME } from "@/lib/contact";
import { cn } from "@/lib/utils";

/** The three steps for adding the app on an iPhone or iPad, where the browser has no install button. */
export function IosInstallSteps({ className }: { className?: string }) {
  const steps = [
    { icon: Share, text: "Tap the Share button in Safari (the square with an arrow, at the bottom or top of the screen)." },
    { icon: SquarePlus, text: 'Scroll down and tap "Add to Home Screen".' },
    { icon: Plus, text: `Tap "Add". ${PRODUCT_NAME} then opens from your home screen like any other app.` },
  ];
  return (
    <div className={className}>
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step.text} className="flex items-start gap-3 text-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand-soft text-primary" aria-hidden="true">
              <step.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 pt-1">
              <span className="font-semibold text-primary">{index + 1}. </span>
              {step.text}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">If you opened this page inside another app such as WhatsApp or Facebook, open it in Safari first.</p>
    </div>
  );
}

export function IosInstallDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add {PRODUCT_NAME} to your home screen</DialogTitle>
          <DialogDescription>It opens full screen and loads faster, like an app.</DialogDescription>
        </DialogHeader>
        <IosInstallSteps />
        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Install app": shows the browser's install dialog, or the steps on an iPhone. Shows nothing if the app cannot be installed here or already is. */
export function InstallAppButton({ className, variant = "outline", size = "sm" }: { className?: string; variant?: "outline" | "ghost" | "default"; size?: "sm" | "default" }) {
  const { canPrompt, iosManual, installed } = useInstall();
  const [steps, setSteps] = React.useState(false);
  if (installed || (!canPrompt && !iosManual)) return null;
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          if (canPrompt) void promptInstall();
          else setSteps(true);
        }}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Install app
      </Button>
      {steps && <IosInstallDialog onClose={() => setSteps(false)} />}
    </>
  );
}

/**
 * A small card that offers to install the app, a few seconds after someone arrives. It never shows to people who have
 * already installed it, and after "Not now" it stays away for two weeks.
 */
export function InstallPrompt() {
  const { canPrompt, iosManual, installed } = useInstall();
  const [ready, setReady] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(() => installPromptDismissed());
  const [showSteps, setShowSteps] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready || dismissed || installed || (!canPrompt && !iosManual)) return null;

  const notNow = () => {
    dismissInstallPrompt();
    setDismissed(true);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:justify-end sm:p-4">
      <section aria-label={`Install ${PRODUCT_NAME}`} className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border/70 bg-card/95 p-4 shadow-2xl shadow-primary/20 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-border/60">
            <BrandLogo className="h-8" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">Install {PRODUCT_NAME}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Add it to your home screen: it opens full screen, loads faster and stays handy.</p>
          </div>
          <button type="button" onClick={notNow} aria-label="Close" className="-mr-1 -mt-1 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {showSteps && iosManual && <IosInstallSteps className="mt-3 border-t border-border/70 pt-3" />}
        <div className="mt-3 flex gap-2">
          {canPrompt ? (
            <Button
              size="sm"
              className="flex-1"
              onClick={async () => {
                const accepted = await promptInstall();
                if (!accepted) notNow();
              }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Install
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps}>
              <Share className="h-4 w-4" aria-hidden="true" />
              {showSteps ? "Hide steps" : "Show me how"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={notNow}>
            Not now
          </Button>
        </div>
      </section>
    </div>
  );
}

/** A small notice at the top while the device has no connection. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <p className={cn("pointer-events-auto flex max-w-md items-center gap-2 rounded-full border border-amber-500/40 bg-card/95 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur-md")}>
        <WifiOff className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        You are offline. Saving and loading new information needs a connection.
      </p>
    </div>
  );
}
