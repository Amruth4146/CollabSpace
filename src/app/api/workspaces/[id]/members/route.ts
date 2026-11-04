import { NextResponse } from 'next/server';
import { requireAuthUser, verifyWorkspaceAccess, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { normalizeEmail, hashPassword, generateSecureToken } from '@/lib/auth/crypto';
import { z } from 'zod';

const inviteMemberSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address.'),
  role: z.enum(['admin', 'editor', 'commenter', 'viewer']).default('editor'),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId } = await context.params;

    // Caller must be a member of the workspace
    await verifyWorkspaceAccess(user.id, workspaceId, 'viewer');

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        user: {
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          avatar: m.user.avatar || '',
          role: m.role,
          color: '#6366F1',
          status: 'online',
        },
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to fetch workspace members.' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId } = await context.params;

    // Only owner or admin can invite / add members
    const { workspace } = await verifyWorkspaceAccess(user.id, workspaceId, 'admin');

    const body = await request.json();
    const parseResult = inviteMemberSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid member invitation data.' },
        { status: 400 }
      );
    }

    const { email, role } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);

    // Find or create target user
    let targetUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!targetUser) {
      // Create user placeholder for invited collaborator
      const temporaryPassword = await hashPassword(generateSecureToken(16));
      const nameFromEmail = normalizedEmail.split('@')[0].replace(/[._-]/g, ' ');
      const capitalizedName = nameFromEmail
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      targetUser = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: capitalizedName || 'Invited Member',
          passwordHash: temporaryPassword,
        },
      });
    }

    // Check if user is already a member
    const existingMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: targetUser.id,
        },
      },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: 'User is already a member of this workspace.' },
        { status: 409 }
      );
    }

    // Add member
    const newMember = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: targetUser.id,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        member: {
          id: newMember.id,
          role: newMember.role,
          joinedAt: newMember.joinedAt.toISOString(),
          user: {
            id: newMember.user.id,
            name: newMember.user.name,
            email: newMember.user.email,
            avatar: newMember.user.avatar || '',
            role: newMember.role,
            color: '#6366F1',
            status: 'online',
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Invite member error:', error);
    return NextResponse.json({ error: 'Failed to add workspace member.' }, { status: 500 });
  }
}
