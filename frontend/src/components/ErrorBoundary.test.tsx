import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const report = vi.hoisted(() => vi.fn());
vi.mock("@/lib/clientErrors", () => ({ reportClientError: report }));

import { ErrorBoundary } from "./ErrorBoundary";

let shouldThrow: Error | null = null;
function Page() {
  if (shouldThrow) throw shouldThrow;
  return <p>The page</p>;
}

describe("the error screen", () => {
  const reload = vi.fn();
  beforeEach(() => {
    shouldThrow = null;
    report.mockClear();
    reload.mockClear();
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload, assign: vi.fn() } });
  });
  afterEach(cleanup);

  it("shows the page when nothing is wrong", () => {
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    );
    expect(screen.getByText("The page")).toBeTruthy();
  });

  it("shows a message and a Try again button instead of a blank screen, without the technical details", () => {
    shouldThrow = new TypeError("Cannot read properties of undefined (reading 'length')");
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong while loading this page");
    expect(screen.queryByText(/Cannot read properties/)).toBeNull();
    expect(report).toHaveBeenCalledWith("render", shouldThrow);
  });

  it("Try again shows the page once the problem is gone", () => {
    shouldThrow = new Error("boom");
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    );
    shouldThrow = null;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("The page")).toBeTruthy();
  });

  it("clears the error by itself when the person goes to another page", () => {
    shouldThrow = new Error("boom");
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Page />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    shouldThrow = null;
    rerender(
      <ErrorBoundary resetKey="/b">
        <Page />
      </ErrorBoundary>,
    );
    expect(screen.getByText("The page")).toBeTruthy();
  });

  it("recovers from a stale version with ONE reload, then explains instead of looping", () => {
    shouldThrow = new Error("Failed to fetch dynamically imported module: /assets/X.js");
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("A new version is available");
    cleanup();
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    );
    // The same failure straight after: no second automatic reload, but the button is there.
    expect(reload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
