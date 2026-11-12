import { NextResponse } from 'next/server';
import { requireAuthUser, verifyWorkspaceAccess, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { publishRevocationEvent } from '@/lib/redis';
import { z } from 'zod';

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'editor', 'commenter', 'viewer']),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId, memberId } = await context.params;

    // Caller must be owner or admin
    const { workspace, userRole } = await verifyWorkspaceAccess(user.id, workspaceId, 'admin');

    const body = await request.json();
    const parseResult = updateRoleSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid role. Must be admin, editor, commenter, or viewer.' },
        { status: 400 }
      );
    }

    const targetMember = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.workspaceId !== workspace.id) {
      return NextResponse.json({ error: 'Workspace member not found.' }, { status: 404 });
    }

    // Cannot modify role of the workspace owner
    if (targetMember.userId === workspace.ownerId) {
      return NextResponse.json(
        { error: 'Cannot modify the role of the workspace owner.' },
        { status: 403 }
      );
    }

    // Only owner can promote or demote admins
    if (targetMember.role === 'admin' && userRole !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can modify an admin member.' },
        { status: 403 }
      );
    }

    const updatedMember = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: parseResult.data.role },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    // Notify all active WebSocket servers about the member role change
    publishRevocationEvent({
      action: 'role_change',
      userId: targetMember.userId,
      newRole: parseResult.data.role,
    }).catch(() => {});

    return NextResponse.json({ success: true, member: updatedMember });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update member role.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId, memberId } = await context.params;

    // First find the target membership
    const targetMember = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { workspace: true },
    });

    if (!targetMember || targetMember.workspaceId !== workspaceId) {
      return NextResponse.json({ error: 'Workspace member not found.' }, { status: 404 });
    }

    const isSelfLeaving = targetMember.userId === user.id;

    if (isSelfLeaving) {
      // User is attempting to leave the workspace
      if (targetMember.workspace.ownerId === user.id) {
        return NextResponse.json(
          { error: 'Workspace owner cannot leave the workspace. You must transfer ownership or delete the workspace.' },
          { status: 400 }
        );
      }

      await prisma.workspaceMember.delete({
        where: { id: memberId },
      });

      publishRevocationEvent({ action: 'revoke_user', userId: targetMember.userId }).catch(() => {});

      return NextResponse.json({ success: true, message: 'You have left the workspace.' });
    }

    // Caller is removing someone else -> caller must be owner or admin
    const { workspace, userRole } = await verifyWorkspaceAccess(user.id, workspaceId, 'admin');

    // Cannot remove the workspace owner
    if (targetMember.userId === workspace.ownerId) {
      return NextResponse.json(
        { error: 'The workspace owner cannot be removed.' },
        { status: 403 }
      );
    }

    // Admins cannot remove other admins (only owner can)
    if (targetMember.role === 'admin' && userRole !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can remove an administrator.' },
        { status: 403 }
      );
    }

    await prisma.workspaceMember.delete({
      where: { id: memberId },
    });

    publishRevocationEvent({ action: 'revoke_user', userId: targetMember.userId }).catch(() => {});

    return NextResponse.json({ success: true, message: 'Member removed from workspace.' });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to remove member.' }, { status: 500 });
  }
}
