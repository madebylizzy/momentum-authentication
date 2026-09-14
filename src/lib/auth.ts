import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from './db';
import { sendVerificationCodeEmail, sendPasswordResetEmail } from './email';

const BCRYPT_SALT_ROUNDS = 12;
const VERIFICATION_CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes (AGENTS.md §9a)
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds (AGENTS.md §9a)
const RESEND_HOURLY_CAP = 5; // 5 per hour per account (AGENTS.md §9a)
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (AGENTS.md §9a)
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour (AGENTS.md §9a)

export const SESSION_COOKIE_NAME = 'momentum_session';

/**
 * Hashes a plaintext password using bcrypt with cost factor 12
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a stored bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generates a cryptographically secure 6-digit numeric code
 */
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export interface VerificationCodeResult {
  allowed: boolean;
  code?: string;
  expiresAt?: Date;
  reason?: 'cooldown' | 'hourly_cap';
  retryAfterSeconds?: number;
}

/**
 * Unified verification code generator with strict 60s cooldown & 5/hour cap enforcement.
 */
export async function generateEmailVerificationCode(
  userId: string,
  userEmail: string,
  forceBypassCooldown = false
): Promise<VerificationCodeResult> {
  const now = new Date();

  if (!forceBypassCooldown) {
    // 1. Check 60-second cooldown from most recent code
    const latestCode = await prisma.emailVerification.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (latestCode) {
      const msSinceLast = now.getTime() - latestCode.createdAt.getTime();
      if (msSinceLast < RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - msSinceLast) / 1000);
        return {
          allowed: false,
          reason: 'cooldown',
          retryAfterSeconds,
        };
      }
    }

    // 2. Check 5 per hour cap
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const hourlyCount = await prisma.emailVerification.count({
      where: {
        userId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (hourlyCount >= RESEND_HOURLY_CAP) {
      const oldestInWindow = await prisma.emailVerification.findFirst({
        where: {
          userId,
          createdAt: { gte: oneHourAgo },
        },
        orderBy: { createdAt: 'asc' },
      });

      const retryAfterSeconds = oldestInWindow
        ? Math.max(1, Math.ceil((oldestInWindow.createdAt.getTime() + 60 * 60 * 1000 - now.getTime()) / 1000))
        : 3600;

      return {
        allowed: false,
        reason: 'hourly_cap',
        retryAfterSeconds,
      };
    }
  }

  // Invalidate any prior unconsumed verification codes for this user
  await prisma.emailVerification.updateMany({
    where: { userId, used: false },
    data: { used: true },
  });

  // Generate and store new verification code
  const code = generateVerificationCode();
  const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_EXPIRY_MS);

  await prisma.emailVerification.create({
    data: {
      userId,
      code,
      expiresAt,
      used: false,
    },
  });

  // Log verification code to server console (dev-only email delivery)
  await sendVerificationCodeEmail(userEmail, code, expiresAt);

  return {
    allowed: true,
    code,
    expiresAt,
  };
}

/**
 * Creates an authenticated session in the database
 */
export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return { session, token, expiresAt };
}

/**
 * Validates a session token against the database
 */
export async function getSessionUser(token: string) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return { session, user: session.user };
}

/**
 * Invalidates / deletes a session from the database
 */
export async function deleteSession(token: string) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

/**
 * Creates a single-use, time-limited password reset token (1 hour expiry)
 * Logs reset link to server console in dev mode.
 */
export async function createPasswordResetToken(userId: string, userEmail: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

  // Invalidate any prior unconsumed reset tokens for this user
  await prisma.passwordReset.updateMany({
    where: { userId, used: false },
    data: { used: true },
  });

  await prisma.passwordReset.create({
    data: {
      userId,
      token,
      expiresAt,
      used: false,
    },
  });

  // Log password reset link to server console (dev-only email delivery)
  await sendPasswordResetEmail(userEmail, token, expiresAt);

  return token;
}

/**
 * Validates a password reset token from the database
 */
export async function validatePasswordResetToken(token: string) {
  if (!token) {
    return { valid: false, error: 'Reset token is required.' };
  }

  const resetRecord = await prisma.passwordReset.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!resetRecord || resetRecord.used) {
    return { valid: false, error: 'This password reset link is invalid or has already been used.' };
  }

  if (resetRecord.expiresAt < new Date()) {
    return { valid: false, error: 'This password reset link has expired. Please request a new one.' };
  }

  return { valid: true, record: resetRecord };
}
