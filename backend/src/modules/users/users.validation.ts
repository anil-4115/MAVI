import { ApiError } from "../../utils/ApiError.js";

/** Name rules mirror the auth registration rules (2–100 characters, trimmed). */
export function validateName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 100) {
    throw new ApiError(400, "Name must be between 2 and 100 characters");
  }
  return value.trim();
}

export interface UpdateProfileBody {
  name: string;
}

export function validateUpdateProfile(body: unknown): UpdateProfileBody {
  const { name } = (body ?? {}) as Record<string, unknown>;
  return { name: validateName(name) };
}
