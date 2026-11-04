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

    // Must have editor or higher permission to restore from trash
    await verifyDocumentAccess(user.id, documentId, 'editor');

    const restored = await prisma.document.update({
      where: { id: documentId },
      data: {
        isDeleted: false,
        deletedAt: null,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Document successfully restored from Trash.',
      document: {
        id: restored.id,
        title: restored.title,
        isDeleted: restored.isDeleted,
        updatedAt: restored.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Trash recovery error:', error);
    return NextResponse.json({ error: 'Failed to recover document from Trash.' }, { status: 500 });
  }
}
