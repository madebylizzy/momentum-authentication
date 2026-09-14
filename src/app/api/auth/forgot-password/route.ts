import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { forgotPasswordSchema } from '@/lib/validation';
import { createPasswordResetToken } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

// Rate limit: 5 requests per hour keyed on email (AGENTS.md §9a)
const FORGOT_PASSWORD_RATE_LIMIT = 5;
const FORGOT_PASSWORD_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const validation = forgotPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    // Rate limiting keyed on email per AGENTS.md §9a
    const rateLimitKey = `forgot:${email}`;
    const rateLimitResult = checkRateLimit(rateLimitKey, {
      limit: FORGOT_PASSWORD_RATE_LIMIT,
      windowMs: FORGOT_PASSWORD_WINDOW_MS,
    });

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many password reset requests for this email. Please try again in ${rateLimitResult.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfterSeconds.toString(),
          },
        }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // If user exists, generate single-use reset token (1 hour expiry)
    if (user) {
      await createPasswordResetToken(user.id, user.email);
    }

    // Always return neutral confirmation to prevent account enumeration (AGENTS.md §4)
    return NextResponse.json(
      {
        success: true,
        message: 'If an account exists for that email, we have sent instructions to reset your password.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
