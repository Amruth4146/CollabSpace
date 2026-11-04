import { NextResponse } from 'next/server';
import { requireAuthUser, verifyWorkspaceAccess, AuthError } from '@/lib/auth/authorization';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(50).optional(),
  icon: z.string().max(8).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and dashes.')
    .optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId } = await context.params;

    const { workspace, userRole } = await verifyWorkspaceAccess(user.id, workspaceId, 'viewer');

    const counts = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: {
        _count: {
          select: { documents: true, members: true },
        },
      },
    });

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        icon: workspace.icon,
        plan: workspace.plan,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        documentCount: counts?._count.documents || 0,
        membersCount: counts?._count.members || 0,
        role: userRole,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to fetch workspace.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId } = await context.params;

    // Only owner or admin can update workspace details
    const { workspace } = await verifyWorkspaceAccess(user.id, workspaceId, 'admin');

    const body = await request.json();
    const parseResult = updateWorkspaceSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid workspace update data.' },
        { status: 400 }
      );
    }

    const { name, icon, slug } = parseResult.data;

    // Check slug uniqueness if slug is being changed
    if (slug && slug !== workspace.slug) {
      const existingSlug = await prisma.workspace.findUnique({
        where: { slug },
      });
      if (existingSlug) {
        return NextResponse.json(
          { error: 'Workspace URL slug is already taken. Please choose another.' },
          { status: 409 }
        );
      }
    }

    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        ...(name ? { name } : {}),
        ...(icon ? { icon } : {}),
        ...(slug ? { slug } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      workspace: updatedWorkspace,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to update workspace.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: workspaceId } = await context.params;

    // Only the workspace owner can delete a workspace
    const { workspace } = await verifyWorkspaceAccess(user.id, workspaceId, 'owner');

    // Optional confirmation check from body
    let body: { confirmName?: string } = {};
    try {
      body = (await request.json()) as { confirmName?: string };
    } catch {
      // Empty body is okay if confirmation was performed client-side
    }

    if (body.confirmName && body.confirmName !== workspace.name) {
      return NextResponse.json(
        { error: `Confirmation name does not match "${workspace.name}".` },
        { status: 400 }
      );
    }

    // Cascade delete in PostgreSQL
    await prisma.workspace.delete({
      where: { id: workspace.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Workspace successfully deleted.',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to delete workspace.' }, { status: 500 });
  }
}
