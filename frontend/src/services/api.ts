import axios, { AxiosError } from "axios";
import type { ApiErrorPayload } from "../lib/types";
import { clearToken, getToken } from "./token";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    if (error.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(error);
  }
);

/**
 * Normalizes any Axios error into a human-readable message suitable for display.
 * Prioritizes the backend's {success:false, message} payload, then known status
 * codes, then generic network errors. Never logs the request payload.
 */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    const message = error.response?.data?.message;
    if (message) {
      return message;
    }
    if (error.response) {
      return `Request failed with status ${error.response.status}`;
    }
    if (error.code === "ECONNABORTED") {
      return "The request timed out. Please try again.";
    }
    return "Unable to reach the server. Check your connection and try again.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
};

export default api;
