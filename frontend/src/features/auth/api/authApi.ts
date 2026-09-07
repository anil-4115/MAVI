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

interface AuthResponse<T> extends ApiEnvelope<T> {
  success: true;
}

export const register = async (payload: RegisterPayload): Promise<AuthUser> => {
  const response = await api.post<AuthResponse<{ user: AuthUser }>>("/auth/register", payload);
  return response.data.data.user;
};

export const login = async (payload: LoginPayload): Promise<LoginResponse> => {
  const response = await api.post<AuthResponse<LoginResponse>>("/auth/login", payload);
  return response.data.data;
};

export const getCurrentUser = async (): Promise<AuthUser> => {
  const response = await api.get<AuthResponse<{ user: AuthUser }>>("/auth/me");
  return response.data.data.user;
};
