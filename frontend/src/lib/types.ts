export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface ApiErrorPayload {
  success: false;
  message: string;
}

export type ApiEnvelope<T> = {
  success: true;
  message: string;
  data: T;
};
