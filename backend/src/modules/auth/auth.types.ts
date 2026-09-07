export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}