import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { DEFAULT_CURRENCY } from "../common/money.js";
import { GroupMemberInput, type GroupRole } from "./group.types.js";

const getName = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 80) {
    throw new ApiError(400, "Group name must be between 1 and 80 characters");
  }
  return value.trim();
};

const getDescription = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "Description must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length > 300) {
    throw new ApiError(400, "Description must be at most 300 characters");
  }
  return trimmed === "" ? undefined : trimmed;
};

const getCurrency = (value: unknown): string => {
  const currency = value === undefined || value === null ? DEFAULT_CURRENCY : String(value).trim().toUpperCase();
  if (currency !== DEFAULT_CURRENCY) {
    throw new ApiError(400, `Only ${DEFAULT_CURRENCY} is supported at this time`);
  }
  return currency;
};

export interface CreateGroupInput {
  name: string;
  description?: string;
  currency: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
}

export interface AddMemberInput {
  userId: string;
}

export interface RoleInput {
  role: GroupRole;
}

export const validateCreateGroup = (body: unknown): CreateGroupInput => {
  const { name, description, currency } = (body ?? {}) as Record<string, unknown>;
  return {
    name: getName(name),
    description: getDescription(description),
    currency: getCurrency(currency),
  };
};

export const validateUpdateGroup = (body: unknown): UpdateGroupInput => {
  const { name, description, currency } = (body ?? {}) as Record<string, unknown>;

  if (currency !== undefined && currency !== null) {
    throw new ApiError(400, "Group currency cannot be changed after creation");
  }

  const hasName = name !== undefined && name !== null;
  const hasDescription = description !== undefined && description !== null;

  if (!hasName && !hasDescription) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  return {
    name: hasName ? getName(name) : undefined,
    description: hasDescription ? getDescription(description) : undefined,
  };
};

export const validateAddMember = (body: unknown): AddMemberInput => {
  const { userId } = (body ?? {}) as Record<string, unknown>;
  if (typeof userId !== "string" || !Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "A valid userId is required");
  }
  return { userId };
};

export const validateRole = (body: unknown): RoleInput => {
  const { role } = (body ?? {}) as Record<string, unknown>;
  if (role !== "admin" && role !== "member") {
    throw new ApiError(400, "Role must be either admin or member");
  }
  return { role };
};

/**
 * Resolve the GET /groups list `status` query filter. Missing/`active` returns
 * the active list (the default); `archived` returns archived groups, which are
 * otherwise excluded from every list/derived endpoint.
 */
export function validateGroupListStatus(value: unknown): "active" | "archived" {
  if (value === undefined || value === null || value === "active") return "active";
  if (value === "archived") return "archived";
  throw new ApiError(400, "status must be 'active' or 'archived'");
}

/**
 * Assert core membership invariants on a fresh/updated member list:
 * exactly one owner (active), every active/invited userId unique, no other
 * entries holding owner role.
 */
export function assertOwnerInvariant(members: GroupMemberInput[]): void {
  const meaningful = members.filter((m) => m.status !== "declined");

  const owners = meaningful.filter((m) => m.role === "owner" && m.status === "active");
  if (owners.length !== 1) {
    throw new ApiError(409, "A group must have exactly one active owner");
  }

  const seen = new Set<string>();
  for (const m of meaningful) {
    const key = m.userId.toString();
    if (seen.has(key)) {
      throw new ApiError(409, "A member can only appear once per group");
    }
    seen.add(key);
  }
}
