import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyEmailSchema } from '@/lib/auth/schemas';
import { hashToken } from '@/lib/auth/crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = verifyEmailSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Verification token is required.' },
        { status: 400 }
      );
    }

    const { token } = parseResult.data;
    const tokenHash = hashToken(token);

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt !== null || record.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: 'This verification link is invalid or has expired.' },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { email: record.email },
        data: { emailVerified: new Date() },
      });

      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Your email has been verified successfully!',
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify email address.' },
      { status: 500 }
    );
  }
}
