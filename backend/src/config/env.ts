import "dotenv/config";

const VALID_ENVIRONMENTS = ["development", "production", "test"] as const;
type NodeEnv = (typeof VALID_ENVIRONMENTS)[number];

export type JwtExpiresIn = `${number}${"ms" | "s" | "m" | "h" | "d"}`;

const isPort = (value: string): boolean => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535;
};

const isMongoUri = (value: string): boolean => /^mongodb(\+srv)?:\/\/.+/.test(value);

const isJwtExpiresIn = (value: string): value is JwtExpiresIn =>
  /^\d+(ms|s|m|h|d)$/.test(value);

const isHttpUrl = (value: string): boolean => /^https?:\/\/\S+(\.\S+|:\d+)\S*$/.test(value);

const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isResendApiKey = (value: string): boolean => /^re_[A-Za-z0-9_\-]{10,}$/.test(value);

const isTrustProxyHops = (value: string): boolean => /^\d+$/.test(value);

const DEFAULT_DEV_EMAIL_FROM = "onboarding@resend.dev";
const DEFAULT_DEV_FRONTEND_URL = "http://localhost:5173";

const parseEnv = (): {
  port: number;
  listenHost: string;
  mongoUri: string;
  nodeEnv: NodeEnv;
  isProduction: boolean;
  trustProxyHops: number;
  jwtSecret: string;
  jwtExpiresIn: JwtExpiresIn;
  resendApiKey: string;
  emailFrom: string;
  frontendUrl: string;
} => {
  const rawMongoUri = process.env.MONGODB_URI;
  const rawPort = process.env.PORT ?? "5000";
  const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
  const rawJwtSecret = process.env.JWT_SECRET;
  const rawJwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? "7d").trim();
  const rawResendApiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const rawEmailFrom = (process.env.EMAIL_FROM ?? "").trim();
  const rawFrontendUrl = (process.env.FRONTEND_URL ?? "").trim();
  const rawTrustProxyHops = (process.env.TRUST_PROXY_HOPS ?? "0").trim();
  const isProduction = nodeEnv === "production";

  if (!rawMongoUri || rawMongoUri.trim() === "") {
    throw new Error("MONGODB_URI is required (see backend/.env.example)");
  }

  if (!isMongoUri(rawMongoUri)) {
    throw new Error("MONGODB_URI must be a valid MongoDB connection string");
  }

  if (!isPort(rawPort)) {
    throw new Error(`PORT must be a valid port number, got "${rawPort}"`);
  }

  if (!isTrustProxyHops(rawTrustProxyHops)) {
    throw new Error(`TRUST_PROXY_HOPS must be a non-negative integer, got "${rawTrustProxyHops}"`);
  }

  if (!VALID_ENVIRONMENTS.includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of ${VALID_ENVIRONMENTS.join(", ")}`);
  }

  if (!rawJwtSecret || rawJwtSecret.trim().length < 16) {
    throw new Error("JWT_SECRET is required and must be at least 16 characters long");
  }

  if (!isJwtExpiresIn(rawJwtExpiresIn)) {
    throw new Error(
      "JWT_EXPIRES_IN must be a duration like 15m, 1h or 7d (e.g. 600ms, 15m, 1h, 7d)"
    );
  }

  if (isProduction) {
    if (!isResendApiKey(rawResendApiKey)) {
      throw new Error("RESEND_API_KEY is required in production (format: re_...)");
    }
    if (!isEmail(rawEmailFrom)) {
      throw new Error("EMAIL_FROM is required in production and must be a valid sender address");
    }
    if (!isHttpUrl(rawFrontendUrl)) {
      throw new Error("FRONTEND_URL is required in production and must be a valid http(s) URL");
    }
  }

  return {
    port: Number(rawPort),
    listenHost: nodeEnv === "production" ? "0.0.0.0" : "localhost",
    mongoUri: rawMongoUri,
    nodeEnv,
    isProduction,
    trustProxyHops: Number(rawTrustProxyHops),
    jwtSecret: rawJwtSecret.trim(),
    jwtExpiresIn: rawJwtExpiresIn,
    resendApiKey: rawResendApiKey,
    emailFrom: rawEmailFrom || (isProduction ? "" : DEFAULT_DEV_EMAIL_FROM),
    frontendUrl: rawFrontendUrl || (isProduction ? "" : DEFAULT_DEV_FRONTEND_URL),
  };
};

export const env = Object.freeze(parseEnv());