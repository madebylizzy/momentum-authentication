import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { signInSchema } from '@/lib/validation';
import { verifyPassword, createSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Rate limit: 5 attempts per 15 minutes keyed on email + IP (AGENTS.md §9a)
const SIGNIN_RATE_LIMIT = 5;
const SIGNIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const validation = signInSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Please provide both email and password.' },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // 1. Rate limit keyed on email + IP per AGENTS.md §9a
    const rateLimitKey = `signin:${email}:${clientIp}`;
    const rateLimitResult = checkRateLimit(rateLimitKey, {
      limit: SIGNIN_RATE_LIMIT,
      windowMs: SIGNIN_WINDOW_MS,
    });

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many failed login attempts. Please try again in ${rateLimitResult.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfterSeconds.toString(),
          },
        }
      );
    }

    // 2. Query user from database
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Non-technical error message without leaking user existence
      return NextResponse.json(
        { success: false, message: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // 3. Verify password hash using bcrypt.compare
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // 4. Check email verification status (AGENTS.md §4: Unverified users should not receive access)
    if (!user.emailVerified) {
      return NextResponse.json(
        {
          success: false,
          message: 'Please verify your email address before signing in.',
          requiresVerification: true,
          email: user.email,
        },
        { status: 403 }
      );
    }

    // 5. Create session in database (7 days expiry per AGENTS.md §9a)
    const { token, expiresAt } = await createSession(user.id);

    // 6. Set HTTP-only session cookie with locked security flags
    const response = NextResponse.json(
      {
        success: true,
        message: 'Signed in successfully.',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        },
      },
      { status: 200 }
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return response;
  } catch (error) {
    console.error('Sign-in error:', error);
    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred during sign in.' },
      { status: 500 }
    );
  }
}
