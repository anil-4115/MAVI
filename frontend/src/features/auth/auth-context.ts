import { createContext, type Context } from "react";
import type { AuthUser } from "../../lib/types";
import type { LoginPayload, RegisterPayload } from "./api/authApi";

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
}

export const AuthContext: Context<AuthContextValue | undefined> = createContext<
  AuthContextValue | undefined
>(undefined);