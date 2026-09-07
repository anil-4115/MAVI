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

const parseEnv = (): {
  port: number;
  mongoUri: string;
  nodeEnv: NodeEnv;
  isProduction: boolean;
  jwtSecret: string;
  jwtExpiresIn: JwtExpiresIn;
} => {
  const rawMongoUri = process.env.MONGODB_URI;
  const rawPort = process.env.PORT ?? "5000";
  const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
  const rawJwtSecret = process.env.JWT_SECRET;
  const rawJwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? "7d").trim();

  if (!rawMongoUri || rawMongoUri.trim() === "") {
    throw new Error("MONGODB_URI is required (see backend/.env.example)");
  }

  if (!isMongoUri(rawMongoUri)) {
    throw new Error("MONGODB_URI must be a valid MongoDB connection string");
  }

  if (!isPort(rawPort)) {
    throw new Error(`PORT must be a valid port number, got "${rawPort}"`);
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

  return {
    port: Number(rawPort),
    mongoUri: rawMongoUri,
    nodeEnv,
    isProduction: nodeEnv === "production",
    jwtSecret: rawJwtSecret.trim(),
    jwtExpiresIn: rawJwtExpiresIn,
  };
};

export const env = Object.freeze(parseEnv());