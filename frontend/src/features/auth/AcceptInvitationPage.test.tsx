import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const acceptInvitation = vi.hoisted(() => vi.fn());
vi.mock("@/app/AuthContext", () => ({ useAuth: () => ({ acceptInvitation }) }));

import { ThemeProvider } from "@/app/ThemeContext";
import { AcceptInvitationPage } from "./AcceptInvitationPage";

const open = (url = "/accept-invitation?email=fat%40example.test") =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[url]}>
        <AcceptInvitationPage />
      </MemoryRouter>
    </ThemeProvider>,
  );

const fill = (temporary: string, password: string, confirm = password) => {
  fireEvent.change(screen.getByLabelText("Temporary password"), { target: { value: temporary } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: /save password/i }));
};

describe("the accept invitation page", () => {
  afterEach(() => {
    cleanup();
    acceptInvitation.mockReset();
  });

  it("fills in the email from the link and sends the temporary and the new password", async () => {
    acceptInvitation.mockResolvedValue(undefined);
    open();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("fat@example.test");
    fill("BFF@2026", "MyOwnSecret2026");
    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("fat@example.test", "BFF@2026", "MyOwnSecret2026"));
  });

  it("explains a weak or unchanged password without calling the server", () => {
    open();
    fill("BFF@2026", "short1");
    expect(screen.getByRole("alert").textContent).toBe("Use at least 10 characters");
    fill("LongTemp2026x", "LongTemp2026x");
    expect(screen.getByRole("alert").textContent).toMatch(/different from the temporary/);
    fill("BFF@2026", "MyOwnSecret2026", "MyOwnSecret2027");
    expect(screen.getByRole("alert").textContent).toBe("Passwords don't match");
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the invitation cannot be accepted", async () => {
    acceptInvitation.mockImplementation(() => Promise.reject(new ApiError("VALIDATION_ERROR", "This invitation has expired.", 400)));
    open();
    fill("BFF@2026", "MyOwnSecret2026");
    expect((await screen.findByRole("alert")).textContent).toBe("This invitation has expired.");
  });
});
