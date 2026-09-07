import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";

/** Validate that `value` is a valid MongoDB ObjectId string and return it. */
export function requireObjectId(value: unknown, fieldName = "ID"): string {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
  return value;
}

/** Assert a boolean condition; throws ApiError with the given status on failure. */
export function requireCondition(condition: boolean, statusCode: number, message: string): void {
  if (!condition) {
    throw new ApiError(statusCode, message);
  }
}

/**
 * Membership status returned by a group membership resolver.
 * The groups module will implement the actual resolver; common
 * provides the guard pattern via dependency injection.
 */
export interface MembershipInfo {
  isMember: boolean;
  role?: string;
  status?: string;
}

/**
 * Check group membership using a provided resolver function.
 * Throws 403 if the user is not an active member.
 */
export async function requireGroupMembership(
  groupId: string,
  userId: string,
  resolve: (groupId: string, userId: string) => Promise<MembershipInfo | null>,
): Promise<MembershipInfo> {
  const info = await resolve(groupId, userId);
  requireCondition(info !== null && info.isMember && info.status === "active", 403, "You are not a member of this group");
  return info!;
}
