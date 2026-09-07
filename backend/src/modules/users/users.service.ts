import { User, type UserDocument } from "../auth/auth.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { escapeRegexLiteral } from "../common/money.js";
import type { PublicUserProfile, UpdateProfileInput, UserSearchResult } from "./users.types.js";

const toPublicProfile = (user: UserDocument): PublicUserProfile => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  createdAt: user.createdAt.toISOString(),
});

/**
 * Search registered users by email or name. Results exclude the requesting
 * user so they do not invite/see themselves in suggestions.
 */
export async function searchUsers(query: string, excludeUserId: string): Promise<UserSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const literal = escapeRegexLiteral(trimmed);
  const regex = new RegExp(literal, "i");

  const users = await User.find({
    _id: { $ne: excludeUserId },
    $or: [{ email: regex }, { name: regex }],
  })
    .select("name email")
    .limit(20)
    .lean();

  return users.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
  }));
}

export async function getProfileById(userId: string): Promise<PublicUserProfile> {
  const user = await User.findById(userId).select("name email createdAt");
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return toPublicProfile(user as UserDocument);
}

export async function updateProfile(input: UpdateProfileInput): Promise<PublicUserProfile> {
  const user = (await User.findByIdAndUpdate(
    input.userId,
    { name: input.name },
    { new: true, runValidators: true },
  ).select("name email createdAt")) as UserDocument | null;

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return toPublicProfile(user);
}
