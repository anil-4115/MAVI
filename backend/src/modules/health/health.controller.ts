import type { Request, Response } from "express";
import { isDatabaseConnected } from "../../config/database.js";

export const healthCheck = (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: "MAVI API is healthy",
    database: isDatabaseConnected() ? "connected" : "disconnected",
  });
};