import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { signUpSchema } from '@/lib/validation';
import { hashPassword, verifyPassword, generateEmailVerificationCode } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Rate limit: 10 requests per hour per IP (AGENTS.md §9a)
const SIGNUP_RATE_LIMIT = 10;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting check
    const clientIp = getClientIp(req);
    const rateLimitKey = `signup:${clientIp}`;
    const rateLimitResult = checkRateLimit(rateLimitKey, {
      limit: SIGNUP_RATE_LIMIT,
      windowMs: SIGNUP_WINDOW_MS,
    });

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many sign-up requests from this IP. Please try again in ${rateLimitResult.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfterSeconds.toString(),
          },
        }
      );
    }

    // 2. Validate input schema
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const validation = signUpSchema.safeParse(body);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const error of validation.error.errors) {
        const field = error.path[0]?.toString() || 'form';
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(error.message);
      }

      return NextResponse.json(
        {
          success: false,
          message: 'Please check your form input.',
          errors: fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, email, password } = validation.data;

    // 3. Check for existing user (idempotency check)
    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: {
        verificationCodes: {
          where: {
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (existingUser) {
      // Case 1: Account already verified -> return conflict error
      if (existingUser.emailVerified) {
        return NextResponse.json(
          {
            success: false,
            message: 'An account with this email address already exists.',
          },
          { status: 409 }
        );
      }

      // Case 2: Unverified user -> verify password for idempotent submission
      const isSamePassword = await verifyPassword(password, existingUser.passwordHash);
      if (isSamePassword) {
        // Check if an active unexpired code already exists
        const activeCode = existingUser.verificationCodes[0];
        if (!activeCode) {
          // If previous code expired, attempt to generate a fresh one respecting cooldown and cap
          const codeResult = await generateEmailVerificationCode(existingUser.id, existingUser.email);
          if (!codeResult.allowed) {
            return NextResponse.json(
              {
                success: false,
                message:
                  codeResult.reason === 'cooldown'
                    ? `Please wait ${codeResult.retryAfterSeconds} seconds before requesting a new verification code.`
                    : `Too many verification code requests. Please try again in ${codeResult.retryAfterSeconds} seconds.`,
              },
              {
                status: 429,
                headers: {
                  'Retry-After': (codeResult.retryAfterSeconds || 60).toString(),
                },
              }
            );
          }
        }

        return NextResponse.json(
          {
            success: true,
            message: 'Account created successfully. Please verify your email.',
            data: { email: existingUser.email },
          },
          { status: 200 }
        );
      }

      // Password mismatch on existing unverified email -> reject with 409 to prevent unauthorized takeover
      return NextResponse.json(
        {
          success: false,
          message: 'An account with this email address already exists.',
        },
        { status: 409 }
      );
    }

    // 4. Hash password with bcrypt cost 12
    const passwordHash = await hashPassword(password);

    // 5. Create new user and verification code inside a transaction
    try {
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          emailVerified: false,
        },
      });

      // Generate initial verification code (bypass cooldown on brand new creation)
      await generateEmailVerificationCode(newUser.id, newUser.email, true);

      return NextResponse.json(
        {
          success: true,
          message: 'Account created successfully. Please verify your email.',
          data: { email: newUser.email },
        },
        { status: 201 }
      );
    } catch (dbError: any) {
      // Catch duplicate email error at the database level (P2002) for concurrent submissions
      if (dbError.code === 'P2002') {
        const duplicateUser = await prisma.user.findUnique({ where: { email } });
        if (duplicateUser && !duplicateUser.emailVerified) {
          const isSamePassword = await verifyPassword(password, duplicateUser.passwordHash);
          if (isSamePassword) {
            return NextResponse.json(
              {
                success: true,
                message: 'Account created successfully. Please verify your email.',
                data: { email: duplicateUser.email },
              },
              { status: 200 }
            );
          }
        }

        return NextResponse.json(
          {
            success: false,
            message: 'An account with this email address already exists.',
          },
          { status: 409 }
        );
      }

      console.error('Database registration error:', dbError);
      return NextResponse.json(
        {
          success: false,
          message: 'An error occurred while creating your account. Please try again.',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Registration handler error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    );
  }
}
