import { NextResponse } from 'next/server';
import { requireAuthUser, verifyDocumentAccess, AuthError } from '@/lib/auth/authorization';
import { restoreDocumentSnapshot } from '@/lib/snapshots';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId, versionId } = await context.params;

    // Strict Authorization: Must have editor permission or higher to restore versions
    await verifyDocumentAccess(user.id, documentId, 'editor');

    const result = await restoreDocumentSnapshot(documentId, versionId, user.id);

    return NextResponse.json({
      success: true,
      message: `Successfully restored document to version ${result.restoredVersion.versionNumber}.`,
      restoredVersion: {
        id: result.restoredVersion.id,
        versionNumber: `v${result.restoredVersion.versionNumber}`,
        rawVersion: result.restoredVersion.versionNumber,
        title: result.restoredVersion.title,
        contentSnapshot: result.restoredVersion.contentSnapshot,
        createdAt: result.restoredVersion.createdAt.toISOString(),
      },
      safetyVersion: result.safetyVersion
        ? {
            id: result.safetyVersion.id,
            versionNumber: `v${result.safetyVersion.versionNumber}`,
            rawVersion: result.safetyVersion.versionNumber,
            title: result.safetyVersion.title,
            summary: result.safetyVersion.changeSummary,
            createdAt: result.safetyVersion.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Failed to restore document version.';
    const status = message.includes('not found') ? 404 : 500;
    console.error('Restore version error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
