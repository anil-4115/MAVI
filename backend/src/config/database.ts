import mongoose from "mongoose";
import { env } from "./env.js";

/**
 * Connection options supported by the mongodb driver 7.x bundled with Mongoose 9.
 * Reconnection and command buffering are handled by Mongoose/driver defaults,
 * so there is no custom polling loop and no keep-alive/self-ping here.
 */
const CONNECTION_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
};

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(env.mongoUri, CONNECTION_OPTIONS);
    console.log("MongoDB connected successfully");
  } catch (error) {
    // Startup only: fail fast so the platform can retry a fresh boot.
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

/**
 * Attach log-only handlers before connectDatabase so a transient
 * connectivity/topology interruption after startup cannot become an
 * unhandled "error" event (which would terminate the Node process) and so
 * reconnection progress is observable. Never log the URI or credentials.
 */
export const registerConnectionHandlers = (): void => {
  const connection = mongoose.connection;

  connection.on("error", (error: unknown) => {
    console.error(
      "MongoDB connection error (automatic reconnection in progress):",
      error instanceof Error ? error.message : error
    );
  });

  connection.on("disconnected", () => {
    console.log("MongoDB connection state: disconnected — waiting for automatic reconnect");
  });

  connection.on("reconnected", () => {
    console.log("MongoDB connection state: reconnected");
  });

  connection.on("connected", () => {
    console.log("MongoDB connection state: connected");
  });
};

export const isDatabaseConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};