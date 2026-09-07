const STORAGE_KEY = "mavi_token";

export const getToken = (): string | null => {
  return localStorage.getItem(STORAGE_KEY);
};

export const setToken = (token: string): void => {
  localStorage.setItem(STORAGE_KEY, token);
};

export const clearToken = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
