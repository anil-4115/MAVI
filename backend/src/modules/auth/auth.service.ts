import bcrypt from "bcryptjs";
import type { PublicUser, AuthResult } from "./auth.types.js";
import { User, type IUser } from "./auth.model.js";
import { signToken } from "../../utils/jwt.js";
import { ApiError } from "../../utils/ApiError.js";
import type { RegistrationInput, LoginInput } from "./auth.validation.js";

const BCRYPT_ROUNDS = 10;

interface UserSource extends IUser {
  _id: { toString(): string };
  createdAt: Date;
}

const toPublicUser = (user: UserSource): PublicUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  createdAt: user.createdAt.toISOString(),
});

export const register = async (input: RegistrationInput): Promise<PublicUser> => {
  const email = input.email.toLowerCase();

  const existing = await User.exists({ email });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = (await User.create({ name: input.name, email, passwordHash })) as unknown as UserSource;

  return toPublicUser(user);
};

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const email = input.email.toLowerCase();

  const user = (await User.findOne({ email }).select("+passwordHash")) as unknown as
    | (UserSource & { comparePassword(candidate: string): Promise<boolean> })
    | null;
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const passwordValid = await user.comparePassword(input.password);
  if (!passwordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = signToken({ sub: user._id.toString(), email: user.email });

  return { token, user: toPublicUser(user) };
};

export const getProfileById = async (userId: string): Promise<PublicUser> => {
  const user = (await User.findById(userId).select("name email createdAt")) as unknown as UserSource | null;
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return toPublicUser(user);
};