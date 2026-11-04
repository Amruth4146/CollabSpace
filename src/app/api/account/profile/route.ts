import { NextResponse } from 'next/server';
import { requireAuthUser, AuthError } from '@/lib/auth/authorization';
import { updateProfileSchema } from '@/lib/auth/schemas';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const user = await requireAuthUser();

    const body = await request.json();
    const parseResult = updateProfileSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message || 'Invalid profile data.';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { name, avatar } = parseResult.data;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        avatar: avatar || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        emailVerified: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'Profile updated successfully.',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Failed to update profile.' },
      { status: 500 }
    );
  }
}
