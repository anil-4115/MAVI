import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

/**
 * Guard for authenticated routes. Unauthenticated users are redirected to
 * /login, remembering the page they were trying to reach.
 */
export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div>Loading…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

/**
 * Guard for guest-only routes (login/register). Authenticated users are sent
 * to /dashboard instead of seeing auth pages.
 */
export function GuestRoute({ children }: { children: ReactElement }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading…</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}