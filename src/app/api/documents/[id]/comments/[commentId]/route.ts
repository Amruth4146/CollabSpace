import { NextResponse } from 'next/server';
import { requireAuthUser, verifyDocumentAccess, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { sanitizeHtml } from '@/lib/sanitize';
import { getRedisClient } from '@/lib/redis';
import { z } from 'zod';

const updateCommentSchema = z.object({
  text: z.string().trim().min(1, 'Comment text cannot be empty.').max(2000).optional(),
  resolved: z.boolean().optional(),
});

const COLLAB_COLORS = [
  '#4F46E5', '#7C3AED', '#EC4899', '#10B981', '#F59E0B',
  '#06B6D4', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316'
];

function pickColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId, commentId } = await context.params;

    // Caller must have at least view access to the document
    const { userRole, permissions } = await verifyDocumentAccess(user.id, documentId, 'viewer');

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    if (!comment || comment.documentId !== documentId) {
      return NextResponse.json({ error: 'Comment not found on this document.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const parseResult = updateCommentSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid comment update data.' },
        { status: 400 }
      );
    }

    const { text, resolved } = parseResult.data;
    const updateData: Record<string, unknown> = {};

    // 1. Text editing permission check: only original author may edit comment text
    if (text !== undefined) {
      if (comment.authorId !== user.id) {
        return NextResponse.json(
          { error: 'You do not have permission to edit another user\'s comment.' },
          { status: 403 }
        );
      }
      updateData.text = sanitizeHtml(text);
      updateData.updatedAt = new Date();
    }

    // 2. Resolve / Reopen permission check:
    // Editors, Admins, Owners, or the thread's original author can resolve/reopen
    if (resolved !== undefined) {
      if (!permissions.canComment) {
        // Viewers cannot resolve
        return NextResponse.json(
          { error: 'Viewers do not have permission to resolve comment threads.' },
          { status: 403 }
        );
      }

      const isAuthor = comment.authorId === user.id;
      const canResolve = isAuthor || userRole === 'editor' || userRole === 'admin' || userRole === 'owner';

      if (!canResolve) {
        return NextResponse.json(
          { error: 'You do not have permission to change the resolved status of this thread.' },
          { status: 403 }
        );
      }

      updateData.resolved = resolved;
      updateData.resolvedAt = resolved ? new Date() : null;
      updateData.resolvedById = resolved ? user.id : null;
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: updateData,
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        resolvedBy: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: { id: true, name: true, email: true, avatar: true },
            },
          },
        },
      },
    });

    const formattedComment = {
      id: updated.id,
      documentId: updated.documentId,
      parentId: updated.parentId,
      author: {
        id: updated.author.id,
        name: updated.author.name,
        email: updated.author.email,
        avatar: updated.author.avatar || '',
        role: userRole,
        color: pickColor(updated.author.id),
        status: 'online' as const,
      },
      text: updated.text,
      createdAt: formatRelativeTime(updated.createdAt),
      updatedAt: updated.updatedAt.toISOString(),
      resolved: updated.resolved,
      resolvedAt: updated.resolvedAt?.toISOString() || null,
      resolvedBy: updated.resolvedBy
        ? {
            id: updated.resolvedBy.id,
            name: updated.resolvedBy.name,
            email: updated.resolvedBy.email,
            avatar: updated.resolvedBy.avatar || '',
            role: 'editor' as const,
            color: pickColor(updated.resolvedBy.id),
            status: 'online' as const,
          }
        : null,
      selectedTextSnippet: updated.quote || undefined,
      anchorPosition: updated.anchorPosition || null,
      replies: updated.replies.map((r) => ({
        id: r.id,
        commentId: updated.id,
        author: {
          id: r.author.id,
          name: r.author.name,
          email: r.author.email,
          avatar: r.author.avatar || '',
          role: 'editor' as const,
          color: pickColor(r.author.id),
          status: 'online' as const,
        },
        text: r.text,
        createdAt: formatRelativeTime(r.createdAt),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };

    // Broadcast update via Redis
    try {
      const redis = getRedisClient();
      await redis.publish(
        'collab:comments',
        JSON.stringify({
          action: 'comment_updated',
          docId: documentId,
          commentId: updated.id,
          comment: formattedComment,
        })
      );
    } catch (e) {
      console.warn('[Comments API] Redis notification skipped:', e);
    }

    return NextResponse.json({ success: true, comment: formattedComment });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Update comment error:', error);
    return NextResponse.json({ error: 'Failed to update comment.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId, commentId } = await context.params;

    const { userRole } = await verifyDocumentAccess(user.id, documentId, 'viewer');

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.documentId !== documentId) {
      return NextResponse.json({ error: 'Comment not found on this document.' }, { status: 404 });
    }

    // Permission check: only comment author OR workspace admin/owner can delete comment
    const isAuthor = comment.authorId === user.id;
    const isManager = userRole === 'owner' || userRole === 'admin';

    if (!isAuthor && !isManager) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this comment.' },
        { status: 403 }
      );
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    // Broadcast deletion via Redis
    try {
      const redis = getRedisClient();
      await redis.publish(
        'collab:comments',
        JSON.stringify({
          action: 'comment_deleted',
          docId: documentId,
          commentId,
          parentId: comment.parentId,
        })
      );
    } catch (e) {
      console.warn('[Comments API] Redis notification skipped:', e);
    }

    return NextResponse.json({ success: true, message: 'Comment deleted successfully.' });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Delete comment error:', error);
    return NextResponse.json({ error: 'Failed to delete comment.' }, { status: 500 });
  }
}

