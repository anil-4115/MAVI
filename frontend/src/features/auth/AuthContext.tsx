import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "../../lib/types";
import { getErrorMessage, onUnauthorized } from "../../services/api";
import { clearToken, getToken, setToken } from "../../services/token";
import { AuthContext, type AuthContextValue } from "./auth-context";
import {
  getCurrentUser,
  login as loginRequest,
  register as registerRequest,
  type LoginPayload,
  type RegisterPayload,
} from "./api/authApi";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        clearToken();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  // A 401 from any API call means the stored token is no longer valid. Clear
  // the in-memory session so ProtectedRoute redirects to /login.
  useEffect(() => {
    return onUnauthorized(() => {
      clearToken();
      setUser(null);
    });
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    try {
      const { token, user: loggedInUser } = await loginRequest(payload);
      setToken(token);
      setUser(loggedInUser);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    try {
      const { message } = await registerRequest(payload);
      // No auto-login: email verification comes first. Show the signup result.
      return message;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const updateUser = useCallback((next: AuthUser) => {
    setUser(next);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      updateUser,
    }),
    [user, isLoading, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}