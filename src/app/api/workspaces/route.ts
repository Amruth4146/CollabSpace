import { NextResponse } from 'next/server';
import { requireAuthUser, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(50),
  icon: z.string().max(8).optional().default('🚀'),
});

export async function GET() {
  try {
    const user = await requireAuthUser();

    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      include: {
        members: {
          select: { role: true, userId: true },
        },
        _count: {
          select: { documents: true, members: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      workspaces: workspaces.map((ws) => {
        const membership = ws.members.find((m) => m.userId === user.id);
        const role = ws.ownerId === user.id ? 'owner' : membership?.role || 'viewer';
        return {
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          icon: ws.icon,
          plan: ws.plan,
          role,
          documentCount: ws._count.documents,
          membersCount: ws._count.members,
        };
      }),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to fetch workspaces.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthUser();
    const body = await request.json();
    const parseResult = createWorkspaceSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid workspace data.' },
        { status: 400 }
      );
    }

    const { name, icon } = parseResult.data;
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
    const slug = `${slugBase}-${Math.random().toString(36).substring(2, 6)}`;

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          name,
          slug,
          icon,
          ownerId: user.id,
          plan: 'Free',
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId: user.id,
          role: 'owner',
        },
      });

      return ws;
    });

    return NextResponse.json({ success: true, workspace }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to create workspace.' }, { status: 500 });
  }
}
