import { FullScreenLoading } from "@/components/Loading";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { UserRole } from "@/types/api";

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, isLoading, authError, retryAuth, logoutRedirect } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoading />;

  // The server could not be reached to check the session. Sending the person to the sign-in page would be wrong (they may be signed in).
  if (authError && !user) {
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-semibold">We could not check your session</h1>
        <p className="max-w-sm text-sm text-muted-foreground">The server did not answer. This is usually a short interruption. Please try again.</p>
        <button type="button" onClick={retryAuth} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Try again</button>
      </div>
    );
  }

  if (!user) {
    // After signing out on purpose, go where the sign-out asked (the website);
    // otherwise (an expired session, a bookmarked link) ask the visitor to sign in.
    if (logoutRedirect) return <Navigate to={logoutRedirect} replace />;
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
