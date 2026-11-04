import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const sessionData = await getCurrentSession();

    if (!sessionData) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: sessionData.user.id },
          { members: { some: { userId: sessionData.user.id } } },
        ],
      },
      include: {
        members: {
          select: {
            role: true,
            userId: true,
          },
        },
        _count: {
          select: {
            documents: true,
            members: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      authenticated: true,
      user: sessionData.user,
      workspaces: workspaces.map((ws) => {
        const membership = ws.members.find((m) => m.userId === sessionData.user.id);
        const role = ws.ownerId === sessionData.user.id ? 'owner' : membership?.role || 'viewer';
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
    console.error('Check auth error:', error);
    return NextResponse.json(
      { authenticated: false, error: 'Failed to verify session' },
      { status: 500 }
    );
  }
}
