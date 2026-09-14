import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { resetPasswordSchema } from '@/lib/validation';
import { hashPassword, validatePasswordResetToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const validation = resetPasswordSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.errors[0]?.message || 'Invalid input';
      return NextResponse.json(
        { success: false, message: firstError },
        { status: 400 }
      );
    }

    const { token, password } = validation.data;

    // 1. Validate reset token against database (single-use + time-limited)
    const tokenValidation = await validatePasswordResetToken(token);
    if (!tokenValidation.valid || !tokenValidation.record) {
      return NextResponse.json(
        { success: false, message: tokenValidation.error || 'Invalid or expired reset token.' },
        { status: 400 }
      );
    }

    const resetRecord = tokenValidation.record;

    // 2. Hash new password with bcrypt cost 12
    const passwordHash = await hashPassword(password);

    // 3. Atomically consume token, update password, and revoke all existing sessions
    // Note: Email verification status is strictly decoupled and untouched by password resets.
    await prisma.$transaction([
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash,
        },
      }),
      prisma.session.deleteMany({
        where: { userId: resetRecord.userId },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        message: 'Your password has been successfully reset! You can now sign in with your new password.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred while resetting your password.' },
      { status: 500 }
    );
  }
}
