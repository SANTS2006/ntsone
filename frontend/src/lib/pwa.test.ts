import { afterEach, describe, expect, it } from "vitest";
import { dismissInstallPrompt, installPromptDismissed, isIosDevice } from "./pwa";

describe("recognising an iPhone or iPad", () => {
  it("knows iPhones, iPads and iPods, and iPads that report themselves as Macs", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", "iPhone", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", "iPad", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", "MacIntel", 5)).toBe(true);
  });
  it("does not mistake Android phones or computers for iPhones", () => {
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14; SM-S911B) Chrome/124.0 Mobile Safari/537.36", "Linux armv81", 5)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", "MacIntel", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", "Win32", 0)).toBe(false);
  });
});

describe("remembering 'not now' on the install offer", () => {
  afterEach(() => window.localStorage.clear());

  it("stays away for two weeks, then asks again", () => {
    expect(installPromptDismissed()).toBe(false);
    dismissInstallPrompt();
    expect(installPromptDismissed()).toBe(true);
    expect(installPromptDismissed(Date.now() + 13 * 86_400_000)).toBe(true);
    expect(installPromptDismissed(Date.now() + 15 * 86_400_000)).toBe(false);
  });
});
