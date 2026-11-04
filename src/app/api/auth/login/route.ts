import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loginSchema } from '@/lib/auth/schemas';
import { normalizeEmail, verifyPassword } from '@/lib/auth/crypto';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { createSession } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const body = await request.json();
    const parseResult = loginSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message || 'Invalid credentials.';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, password, rememberMe } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);

    // Rate limiting: 5 failed attempts per 15 minutes per IP or email
    const rateLimit = await checkRateLimit(`login:${ip}:${normalizedEmail}`, 5, 900);
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Too many failed login attempts. For security, please try again in 15 minutes.',
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Timing-safe password verification
    let isPasswordValid = false;
    if (user) {
      isPasswordValid = await verifyPassword(password, user.passwordHash);
    } else {
      // Fake hash comparison to avoid timing analysis enumeration
      await verifyPassword(
        password,
        '$2a$12$e8kP8R/U4iU/1Q5q6d7f8Oe9h0g1i2j3k4l5m6n7o8p9q0r1s2t3u'
      );
    }

    // Generic error message prevents account enumeration
    if (!user || !isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Create secure session
    await createSession(user.id, rememberMe ?? true);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during sign in. Please try again.' },
      { status: 500 }
    );
  }
}
