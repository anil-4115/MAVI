import type { ApiEnvelope, AuthUser, LoginResponse } from "../../../lib/types";
import api from "../../../services/api";

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

interface AuthResponse<T> extends ApiEnvelope<T> {
  success: true;
}

export interface RegisterResponse {
  user: AuthUser;
  /** Backend message reflecting whether the verification email was sent. */
  message: string;
}

export const register = async (payload: RegisterPayload): Promise<RegisterResponse> => {
  const response = await api.post<AuthResponse<{ user: AuthUser }>>("/auth/register", payload);
  return { user: response.data.data.user, message: response.data.message };
};

export const login = async (payload: LoginPayload): Promise<LoginResponse> => {
  const response = await api.post<AuthResponse<LoginResponse>>("/auth/login", payload);
  return response.data.data;
};

export const getCurrentUser = async (): Promise<AuthUser> => {
  const response = await api.get<AuthResponse<{ user: AuthUser }>>("/auth/me");
  return response.data.data.user;
};

export interface VerifyEmailResponse {
  emailVerified: boolean;
  message: string;
}

export const verifyEmail = async (token: string): Promise<VerifyEmailResponse> => {
  const response = await api.get<AuthResponse<{ emailVerified: boolean }>>("/auth/verify-email", {
    params: { token },
  });
  return { emailVerified: response.data.data.emailVerified, message: response.data.message };
};

/** Returns the backend's generic message; identical for known and unknown emails. */
export const forgotPassword = async (
  payload: ForgotPasswordPayload,
): Promise<string> => {
  const response = await api.post<AuthResponse<{ ok: true }>>("/auth/forgot-password", payload);
  return response.data.message;
};

export const resetPassword = async (
  payload: ResetPasswordPayload,
): Promise<string> => {
  const response = await api.post<AuthResponse<{ ok: true }>>("/auth/reset-password", payload);
  return response.data.message;
};
