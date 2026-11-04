import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resetPasswordSchema } from '@/lib/auth/schemas';
import { hashToken, hashPassword } from '@/lib/auth/crypto';
import { createSession, destroyAllUserSessions } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = resetPasswordSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message || 'Invalid password data.';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { token, password } = parseResult.data;
    const tokenHash = hashToken(token);

    // Find valid, unexpired, unused reset token
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetRecord || resetRecord.usedAt !== null || resetRecord.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: 'This password reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    const newPasswordHash = await hashPassword(password);

    // Atomically update password and consume token
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { email: resetRecord.email },
        data: { passwordHash: newPasswordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      });
    });

    // Invalidate all prior sessions for security
    if (resetRecord.userId) {
      await destroyAllUserSessions(resetRecord.userId);
      // Create new fresh session
      await createSession(resetRecord.userId, true);
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been reset successfully. You are now signed in.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while resetting your password.' },
      { status: 500 }
    );
  }
}
