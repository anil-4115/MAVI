import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

interface DuplicateKeyError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

const isDuplicateKeyError = (error: unknown): error is DuplicateKeyError => {
  return error instanceof Error && typeof (error as DuplicateKeyError).code === "number";
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const message = Object.values(error.errors)
      .map((e) => e.message)
      .join("; ");
    res.status(400).json({ success: false, message });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ success: false, message: `Invalid ${error.path}: ${error.value}` });
    return;
  }

  if (isDuplicateKeyError(error) && error.code === 11000) {
    const field = error.keyValue ? Object.keys(error.keyValue)[0] : undefined;
    res.status(409).json({
      success: false,
      message: field ? `Duplicate value for "${field}"` : "Duplicate key error",
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Unhandled error:", error instanceof Error ? error.stack : error);

  res.status(500).json({
    success: false,
    message: env.isProduction ? "Internal server error" : message,
  });
};