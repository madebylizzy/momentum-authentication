import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyEmailSchema } from '@/lib/validation';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const validation = verifyEmailSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0]?.message || 'Invalid input';
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const { email, code } = validation.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Invalid email address or verification code.' },
        { status: 400 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        {
          success: true,
          message: 'Your email is already verified. Please sign in.',
          alreadyVerified: true,
        },
        { status: 200 }
      );
    }

    // Query for the specific unconsumed verification code for this user
    const verificationRecord = await prisma.emailVerification.findFirst({
      where: {
        userId: user.id,
        code,
        used: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationRecord) {
      const pastRecord = await prisma.emailVerification.findFirst({
        where: {
          userId: user.id,
          code,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (pastRecord) {
        return NextResponse.json(
          {
            success: false,
            message: 'This verification code has expired or has been replaced by a newer code. Please request a new code.',
            isExpired: true,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid verification code. Please check the 6-digit code and try again.',
        },
        { status: 400 }
      );
    }

    // Check expiry timestamp stored in database (AGENTS.md §9, §9a)
    const now = new Date();
    if (verificationRecord.expiresAt < now) {
      await prisma.emailVerification.update({
        where: { id: verificationRecord.id },
        data: { used: true },
      }).catch(() => {});

      return NextResponse.json(
        {
          success: false,
          message: 'This verification code has expired. Please request a new code.',
          isExpired: true,
        },
        { status: 400 }
      );
    }

    // Mark code as used and set user emailVerified = true in an atomic transaction
    await prisma.$transaction([
      prisma.emailVerification.update({
        where: { id: verificationRecord.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      }),
    ]);

    // Auto-sign-in: Create session immediately upon successful email verification
    const { token, expiresAt } = await createSession(user.id);

    const response = NextResponse.json(
      {
        success: true,
        message: 'Email verified successfully! Redirecting to your dashboard...',
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
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds per AGENTS.md §9a
    });

    return response;
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred during verification.' },
      { status: 500 }
    );
  }
}

