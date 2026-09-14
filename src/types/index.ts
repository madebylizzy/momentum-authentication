import { User, Session, EmailVerification, PasswordReset } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash'>;

export interface AuthSession {
  user: SafeUser;
  session: Session;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}
