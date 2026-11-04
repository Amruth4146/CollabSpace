import { NextResponse } from 'next/server';
import { requireAuthUser, AuthError } from '@/lib/auth/authorization';
import { changePasswordSchema } from '@/lib/auth/schemas';
import { verifyPassword, hashPassword, hashToken } from '@/lib/auth/crypto';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const user = await requireAuthUser();

    const body = await request.json();
    const parseResult = changePasswordSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message || 'Invalid password data.';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { currentPassword, newPassword } = parseResult.data;

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!fullUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const isCurrentValid = await verifyPassword(currentPassword, fullUser.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: 'The current password you provided is incorrect.' },
        { status: 400 }
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate all OTHER sessions for this user, keeping the current session active
    try {
      const cookieStore = await cookies();
      const currentCookie = cookieStore.get(SESSION_COOKIE_NAME);
      if (currentCookie?.value) {
        const currentHash = hashToken(currentCookie.value);
        await prisma.session.deleteMany({
          where: {
            userId: user.id,
            sessionToken: { not: currentHash },
          },
        });
      }
    } catch {
      // Ignore if session lookup fails
    }

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully. All other active sessions have been signed out.',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'Failed to update password.' },
      { status: 500 }
    );
  }
}
