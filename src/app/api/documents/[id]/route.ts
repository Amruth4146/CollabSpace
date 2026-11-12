import { NextResponse } from 'next/server';
import { requireAuthUser, verifyDocumentAccess, verifyWorkspaceAccess, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { sanitizeHtml } from '@/lib/sanitize';
import { createCollabTicket } from '@/lib/auth/collab-ticket';
import { publishRevocationEvent } from '@/lib/redis';
import { z } from 'zod';

const updateDocSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty.').max(120).optional(),
  content: z.string().optional(),
  excerpt: z.string().max(300).optional(),
  icon: z.string().max(8).optional(),
  isStarred: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  tags: z.array(z.string().max(30)).optional(),
  workspaceId: z.string().uuid().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId } = await context.params;

    const { userRole, permissions } = await verifyDocumentAccess(user.id, documentId, 'viewer');

    const fullDoc = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        workspace: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
    });

    if (!fullDoc) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    }

    return NextResponse.json({
      document: {
        id: fullDoc.id,
        title: fullDoc.title,
        icon: fullDoc.icon,
        excerpt: fullDoc.excerpt || '',
        content: fullDoc.content,
        workspaceId: fullDoc.workspaceId,
        workspace: fullDoc.workspace,
        isStarred: fullDoc.isStarred,
        isDeleted: fullDoc.isDeleted,
        deletedAt: fullDoc.deletedAt?.toISOString(),
        isArchived: fullDoc.isArchived,
        archivedAt: fullDoc.archivedAt?.toISOString(),
        tags: fullDoc.tags || [],
        createdAt: fullDoc.createdAt.toISOString(),
        updatedAt: fullDoc.updatedAt.toISOString(),
        author: {
          id: fullDoc.author.id,
          name: fullDoc.author.name,
          email: fullDoc.author.email,
          avatar: fullDoc.author.avatar || '',
          role: 'editor',
          color: '#6366F1',
          status: 'online',
        },
        collaborators: [],
      },
      userRole,
      permissions,
      collabToken: createCollabTicket({
        userId: user.id,
        documentId,
        role: userRole,
      }),
      currentUser: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[API/documents/[id]] Error fetching document:', error);
    return NextResponse.json({ error: 'Failed to fetch document.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId } = await context.params;

    // Must have editor permission to modify document
    const { document } = await verifyDocumentAccess(user.id, documentId, 'editor');

    const body = await request.json();
    const parseResult = updateDocSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid update data.' },
        { status: 400 }
      );
    }

    const {
      title,
      content,
      excerpt,
      icon,
      isStarred,
      isDeleted,
      isArchived,
      tags,
      workspaceId: targetWorkspaceId,
    } = parseResult.data;

    const dataToUpdate: Record<string, unknown> = {};

    if (title !== undefined) dataToUpdate.title = title;
    if (content !== undefined) dataToUpdate.content = sanitizeHtml(content);
    if (excerpt !== undefined) dataToUpdate.excerpt = excerpt;
    if (icon !== undefined) dataToUpdate.icon = icon;
    if (isStarred !== undefined) dataToUpdate.isStarred = isStarred;
    if (tags !== undefined) dataToUpdate.tags = tags;

    // Soft delete / trash handling
    if (isDeleted !== undefined) {
      dataToUpdate.isDeleted = isDeleted;
      dataToUpdate.deletedAt = isDeleted ? new Date() : null;
    }

    // Archive handling
    if (isArchived !== undefined) {
      dataToUpdate.isArchived = isArchived;
      dataToUpdate.archivedAt = isArchived ? new Date() : null;
    }

    // Moving document to another workspace
    if (targetWorkspaceId && targetWorkspaceId !== document.workspaceId) {
      // Must verify caller has editor or higher in target workspace
      await verifyWorkspaceAccess(user.id, targetWorkspaceId, 'editor');
      dataToUpdate.workspaceId = targetWorkspaceId;
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: dataToUpdate,
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    // Real-Time Revocation (Finding V31-04):
    // If document was soft-deleted or moved to another workspace, immediately revoke active WebSocket connections
    if (isDeleted === true || (targetWorkspaceId && targetWorkspaceId !== document.workspaceId)) {
      publishRevocationEvent({ action: 'revoke_doc', docId: documentId }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      document: {
        id: updated.id,
        title: updated.title,
        icon: updated.icon,
        excerpt: updated.excerpt || '',
        content: updated.content,
        workspaceId: updated.workspaceId,
        isStarred: updated.isStarred,
        isDeleted: updated.isDeleted,
        deletedAt: updated.deletedAt?.toISOString(),
        isArchived: updated.isArchived,
        archivedAt: updated.archivedAt?.toISOString(),
        tags: updated.tags || [],
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        author: {
          id: updated.author.id,
          name: updated.author.name,
          email: updated.author.email,
          avatar: updated.author.avatar || '',
          role: 'editor',
          color: '#6366F1',
          status: 'online',
        },
        collaborators: [],
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Update document error:', error);
    return NextResponse.json({ error: 'Failed to update document.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId } = await context.params;

    // Must be editor or higher to permanently delete
    await verifyDocumentAccess(user.id, documentId, 'editor');

    await prisma.document.delete({
      where: { id: documentId },
    });

    // Notify all active WebSocket servers to close connections to this deleted document
    publishRevocationEvent({ action: 'revoke_doc', docId: documentId }).catch(() => {});

    return NextResponse.json({ success: true, message: 'Document permanently deleted.' });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to delete document.' }, { status: 500 });
  }
}
