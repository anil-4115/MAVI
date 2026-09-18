import type { NextFunction, Request, Response } from "express";
import { sanitizeLogUrl } from "../utils/sanitizeLogUrl.js";

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      `${new Date().toISOString()} ${req.method} ${sanitizeLogUrl(req.originalUrl)} ${res.statusCode} ${durationMs.toFixed(2)}ms`
    );
  });

  next();
};