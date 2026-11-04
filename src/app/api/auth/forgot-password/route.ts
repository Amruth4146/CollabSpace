import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forgotPasswordSchema } from '@/lib/auth/schemas';
import { normalizeEmail, generateSecureToken, hashToken } from '@/lib/auth/crypto';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const body = await request.json();
    const parseResult = forgotPasswordSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    const { email } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);

    // Rate limiting: 3 reset requests per 15 minutes per IP or email
    const rateLimit = await checkRateLimit(`forgot:${ip}:${normalizedEmail}`, 3, 900);
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Too many recovery requests. Please wait a few minutes before trying again.',
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      const resetTokenRaw = generateSecureToken();
      const resetTokenHash = hashToken(resetTokenRaw);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

      // Invalidate previous unused reset tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: { email: normalizedEmail, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Save new single-use hashed token
      await prisma.passwordResetToken.create({
        data: {
          tokenHash: resetTokenHash,
          email: normalizedEmail,
          userId: user.id,
          expiresAt,
        },
      });

      // Dispatch reset email
      await sendPasswordResetEmail(user.email, user.name, resetTokenRaw).catch((err) => {
        console.error('Failed to dispatch password reset email:', err);
      });
    }

    // Always respond with the same message to prevent account enumeration
    return NextResponse.json({
      success: true,
      message:
        'If an account with that email exists, we have sent recovery instructions.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Failed to process password recovery request. Please try again.' },
      { status: 500 }
    );
  }
}
