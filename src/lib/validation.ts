import { z } from 'zod';

// Full name: letters only, words separated by single spaces (first [+ middle] + last)
// Keeps the strict shape: a space after the last character of a word, then a new word.
export const nameWordsPattern = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
// Per-keystroke rule for live feedback: letters and spaces only, before final shape checks
export const nameTypingPattern = /^[A-Za-z ]+$/;

export const FULL_NAME_LETTERS_MESSAGE = 'Full Name Must Use Letters';
export const FULL_NAME_MIN_MESSAGE = 'Please enter your first and last name';
export const FULL_NAME_MAX_MESSAGE = 'Please enter at most 3 names (first, middle, and last name)';

export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

// Mirrors the server-side full name rules: letters only, 2–3 words. Returns the
// first error message, or null when the value satisfies all rules.
export function fullNameErrorMessage(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null; // empty is handled by the empty-field check
  if (!nameWordsPattern.test(trimmed)) return FULL_NAME_LETTERS_MESSAGE;
  const words = countWords(trimmed);
  if (words < 2) return FULL_NAME_MIN_MESSAGE;
  if (words > 3) return FULL_NAME_MAX_MESSAGE;
  return null;
}

// Password complexity rules: at least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
// All inputs are trimmed of leading/trailing whitespace before validation.
export const passwordSchema = z
  .string()
  .trim()
  .min(8, 'Password must be at least 8 characters long')
  .max(100, 'Password must be less than 100 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Sign Up Schema
export const signUpSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters long')
      .max(100, 'Name must be less than 100 characters')
      .regex(nameWordsPattern, FULL_NAME_LETTERS_MESSAGE)
      .refine((val) => countWords(val) >= 2, { message: FULL_NAME_MIN_MESSAGE })
      .refine((val) => countWords(val) <= 3, { message: FULL_NAME_MAX_MESSAGE }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Please enter a valid email address'),
    password: passwordSchema,
    passwordConfirmation: z.string().trim().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Passwords do not match',
    path: ['passwordConfirmation'],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

// Email Verification Schema (6-digit numeric)
export const verifyEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  code: z
    .string()
    .trim()
    .length(6, 'Verification code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Verification code must contain only numbers'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// Resend Verification Code Schema
export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

// Sign In Schema
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().trim().min(1, 'Password is required'),
});

export type SignInInput = z.infer<typeof signInSchema>;

// Forgot Password Schema
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// Reset Password Schema
export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, 'Reset token is required'),
    password: passwordSchema,
    passwordConfirmation: z.string().trim().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Passwords do not match',
    path: ['passwordConfirmation'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
