import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const asyncHandler = (handler: AsyncHandler): RequestHandler => {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
};