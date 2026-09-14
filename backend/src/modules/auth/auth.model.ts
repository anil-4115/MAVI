import { Schema, model, type HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  /**
   * Whether the email address has been verified. Deliberately has NO schema
   * default: accounts created before email verification shipped carry
   * `undefined` here and remain grandfathered (they can keep logging in).
   * New registrations set it to `false` explicitly.
   */
  emailVerified?: boolean;
  /** SHA-256 hash of the active verification token (raw token is never stored). */
  verificationTokenHash: string | null;
  /** When the active verification token stops being valid. */
  verificationTokenExpiresAt: Date | null;
  /** When the signup verification email was accepted by the provider. */
  verificationEmailSentAt: Date | null;
  /**
   * SHA-256 hashes of verification tokens that have already been consumed.
   * Kept so re-clicking a used link returns an idempotent "already verified"
   * response instead of "invalid", while the active hash is cleared.
   */
  verifiedTokenHashes: string[];
  /**
   * SHA-256 hash of the active password-reset token (raw token never stored).
   * Slotted on the user document so no separate collection is needed.
   */
  passwordResetTokenHash: string | null;
  /** When the active password-reset token stops being valid. */
  passwordResetTokenExpiresAt: Date | null;
  /**
   * Consecutive failed login attempts. Reset on successful login.
   * Optional: existing documents created before this field shipped have no
   * value and read as 0.
   */
  failedLoginAttempts?: number;
  /**
   * When the account lockout expires. null/undefined = not locked.
   * Optional: existing documents created before this field shipped have no
   * value and read as unlocked.
   */
  accountLockedUntil?: Date | null;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser> & IUserMethods & { createdAt: Date; updatedAt: Date };

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    emailVerified: { type: Boolean, select: false },
    verificationTokenHash: { type: String, default: null, select: false, index: true },
    verificationTokenExpiresAt: { type: Date, default: null },
    verificationEmailSentAt: { type: Date, default: null },
    verifiedTokenHashes: { type: [String], default: [], select: false },
    passwordResetTokenHash: { type: String, default: null, select: false, index: true },
    passwordResetTokenExpiresAt: { type: Date, default: null },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    accountLockedUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true, versionKey: false }
);

userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

export const User = model<IUser>("User", userSchema);