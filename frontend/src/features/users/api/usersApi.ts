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

interface UsersResponse extends ApiEnvelope<{ users: UserSearchResult[] }> {
  success: true;
}

export const searchUsers = async (query: string): Promise<UserSearchResult[]> => {
  const response = await api.get<UsersResponse>("/users/search", {
    params: { q: query },
  });
  return response.data.data.users;
};