import bcrypt from "bcryptjs";
import type { PublicUser, AuthResult } from "./auth.types.js";
import { User, type IUser } from "./auth.model.js";
import { signToken } from "../../utils/jwt.js";
import { ApiError } from "../../utils/ApiError.js";
import type { RegistrationInput, LoginInput } from "./auth.validation.js";
import {
  generateVerificationToken,
  getVerificationExpiry,
  hashToken,
  sendSignupEmailOnce,
} from "./verification.service.js";

export const BCRYPT_ROUNDS = 10;

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface UserSource extends IUser {
  _id: { toString(): string };
  createdAt: Date;
}

const toPublicUser = (user: UserSource): PublicUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  // Accounts created before email verification shipped have no flag and are
  // treated as verified (grandfathered). New accounts set it explicitly.
  emailVerified: user.emailVerified === false ? false : true,
  createdAt: user.createdAt.toISOString(),
});

export interface RegisterResult {
  user: PublicUser;
  /** True when the provider accepted the signup verification email. */
  verificationEmailSent: boolean;
}

export const register = async (input: RegistrationInput): Promise<RegisterResult> => {
  const email = input.email.toLowerCase();

  const existing = await User.exists({ email });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const rawToken = generateVerificationToken();
  const expiresAt = getVerificationExpiry();
  const user = (await User.create({
    name: input.name,
    email,
    passwordHash,
    emailVerified: false,
    verificationTokenHash: hashToken(rawToken),
    verificationTokenExpiresAt: expiresAt,
    verificationEmailSentAt: null,
  })) as unknown as UserSource;

  let verificationEmailSent = false;
  try {
    verificationEmailSent = await sendSignupEmailOnce({
      user: { id: user._id.toString(), email: user.email, name: user.name },
      rawToken,
      expiresAt,
    });
  } catch (error) {
    // Email delivery failure must not topple registration or the process.
    // The safe message never contains provider details or secrets.
    console.error(
      "Signup verification email could not be sent:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return { user: toPublicUser(user), verificationEmailSent };
};

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const email = input.email.toLowerCase();

  const user = (await User.findOne({ email }).select(
    "+passwordHash +emailVerified +failedLoginAttempts +accountLockedUntil",
  )) as unknown as
    | (UserSource & {
        comparePassword(candidate: string): Promise<boolean>;
        failedLoginAttempts?: number;
        accountLockedUntil?: Date | null;
      })
    | null;
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  // Check lockout before attempting password verification.
  if (user.accountLockedUntil && user.accountLockedUntil.getTime() > Date.now()) {
    throw new ApiError(429, "Too many failed login attempts. Please try again later.");
  }

  const passwordValid = await user.comparePassword(input.password);
  if (!passwordValid) {
    // Atomically increment the failed-attempt counter.
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { failedLoginAttempts: 1 } },
      { returnDocument: "after", select: "+failedLoginAttempts" },
    );

    // Lock the account when the threshold is reached — unless a lock is
    // already active. An expired past-dated lock still matches so the account
    // is re-locked on the next failure after the lockout window.
    if (updated && (updated.failedLoginAttempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
      await User.updateOne(
        {
          _id: user._id,
          $or: [
            { accountLockedUntil: null },
            { accountLockedUntil: { $lte: new Date() } },
          ],
        },
        { $set: { accountLockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) } },
      );
    }

    throw new ApiError(401, "Invalid email or password");
  }

  // Correct password — reset the counter and clear any lockout.
  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, accountLockedUntil: null } },
  );

  if (user.emailVerified === false) {
    throw new ApiError(403, "Please verify your email before logging in.");
  }

  const token = signToken({ sub: user._id.toString(), email: user.email });

  return { token, user: toPublicUser(user) };
};

export const getProfileById = async (userId: string): Promise<PublicUser> => {
  const user = (await User.findById(userId).select(
    "name email +emailVerified createdAt",
  )) as unknown as UserSource | null;
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return toPublicUser(user);
};