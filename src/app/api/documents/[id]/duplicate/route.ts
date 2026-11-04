import { NextResponse } from 'next/server';
import { requireAuthUser, verifyDocumentAccess, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId } = await context.params;

    // Caller must have editor permission on the source document
    const { document: originalDoc } = await verifyDocumentAccess(user.id, documentId, 'editor');

    const fullDoc = await prisma.document.findUnique({
      where: { id: originalDoc.id },
    });

    if (!fullDoc) {
      return NextResponse.json({ error: 'Original document not found.' }, { status: 404 });
    }

    const duplicateTitle = `${fullDoc.title} (Copy)`;

    const duplicated = await prisma.document.create({
      data: {
        title: duplicateTitle,
        icon: fullDoc.icon,
        content: fullDoc.content,
        excerpt: fullDoc.excerpt,
        workspaceId: fullDoc.workspaceId,
        authorId: user.id,
        tags: fullDoc.tags,
        isStarred: false,
        isDeleted: false,
        isArchived: false,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        document: {
          id: duplicated.id,
          title: duplicated.title,
          icon: duplicated.icon,
          excerpt: duplicated.excerpt || '',
          content: duplicated.content,
          workspaceId: duplicated.workspaceId,
          isStarred: duplicated.isStarred,
          isDeleted: duplicated.isDeleted,
          isArchived: duplicated.isArchived,
          tags: duplicated.tags,
          createdAt: duplicated.createdAt.toISOString(),
          updatedAt: duplicated.updatedAt.toISOString(),
          author: {
            id: duplicated.author.id,
            name: duplicated.author.name,
            email: duplicated.author.email,
            avatar: duplicated.author.avatar || '',
            role: 'editor',
            color: '#6366F1',
            status: 'online',
          },
          collaborators: [],
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Duplicate document error:', error);
    return NextResponse.json({ error: 'Failed to duplicate document.' }, { status: 500 });
  }
}
