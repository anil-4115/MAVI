const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

/**
 * Client-side rules mirror the backend (src/modules/auth/auth.validation.ts).
 * Backend validation remains authoritative.
 */

export const validateName = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Name is required.";
  }
  if (trimmed.length < 2 || trimmed.length > 100) {
    return "Name must be between 2 and 100 characters.";
  }
  return null;
};

export const validateEmail = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Email is required.";
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
};

export const validateLoginPassword = (value: string): string | null => {
  if (!value) {
    return "Password is required.";
  }
  return null;
};

export const validatePassword = (value: string): string | null => {
  if (!value) {
    return "Password is required.";
  }
  if (value.length < 8 || value.length > 72) {
    return "Password must be between 8 and 72 characters.";
  }
  if (!PASSWORD_REGEX.test(value)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
};

export const validateConfirmPassword = (value: string, password: string): string | null => {
  if (!value) {
    return "Please confirm your password.";
  }
  if (value !== password) {
    return "Passwords do not match.";
  }
  return null;
};