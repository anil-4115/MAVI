import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "../../lib/types";
import { getErrorMessage } from "../../services/api";
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
      await registerRequest(payload);
      // Backend register returns the user without a token. Sign the user in
      // with the same credentials so the registered account starts with a
      // persisted session. The password is only sent to the backend (never
      // logged or stored in the frontend).
      const { token, user: loggedInUser } = await loginRequest({
        email: payload.email,
        password: payload.password,
      });
      setToken(token);
      setUser(loggedInUser);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}