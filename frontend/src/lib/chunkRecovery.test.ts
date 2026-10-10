import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importWithRetry, isChunkLoadError, reloadForNewVersion } from "./chunkRecovery";

describe("recognising a page piece that failed to download", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://x.test/assets/Page-abc.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Loading chunk 12 failed.",
    "Unable to preload CSS for /assets/x.css",
  ])("yes: %s", (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });
  it("yes for a ChunkLoadError by name, no for ordinary errors", () => {
    const e = new Error("x");
    e.name = "ChunkLoadError";
    expect(isChunkLoadError(e)).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("reloading once for a new version", () => {
  const reload = vi.fn();
  beforeEach(() => {
    window.sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
  });
  afterEach(() => vi.useRealTimers());

  it("reloads the first time and not again straight after (no reload loop)", () => {
    expect(reloadForNewVersion()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForNewVersion()).toBe(false);
    expect(reloadForNewVersion()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("may reload again after the cool-down", () => {
    vi.useFakeTimers();
    expect(reloadForNewVersion()).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(reloadForNewVersion()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when it cannot remember (storage blocked), to be safe", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(reloadForNewVersion()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("importing a page with one retry", () => {
  it("retries a failed download once and returns the page", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module")).mockResolvedValueOnce({ page: true });
    await expect(importWithRetry(load)).resolves.toEqual({ page: true });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not retry an ordinary error in the page's own code", async () => {
    const load = vi.fn().mockRejectedValue(new SyntaxError("bad code"));
    await expect(importWithRetry(load)).rejects.toThrow("bad code");
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("gives up after the second failure so the error screen can show", async () => {
    const load = vi.fn().mockRejectedValue(new Error("Loading chunk 3 failed"));
    await expect(importWithRetry(load)).rejects.toThrow("chunk 3");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
