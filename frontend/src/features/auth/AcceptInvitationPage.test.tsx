import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const acceptInvitation = vi.hoisted(() => vi.fn());
vi.mock("@/app/AuthContext", () => ({ useAuth: () => ({ acceptInvitation }) }));

import { ThemeProvider } from "@/app/ThemeContext";
import { AcceptInvitationPage } from "./AcceptInvitationPage";

const open = (url = "/accept-invitation?token=abcdefghij1234567890") =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[url]}>
        <AcceptInvitationPage />
      </MemoryRouter>
    </ThemeProvider>,
  );

const fill = (password: string, confirm = password) => {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: /save password/i }));
};

describe("the accept invitation page", () => {
  afterEach(() => {
    cleanup();
    acceptInvitation.mockReset();
  });

  it("asks only for the new password and sends it with the private token from the link", async () => {
    acceptInvitation.mockResolvedValue(undefined);
    open();
    expect(screen.queryByLabelText("Temporary password")).toBeNull();
    fill("MyOwnSecret2026");
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("abcdefghij1234567890", "MyOwnSecret2026"));
  });

  it("explains a weak or mismatched password without calling the server", () => {
    open();
    fill("short1");
    expect(screen.getByRole("alert").textContent).toBe("Use at least 10 characters");
    fill("MyOwnSecret2026", "MyOwnSecret2027");
    expect(screen.getByRole("alert").textContent).toBe("Passwords don't match");
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("says so when the link has no token", () => {
    open("/accept-invitation");
    fill("MyOwnSecret2026");
    expect(screen.getByRole("alert").textContent).toMatch(/not complete/);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the invitation cannot be accepted", async () => {
    acceptInvitation.mockImplementation(() => Promise.reject(new ApiError("VALIDATION_ERROR", "This invitation link is invalid or has expired.", 400)));
    open();
    fill("MyOwnSecret2026");
    expect((await screen.findByRole("alert")).textContent).toBe("This invitation link is invalid or has expired.");
  });
});
