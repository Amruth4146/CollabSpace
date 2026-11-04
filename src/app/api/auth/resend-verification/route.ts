import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resendVerificationSchema } from '@/lib/auth/schemas';
import { normalizeEmail, generateSecureToken, hashToken } from '@/lib/auth/crypto';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = resendVerificationSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    const { email } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);

    // Rate limit: 1 resend per 60 seconds per email
    const rateLimit = await checkRateLimit(`resend_verify:${normalizedEmail}`, 1, 60);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Please wait at least 60 seconds before requesting another email.' },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user && !user.emailVerified) {
      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Invalidate existing unused tokens
      await prisma.emailVerificationToken.updateMany({
        where: { email: normalizedEmail, usedAt: null },
        data: { usedAt: new Date() },
      });

      await prisma.emailVerificationToken.create({
        data: {
          tokenHash,
          email: normalizedEmail,
          userId: user.id,
          expiresAt,
        },
      });

      await sendVerificationEmail(user.email, user.name, rawToken);
    }

    // Generic safe response
    return NextResponse.json({
      success: true,
      message: 'If the account exists and is unverified, a new link has been dispatched.',
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { error: 'Failed to process request.' },
      { status: 500 }
    );
  }
}
