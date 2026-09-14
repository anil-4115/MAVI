import { ApiError } from "../../utils/ApiError.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export interface RegistrationInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

const getName = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 100) {
    throw new ApiError(400, "Name must be between 2 and 100 characters");
  }
  return value.trim();
};

const getEmail = (value: unknown): string => {
  if (typeof value !== "string" || !EMAIL_REGEX.test(value.trim())) {
    throw new ApiError(400, "A valid email address is required");
  }
  return value.trim().toLowerCase();
};

const getPassword = (value: unknown): string => {
  if (typeof value !== "string" || value.length < 8 || value.length > 72) {
    throw new ApiError(400, "Password must be between 8 and 72 characters");
  }
  if (!PASSWORD_REGEX.test(value)) {
    throw new ApiError(400, "Password must contain at least one letter and one number");
  }
  return value;
};

export const validateRegistration = (body: unknown): RegistrationInput => {
  const { name, email, password } = (body ?? {}) as Record<string, unknown>;
  return { name: getName(name), email: getEmail(email), password: getPassword(password) };
};

export const validateLogin = (body: unknown): LoginInput => {
  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || email.trim() === "") {
    throw new ApiError(400, "Email is required");
  }
  if (typeof password !== "string" || password === "") {
    throw new ApiError(400, "Password is required");
  }
  return { email: email.trim().toLowerCase(), password };
};

const getToken = (value: unknown): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "Reset token is required");
  }
  return value.trim();
};

export const validateForgotPassword = (body: unknown): ForgotPasswordInput => {
  const { email } = (body ?? {}) as Record<string, unknown>;
  return { email: getEmail(email) };
};

export const validateResetPassword = (body: unknown): ResetPasswordInput => {
  const { token, password } = (body ?? {}) as Record<string, unknown>;
  return { token: getToken(token), password: getPassword(password) };
};