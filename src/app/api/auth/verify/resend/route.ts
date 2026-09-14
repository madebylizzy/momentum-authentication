import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { resendVerificationSchema } from '@/lib/validation';
import { generateEmailVerificationCode } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const validation = resendVerificationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Return neutral confirmation to avoid email enumeration
      return NextResponse.json(
        {
          success: true,
          message: 'If an unverified account exists for this email, a new code has been sent.',
        },
        { status: 200 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        {
          success: true,
          message: 'This email is already verified. Please sign in.',
          alreadyVerified: true,
        },
        { status: 200 }
      );
    }

    // Generate code with database-enforced 60s cooldown and 5/hour cap (AGENTS.md §9a)
    const result = await generateEmailVerificationCode(user.id, user.email);

    if (!result.allowed) {
      const retryAfter = result.retryAfterSeconds || 60;
      const message =
        result.reason === 'cooldown'
          ? `Please wait ${retryAfter} seconds before requesting another verification code.`
          : `You have reached the limit of 5 verification code requests per hour. Please try again in ${retryAfter} seconds.`;

      return NextResponse.json(
        {
          success: false,
          message,
          retryAfterSeconds: retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'A new 6-digit verification code has been sent.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Resend verification code error:', error);
    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred while resending the code.' },
      { status: 500 }
    );
  }
}
