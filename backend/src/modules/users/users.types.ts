export interface PublicUserProfile {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

export interface UpdateProfileInput {
  userId: string;
  name: string;
}
