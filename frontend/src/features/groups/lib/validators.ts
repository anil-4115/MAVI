/**
 * Client-side validation mirrors of the backend group field rules
 * (group.validation.ts). The backend remains authoritative.
 */

export const validateGroupName = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Group name is required.";
  }
  if (trimmed.length > 80) {
    return "Group name must be 80 characters or fewer.";
  }
  return null;
};

export const validateGroupDescription = (value: string): string | null => {
  if (value.trim().length > 300) {
    return "Description must be 300 characters or fewer.";
  }
  return null;
};