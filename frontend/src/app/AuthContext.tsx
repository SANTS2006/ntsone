import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { withSignOutOverlay } from "@/components/SignOutOverlay";
import { apiFetch, refreshSession, setAccessToken, setSessionLostHandler } from "@/lib/api";
import type { AuthUser } from "@/types/api";

export interface RegisterInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  /** Agreement to the Terms of Service and Privacy Policy; the server refuses sign-ups without it. */
  acceptTerms: true;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  /** True when the first check of the session could not reach the server (not the same as being signed out). */
  authError: boolean;
  /** Checks the session again after authError. */
  retryAuth: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** "Continue with Google": signs in, or registers a new account. `created` is true for a new account. */
  googleSignIn: (credential: string) => Promise<{ created: boolean }>;
  /** Accepts an invitation with the private token from the email: the person chooses a password and is signed in. */
  acceptInvitation: (token: string, newPassword: string) => Promise<void>;
  /** Signs out; protected pages then send the visitor to `redirectTo` (the website by default). */
  logout: (options?: { redirectTo?: string }) => Promise<void>;
  /** Where a protected page should go after a deliberate sign-out, instead of the sign-in page. */
  logoutRedirect: string | null;
  updateLocalUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState(false);
  const [logoutRedirect, setLogoutRedirect] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const checkSession = React.useCallback(async () => {
    setAuthError(false);
    setIsLoading(true);
    // Shared with the API client, so the app starting and a request failing never use the refresh cookie twice at once.
    const result = await refreshSession();
    if (result.kind === "ok") setUser(result.user);
    else if (result.kind === "error") setAuthError(true);
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // A request found the session over and could not renew it: show the sign-in page instead of broken pages.
  React.useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    return () => setSessionLostHandler(null);
  }, [queryClient]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{ accessToken: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: { email, password },
        skipAuthRetry: true,
      });
      // Every cached query (program lists, registrations, stats...) is scoped by an
      // identical key regardless of who's logged in, so a stale cache from a
      // previously logged-in account must never leak into this session.
      queryClient.clear();
      setAccessToken(data.accessToken);
      setLogoutRedirect(null);
      setUser(data.user);
    },
    [queryClient],
  );

  const register = React.useCallback(
    async (input: RegisterInput) => {
      const data = await apiFetch<{ accessToken: string; user: AuthUser }>("/auth/register", {
        method: "POST",
        body: input,
        skipAuthRetry: true,
      });
      queryClient.clear();
      setAccessToken(data.accessToken);
      setLogoutRedirect(null);
      setUser(data.user);
    },
    [queryClient],
  );

  const googleSignIn = React.useCallback(
    async (credential: string) => {
      const data = await apiFetch<{ accessToken: string; user: AuthUser; created: boolean }>("/auth/google", {
        method: "POST",
        body: { credential },
        skipAuthRetry: true,
      });
      queryClient.clear();
      setAccessToken(data.accessToken);
      setLogoutRedirect(null);
      setUser(data.user);
      return { created: data.created };
    },
    [queryClient],
  );

  const acceptInvitation = React.useCallback(
    async (token: string, newPassword: string) => {
      const data = await apiFetch<{ accessToken: string; user: AuthUser }>("/auth/accept-invitation", {
        method: "POST",
        body: { token, newPassword },
        skipAuthRetry: true,
      });
      queryClient.clear();
      setAccessToken(data.accessToken);
      setLogoutRedirect(null);
      setUser(data.user);
    },
    [queryClient],
  );

  const logout = React.useCallback(
    async ({ redirectTo = "/" }: { redirectTo?: string } = {}) => {
      // The screen says what is happening, and the person is only taken away once the session is really closed.
      await withSignOutOverlay(async () => {
        try {
          await apiFetch("/auth/logout", { method: "POST" });
        } finally {
          setAccessToken(null);
          setLogoutRedirect(redirectTo);
          setUser(null);
          queryClient.clear();
        }
      });
    },
    [queryClient],
  );

  const updateLocalUser = React.useCallback((patch: Partial<AuthUser>) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, authError, retryAuth: () => void checkSession(), login, register, googleSignIn, acceptInvitation, logout, logoutRedirect, updateLocalUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
