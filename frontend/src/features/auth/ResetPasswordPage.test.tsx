import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { passwordProblem } from "@/lib/passwordRules";

const resetPassword = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ resetPassword }));

import { ThemeProvider } from "@/app/ThemeContext";
import { ResetPasswordPage } from "./ResetPasswordPage";

const open = (url = "/reset-password?token=abc123") =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[url]}>
        <ResetPasswordPage />
      </MemoryRouter>
    </ThemeProvider>,
  );

const fill = (password: string, confirm = password) => {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
};

describe("the reset password form", () => {
  afterEach(() => {
    cleanup();
    resetPassword.mockReset();
  });

  it("sends a good password and shows the success screen instead of crashing", async () => {
    resetPassword.mockResolvedValue(undefined);
    open();
    fill("Sunrise2026x");
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));
    // Moving to the success screen used to crash the page (a different number of hooks between two draws).
    await waitFor(() => expect(screen.getByText("Password reset")).toBeTruthy());
    expect(resetPassword).toHaveBeenCalledWith("abc123", "Sunrise2026x");
  });

  it("shows the expired-link screen (without crashing) when the server says the link is no longer valid", async () => {
    // The rejection is made when the form asks, not in advance, so nothing is left unhandled.
    resetPassword.mockImplementation(() => Promise.reject(new ApiError("VALIDATION_ERROR", "This reset link is invalid or has expired", 400)));
    open();
    fill("Sunrise2026x");
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));
    expect(await screen.findByText("Link expired")).toBeTruthy();
  });

  it("opens straight on the expired-link screen when there is no token", () => {
    open("/reset-password");
    expect(screen.getByText("Link expired")).toBeTruthy();
  });

  it("explains a too-short password before sending anything, using the same 10-character rule as the server", () => {
    open();
    fill("Short1");
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));
    expect(screen.getByRole("alert").textContent).toBe("Use at least 10 characters");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("needs the two passwords to match", () => {
    open();
    fill("Sunrise2026x", "Sunrise2026y");
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));
    expect(screen.getByText("Passwords don't match")).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });
});

describe("the password rules the forms share with the server", () => {
  it("accepts a good password and names the first thing wrong with a bad one", () => {
    expect(passwordProblem("Sunrise2026x")).toBe("");
    expect(passwordProblem("")).toBe("Please enter a new password");
    expect(passwordProblem("Short1")).toBe("Use at least 10 characters");
    expect(passwordProblem("onlyletterslong")).toBe("Include at least one letter".replace("letter", "number"));
    expect(passwordProblem("12345678901")).toBe("Include at least one letter");
    expect(passwordProblem("Password123")).toBe("That password is too common. Choose another");
    expect(passwordProblem("a".repeat(129))).toBe("Use at most 128 characters");
  });
});
