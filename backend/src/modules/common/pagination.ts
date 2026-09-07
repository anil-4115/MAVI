export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(query.limit)) || DEFAULT_PAGE_SIZE),
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
