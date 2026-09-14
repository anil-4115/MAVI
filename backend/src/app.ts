import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet, { strictTransportSecurity as helmetStrictTransportSecurity } from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestLogger } from "./middleware/requestLogger.js";
import {
  createRateLimiters,
  type RateLimiterOptions,
} from "./middleware/rateLimiters.js";
import { buildApiRouter } from "./routes/index.js";

/**
 * Security-header notes (Phase 9C):
 *
 * - MAVI's backend is a JSON-only API. The React frontend is served separately
 *   by Vercel, so no HTML/document protection is needed for the API responses
 *   themselves. The CSP below is intentionally minimal and API-appropriate:
 *     - `default-src 'none'`  — the response's context may load nothing, which
 *       neutralizes any script/img/style injection if a response is ever
 *       interpreted as a document (e.g. after an upstream content-type
 *       misconfiguration). The frontend page is governed solely by Vercel's own
 *       CSP; this header never reaches it.
 *     - `frame-ancestors 'none'` — modern-browser clickjacking defense that
 *       complements X-Frame-Options.
 * - HSTS is intentionally NOT handled by `helmet()`'s default: Helmet 8 sets
 *   `Strict-Transport-Security` on every response regardless of transport,
 *   which would incorrectly advertise HSTS during local HTTP development.
 *   `setStrictTransportSecurity` only emits it for secure requests
 *   (`req.secure`), i.e. real HTTPS or HTTPS behind the trusted proxy.
 *   `includeSubDomains`/`preload` are off so we never pin HSTS onto hosts we do
 *   not control (Railway's shared `*.railway.app` / a root domain that might
 *   host the Vercel frontend). No hostnames are hardcoded.
 * - Permissions-Policy: Helmet 8 dropped its Permissions-Policy middleware;
 *   the header only applies to top-level documents (which this API never
 *   serves) so it is inert here, but we still emit a deny-by-default policy
 *   because it is safe and communicates an audit-friendly posture.
 */
const HSTS_MAX_AGE = 365 * 24 * 60 * 60;
const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), " +
  "gyroscope=(), accelerometer=(), magnetometer=(), picture-in-picture=(), " +
  "sync-xhr=(), fullscreen=()";

const securityStrictTransportSecurity = helmetStrictTransportSecurity({
  maxAge: HSTS_MAX_AGE,
  includeSubDomains: false,
});

/** Emits HSTS only for HTTPS (or HTTPS behind the trusted proxy). */
const setStrictTransportSecurity = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (req.secure) {
    securityStrictTransportSecurity(req, res, next);
  } else {
    next();
  }
};

const setPermissionsPolicy = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  next();
};

export interface CreateAppOptions {
  /**
   * Number of trusted reverse-proxy hops in front of this app. Mirrors
   * Express's `trust proxy` setting and is read from `TRUST_PROXY_HOPS`.
   * 0 = no proxy (default, safe). Values > 0 must only be used when this app
   * is only reachable through that many trusted proxies; trusting a hop a
   * direct client can reach lets them spoof `X-Forwarded-For` and bypass
   * IP-based rate limits.
   */
  trustProxyHops?: number;
  /** Override rate-limit window/limits (used by tests). */
  rateLimits?: Partial<RateLimiterOptions>;
  /** Disable request logging (used by tests for clean output). */
  logging?: boolean;
}

export const createApp = (options: CreateAppOptions = {}): Express => {
  const trustProxyHops = options.trustProxyHops ?? env.trustProxyHops;
  const app = express();

  if (trustProxyHops > 0) {
    app.set("trust proxy", trustProxyHops);
  }

  // Security headers first so every response (success, 4xx/5xx, rate-limited)
  // carries them. COEP stays at Helmet's default (disabled): cross-origin
  // isolation would break the Vercel frontend's cross-origin API consumption
  // and is meaningless for non-document responses.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      xFrameOptions: { action: "deny" },
      strictTransportSecurity: false, // handled by setStrictTransportSecurity
    }),
  );
  app.use(setStrictTransportSecurity);
  app.use(setPermissionsPolicy);
  app.use(cors());
  app.use(express.json());
  if (options.logging !== false) {
    app.use(requestLogger);
  }

  app.use("/api", buildApiRouter(createRateLimiters(options.rateLimits, trustProxyHops > 0)));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};