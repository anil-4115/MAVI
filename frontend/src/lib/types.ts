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

/**
 * Shared pagination envelope. Mirrors backend PaginatedResult
 * (src/modules/common/pagination.ts): `items`, not `rows`; newest-first.
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
