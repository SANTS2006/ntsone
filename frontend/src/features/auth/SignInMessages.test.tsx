import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const login = vi.hoisted(() => vi.fn());
const updateLocalUser = vi.hoisted(() => vi.fn());
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/app/AuthContext", () => ({
  useAuth: () => ({ user: null, isLoading: false, login, googleSignIn: vi.fn(), updateLocalUser, logout: vi.fn() }),
}));
vi.mock("@/lib/api", async (original) => ({ ...(await original<Record<string, unknown>>()), apiFetch }));

import { ThemeProvider } from "@/app/ThemeContext";
import { LoginPage } from "./LoginPage";
import { OrganizationSetupScreen } from "./OrganizationSetupScreen";

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  login.mockReset();
  apiFetch.mockReset();
  updateLocalUser.mockReset();
});

const signIn = (email: string, password: string) => {
  fireEvent.change(screen.getByPlaceholderText("Enter your email"), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /^sign in/i }));
};

describe("the sign-in form says exactly what is wrong", () => {
  it("puts 'no account with this email' under the email box", async () => {
    apiFetch.mockResolvedValue({ googleClientId: null });
    login.mockImplementation(() => Promise.reject(new ApiError("ACCOUNT_NOT_FOUND", "We couldn't find an account with this email address.", 401, { field: "email" })));
    wrap(<LoginPage />);
    signIn("nobody@example.com", "Sunrise2026x");
    const alert = await screen.findByText(/couldn't find an account with this email/);
    expect(alert.id).toBe("email-error");
  });

  it("puts 'wrong password' under the password box", async () => {
    apiFetch.mockResolvedValue({ googleClientId: null });
    login.mockImplementation(() => Promise.reject(new ApiError("WRONG_PASSWORD", "The password is incorrect.", 401, { field: "password" })));
    wrap(<LoginPage />);
    signIn("ada@example.com", "Wrong-Pass-1");
    const alert = await screen.findByText("The password is incorrect.");
    expect(alert.id).toBe("password-error");
  });

  it("asks for each missing piece in words", async () => {
    apiFetch.mockResolvedValue({ googleClientId: null });
    wrap(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /^sign in/i }));
    expect(await screen.findByText("Please enter your email address")).toBeTruthy();
    expect(await screen.findByText("Please enter your password")).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });
});

describe("naming the organization after signing up with Google", () => {
  it("asks for the name and the agreement, and says which is missing", async () => {
    wrap(<OrganizationSetupScreen />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText("Enter the name of your organization or company")).toBeTruthy();
    expect(screen.getByText(/Tick the box to agree/)).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("saves the name with the agreement and opens the system", async () => {
    apiFetch.mockResolvedValue({ id: "u1", organizationSetupPending: false });
    wrap(<OrganizationSetupScreen />);
    fireEvent.change(screen.getByLabelText("Organization or company name"), { target: { value: "Hopper Labs" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/auth/me/complete-setup", { method: "POST", body: { organizationName: "Hopper Labs", acceptTerms: true } }));
    await waitFor(() => expect(updateLocalUser).toHaveBeenCalledWith({ id: "u1", organizationSetupPending: false }));
  });
});
