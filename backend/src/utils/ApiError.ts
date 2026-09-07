export class ApiError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}