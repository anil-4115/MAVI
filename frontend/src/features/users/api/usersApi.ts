import type { ApiEnvelope } from "../../../lib/types";
import api from "../../../services/api";

/**
 * User search contract mirrors backend users.service.ts `searchUsers`
 * (GET /users/search?q=). Used by group-invite flows to find registered users
 * by name or email. The backend excludes the requesting user from results.
 */

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

/**
 * Public profile shape mirrors backend PublicUserProfile (users.types.ts).
 * Matches AuthUser (lib/types.ts) field for field, so a profile response can
 * be handed straight to AuthContext.updateUser after a name change.
 */
export interface PublicUserProfile {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface UsersResponse extends ApiEnvelope<{ users: UserSearchResult[] }> {
  success: true;
}

export const searchUsers = async (query: string): Promise<UserSearchResult[]> => {
  const response = await api.get<UsersResponse>("/users/search", {
    params: { q: query },
  });
  return response.data.data.users;
};

interface ProfileResponse extends ApiEnvelope<{ user: PublicUserProfile }> {
  success: true;
}

/** Updates the authenticated user's own profile (name only) via PATCH /users/me. */
export const updateMyProfile = async (payload: { name: string }): Promise<PublicUserProfile> => {
  const response = await api.patch<ProfileResponse>("/users/me", payload);
  return response.data.data.user;
};