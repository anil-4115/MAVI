/**
 * Cryptographically secure token helpers. Entirely pure — no DB or env
 * imports. Safe to import in offline self-tests and production alike.
 */
import crypto from "node:crypto";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const TOKEN_TTL_HOURS = TOKEN_TTL_MS / (1000 * 60 * 60);

/** Password-reset token lifetime: 1 hour (deliberately shorter than 24h verify). */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const RESET_TOKEN_TTL_HOURS = RESET_TOKEN_TTL_MS / (1000 * 60 * 60);

/** Cryptographically random hex string (32 bytes → 64 hex chars). */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Cryptographically random reset token — same secure source as verification. */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Deterministic SHA-256 digest of a raw token (64 hex chars). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getVerificationExpiry(): Date {
  return new Date(Date.now() + TOKEN_TTL_MS);
}

export function getResetExpiry(): Date {
  return new Date(Date.now() + RESET_TOKEN_TTL_MS);
}

export function isTokenExpired(expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() <= now.getTime();
}