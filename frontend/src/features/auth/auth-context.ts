import { createContext, type Context } from "react";
import type { AuthUser } from "../../lib/types";
import type { LoginPayload, RegisterPayload } from "./api/authApi";

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  /** Creates the account and returns the backend registration message. The
   *  account is NOT auto-authenticated — it must be email-verified first. */
  register: (payload: RegisterPayload) => Promise<string>;
  logout: () => void;
}

export const AuthContext: Context<AuthContextValue | undefined> = createContext<
  AuthContextValue | undefined
>(undefined);