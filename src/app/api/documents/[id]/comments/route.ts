import { NextResponse } from 'next/server';
import { requireAuthUser, verifyDocumentAccess, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { sanitizeHtml } from '@/lib/sanitize';
import { getRedisClient } from '@/lib/redis';
import { z } from 'zod';

const createCommentSchema = z.object({
  text: z.string().trim().min(1, 'Comment text cannot be empty.').max(2000, 'Comment text is too long.'),
  quote: z.string().trim().max(1000).optional(),
  anchorPosition: z.string().max(300).optional(),
  parentId: z.string().uuid().optional(),
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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId } = await context.params;

    // Viewers and above can read authorized comments
    const { permissions, userRole } = await verifyDocumentAccess(user.id, documentId, 'viewer');

    const rawComments = await prisma.comment.findMany({
      where: {
        documentId,
        parentId: null, // Only fetch root threads; replies nested
      },
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
      orderBy: { createdAt: 'desc' },
      take: 100, // Reasonable result limit
    });

    const comments = rawComments.map((c) => ({
      id: c.id,
      documentId: c.documentId,
      author: {
        id: c.author.id,
        name: c.author.name,
        email: c.author.email,
        avatar: c.author.avatar || '',
        role: userRole,
        color: pickColor(c.author.id),
        status: 'online' as const,
      },
      text: c.text,
      createdAt: formatRelativeTime(c.createdAt),
      updatedAt: c.updatedAt.toISOString(),
      resolved: c.resolved,
      resolvedAt: c.resolvedAt?.toISOString() || null,
      resolvedBy: c.resolvedBy
        ? {
            id: c.resolvedBy.id,
            name: c.resolvedBy.name,
            email: c.resolvedBy.email,
            avatar: c.resolvedBy.avatar || '',
            role: 'editor' as const,
            color: pickColor(c.resolvedBy.id),
            status: 'online' as const,
          }
        : null,
      selectedTextSnippet: c.quote || undefined,
      anchorPosition: c.anchorPosition || null,
      replies: c.replies.map((r) => ({
        id: r.id,
        commentId: c.id,
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
    }));

    return NextResponse.json({
      comments,
      canComment: permissions.canComment,
      userRole,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Fetch comments error:', error);
    return NextResponse.json({ error: 'Failed to fetch comments.' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId } = await context.params;

    // Must have comment permission (Commenter, Editor, Admin, Owner)
    const { permissions, userRole } = await verifyDocumentAccess(user.id, documentId, 'viewer');
    if (!permissions.canComment) {
      return NextResponse.json(
        { error: 'You do not have permission to comment on this document.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parseResult = createCommentSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid comment input.' },
        { status: 400 }
      );
    }

    const { text, quote, anchorPosition, parentId } = parseResult.data;

    // If this is a reply, verify parent comment exists in the same document
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parentComment || parentComment.documentId !== documentId) {
        return NextResponse.json({ error: 'Parent comment thread not found in this document.' }, { status: 404 });
      }
      if (parentComment.resolved) {
        return NextResponse.json({ error: 'Cannot reply to a resolved thread. Please reopen it first.' }, { status: 400 });
      }
    }

    const sanitizedText = sanitizeHtml(text);

    const created = await prisma.comment.create({
      data: {
        documentId,
        authorId: user.id,
        text: sanitizedText,
        quote: quote ? sanitizeHtml(quote) : null,
        anchorPosition: anchorPosition || null,
        parentId: parentId || null,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    const formattedComment = {
      id: created.id,
      documentId: created.documentId,
      parentId: created.parentId,
      author: {
        id: created.author.id,
        name: created.author.name,
        email: created.author.email,
        avatar: created.author.avatar || '',
        role: userRole,
        color: pickColor(created.author.id),
        status: 'online' as const,
      },
      text: created.text,
      createdAt: formatRelativeTime(created.createdAt),
      updatedAt: created.updatedAt.toISOString(),
      resolved: created.resolved,
      selectedTextSnippet: created.quote || undefined,
      anchorPosition: created.anchorPosition || null,
      replies: [],
    };

    // Broadcast comment update via Redis PubSub for real-time peer synchronization
    try {
      const redis = getRedisClient();
      await redis.publish(
        'collab:comments',
        JSON.stringify({
          action: parentId ? 'reply_added' : 'comment_created',
          docId: documentId,
          commentId: created.id,
          parentId: created.parentId,
          comment: formattedComment,
        })
      );
    } catch (e) {
      console.warn('[Comments API] Redis notification skipped:', e);
    }

    return NextResponse.json({ success: true, comment: formattedComment }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Create comment error:', error);
    return NextResponse.json({ error: 'Failed to post comment.' }, { status: 500 });
  }
}

