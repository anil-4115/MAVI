import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

export interface TokenPayload {
  sub: string;
  email: string;
}

export const signToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
};

export const verifyToken = (token: string): TokenPayload => {
  let decoded: jwt.JwtPayload | string;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }

  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new ApiError(401, "Invalid or expired token");
  }

  return { sub: decoded.sub, email: typeof decoded.email === "string" ? decoded.email : "" };
};