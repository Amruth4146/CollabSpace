import { NextResponse } from 'next/server';
import { requireAuthUser, verifyWorkspaceAccess, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const createDocSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(120).optional().default('Untitled Document'),
  icon: z.string().max(8).optional().default('📄'),
  tag: z.string().max(30).optional(),
  tags: z.array(z.string().max(30)).optional(),
  content: z.string().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId } = await context.params;

    // Server-side authorization check: user must belong to workspace
    await verifyWorkspaceAccess(user.id, workspaceId, 'viewer');

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() || '';
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'starred' | 'trash' | 'archived' | 'recent' | 'shared'
    const sort = searchParams.get('sort') || 'updated'; // 'updated' | 'created' | 'name'
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    const tag = searchParams.get('tag')?.trim() || '';

    const where: Prisma.DocumentWhereInput = {
      workspaceId,
    };

    // Filter handling
    if (filter === 'trash') {
      where.isDeleted = true;
    } else if (filter === 'archived') {
      where.isDeleted = false;
      where.isArchived = true;
    } else {
      where.isDeleted = false;
      where.isArchived = false;

      if (filter === 'starred') {
        where.isStarred = true;
      } else if (filter === 'recent') {
        // Updated within the last 14 days
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        where.updatedAt = { gte: twoWeeksAgo };
      } else if (filter === 'shared') {
        where.authorId = { not: user.id };
      }
    }

    if (tag) {
      where.tags = { has: tag };
    }

    if (q) {
      where.AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
            { excerpt: { contains: q, mode: 'insensitive' } },
            { tags: { has: q } },
          ],
        },
      ];
    }

    // Sort mapping
    let orderBy: Prisma.DocumentOrderByWithRelationInput = { updatedAt: order };
    if (sort === 'name') {
      orderBy = { title: order };
    } else if (sort === 'created') {
      orderBy = { createdAt: order };
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy,
    });

    return NextResponse.json({
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        icon: doc.icon,
        excerpt: doc.excerpt || 'No description provided.',
        content: doc.content,
        workspaceId: doc.workspaceId,
        isStarred: doc.isStarred,
        isDeleted: doc.isDeleted,
        deletedAt: doc.deletedAt?.toISOString(),
        isArchived: doc.isArchived,
        archivedAt: doc.archivedAt?.toISOString(),
        tags: doc.tags || [],
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        author: {
          id: doc.author.id,
          name: doc.author.name,
          email: doc.author.email,
          avatar: doc.author.avatar || '',
          role: 'editor',
          color: '#6366F1',
          status: 'online',
        },
        collaborators: [],
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Fetch documents error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch documents.' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId } = await context.params;

    // Server-side authorization check: role must be editor or higher
    await verifyWorkspaceAccess(user.id, workspaceId, 'editor');

    const body = await request.json();
    const parseResult = createDocSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid document data.' },
        { status: 400 }
      );
    }

    const { title, icon, tag, tags, content } = parseResult.data;

    let initialTags: string[] = ['General'];
    if (tags && tags.length > 0) {
      initialTags = tags;
    } else if (tag) {
      initialTags = [tag];
    }

    const initialContent = content || `<h1>${title}</h1><p>Start writing here...</p>`;

    const document = await prisma.document.create({
      data: {
        title,
        icon,
        content: initialContent,
        excerpt: 'New collaborative document created in CollabSpace.',
        workspaceId,
        authorId: user.id,
        tags: initialTags,
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
          id: document.id,
          title: document.title,
          icon: document.icon,
          excerpt: document.excerpt || '',
          content: document.content,
          workspaceId: document.workspaceId,
          isStarred: document.isStarred,
          isDeleted: document.isDeleted,
          isArchived: document.isArchived,
          tags: document.tags,
          createdAt: document.createdAt.toISOString(),
          updatedAt: document.updatedAt.toISOString(),
          author: {
            id: document.author.id,
            name: document.author.name,
            email: document.author.email,
            avatar: document.author.avatar || '',
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
    console.error('Create document error:', error);
    return NextResponse.json({ error: 'Failed to create document.' }, { status: 500 });
  }
}
