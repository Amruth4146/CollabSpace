import { NextResponse } from 'next/server';
import { requireAuthUser, verifyDocumentAccess, AuthError } from '@/lib/auth/authorization';
import { getDocumentVersions, createDocumentSnapshot } from '@/lib/snapshots';
import { z } from 'zod';

const createVersionSchema = z.object({
  title: z.string().trim().max(100).optional(),
  changeSummary: z.string().trim().max(300).optional(),
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

    // Viewers and above can access version timeline
    await verifyDocumentAccess(user.id, documentId, 'viewer');

    const versions = await getDocumentVersions(documentId);

    return NextResponse.json({
      versions: versions.map((v: (typeof versions)[number]) => ({
        id: v.id,
        versionNumber: `v${v.versionNumber}`,
        rawVersion: v.versionNumber,
        title: v.title || `Version ${v.versionNumber}`,
        timestamp: formatRelativeTime(v.createdAt),
        createdAt: v.createdAt.toISOString(),
        summary: v.changeSummary || `Snapshot checkpoint v${v.versionNumber}`,
        contentSnapshot: v.contentSnapshot,
        changes: {
          added: v.addedCount,
          removed: v.removedCount,
        },
        author: {
          id: v.author?.id || 'sys',
          name: v.author?.name || 'CollabSpace System',
          email: v.author?.email || 'system@collabspace.dev',
          avatar: v.author?.avatar || '',
          color: pickColor(v.author?.id || 'system'),
        },
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Fetch versions error:', error);
    return NextResponse.json({ error: 'Failed to fetch document version history.' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId } = await context.params;

    // Must be editor or higher to create manual version checkpoint
    await verifyDocumentAccess(user.id, documentId, 'editor');

    const body = await request.json().catch(() => ({}));
    const parseResult = createVersionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid version checkpoint data.' },
        { status: 400 }
      );
    }

    const { title, changeSummary } = parseResult.data;

    const version = await createDocumentSnapshot(documentId, {
      authorId: user.id,
      title: title || undefined,
      changeSummary: changeSummary || 'Manual version checkpoint',
    });

    if (!version) {
      return NextResponse.json({ error: 'Failed to create document snapshot' }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        version: {
          id: version.id,
          versionNumber: `v${version.versionNumber}`,
          rawVersion: version.versionNumber,
          title: version.title,
          summary: version.changeSummary,
          createdAt: version.createdAt.toISOString(),
          timestamp: 'Just now',
          contentSnapshot: version.contentSnapshot,
          changes: {
            added: version.addedCount,
            removed: version.removedCount,
          },
          author: {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar || '',
            color: pickColor(user.id),
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Create version error:', error);
    return NextResponse.json({ error: 'Failed to create version checkpoint.' }, { status: 500 });
  }
}
