import * as React from "react";
import { toast } from "sonner";

// Installing NTSOne as an app. Android and desktop Chrome/Edge let the page offer an install button of its own (the
// browser sends a "beforeinstallprompt" event that must be caught early and kept). iPhone and iPad have no such button:
// the person has to use Share, then Add to Home Screen, so there we show the steps instead.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface InstallState {
  /** The browser can show its own install dialog now. */
  canPrompt: boolean;
  /** An iPhone or iPad where the app has to be added by hand (Share, then Add to Home Screen). */
  iosManual: boolean;
  /** Already running as an installed app. */
  installed: boolean;
}

/** True for iPhone, iPad and iPod, including iPads that call themselves Macs. */
export function isIosDevice(userAgent: string, platform: string, touchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return platform === "MacIntel" && touchPoints > 1;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, iosManual: false, installed: false };
const listeners = new Set<() => void>();

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function runningAsApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || window.matchMedia?.("(display-mode: window-controls-overlay)").matches === true || nav.standalone === true;
}

/** Called once, before the app draws, so the browser's install offer is never missed. */
export function initInstall() {
  if (typeof window === "undefined") return;
  const installed = runningAsApp();
  const ios = isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0);
  set({ installed, iosManual: ios && !installed });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ canPrompt: false, installed: true, iosManual: false });
  });
}

/** Shows the browser's install dialog. Returns true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  set({ canPrompt: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}

export function useInstall(): InstallState {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

/** True while the device has no connection. */
export function useOnline(): boolean {
  return React.useSyncExternalStore(
    (listener) => {
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

// ---- remembering "not now"

const DISMISS_KEY = "ntsone-install-dismissed";
const DISMISS_DAYS = 14;

export function installPromptDismissed(now = Date.now()): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
    return now - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function dismissInstallPrompt() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage blocked: the offer may show again, which is harmless */
  }
}

// ---- the service worker

const RELOAD_FLAG = "ntsone-sw-reloaded";

/**
 * Registers the service worker (only in the real site, never while developing). When a new version of the worker is
 * ready, the person is asked to update; nothing is swapped under them while they work.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  let refreshing = false;
  // On a first visit the worker takes control for the first time: that is not an update and must not reload the page.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // A newer worker took over after the person tapped Update: load the page once with it (never in a loop).
    if (!hadController || refreshing || window.sessionStorage.getItem(RELOAD_FLAG)) return;
    refreshing = true;
    try {
      window.sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      /* ignore */
    }
    window.location.reload();
  });

  window.addEventListener("load", () => {
    try {
      window.sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        const announce = () => {
          const waiting = registration.waiting;
          if (!waiting || !navigator.serviceWorker.controller) return;
          toast("A new version of NTSOne is ready", {
            id: "sw-update",
            duration: Infinity,
            action: { label: "Update", onClick: () => waiting.postMessage({ type: "SKIP_WAITING" }) },
          });
        };
        if (registration.waiting) announce();
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          incoming?.addEventListener("statechange", () => {
            if (incoming.state === "installed") announce();
          });
        });
        // Look for a newer version now and then, and whenever the app comes back to the front.
        const check = () => void registration.update().catch(() => undefined);
        window.setInterval(check, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
      })
      .catch(() => undefined); // The app works without it; it just cannot be used offline.
  });
}
