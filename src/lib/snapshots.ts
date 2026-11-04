import { prisma } from './prisma';
import Redis from 'ioredis';

export const MAX_SNAPSHOT_RETENTION = 50;

// Singleton Redis publisher for cross-instance / cross-process collab control
let redisPublisher: Redis | null = null;

function getRedisPublisher(): Redis | null {
  if (redisPublisher) return redisPublisher;
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    redisPublisher = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redisPublisher.connect().catch((err) => {
      console.warn('[Snapshots] Redis publisher connection bypassed:', err.message);
      redisPublisher = null;
    });
    return redisPublisher;
  } catch {
    return null;
  }
}

export interface CreateSnapshotOptions {
  authorId?: string | null;
  changeSummary?: string;
  contentSnapshot?: string;
  yjsSnapshot?: Uint8Array | null;
  title?: string;
  addedCount?: number;
  removedCount?: number;
}

/**
 * Creates a durable snapshot checkpoint of a document in PostgreSQL.
 * Applies the snapshot retention policy (keeps up to MAX_SNAPSHOT_RETENTION versions per document).
 */
export async function createDocumentSnapshot(
  documentId: string,
  options: CreateSnapshotOptions = {}
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // 1. Verify document exists
      const currentDoc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, content: true, yjsState: true, title: true },
      });
      if (!currentDoc) {
        return null;
      }

      // 2. Determine next version number atomically
      const latestVersion = await prisma.documentVersion.findFirst({
        where: { documentId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });

      const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

      // 3. Resolve snapshot payload
      const content = options.contentSnapshot !== undefined ? options.contentSnapshot : currentDoc.content;
      const yjsState = options.yjsSnapshot
        ? Buffer.from(options.yjsSnapshot)
        : currentDoc.yjsState
        ? Buffer.from(currentDoc.yjsState)
        : null;
      const docTitle = options.title !== undefined ? options.title : currentDoc.title;

      // 4. Create the version record
      const version = await prisma.documentVersion.create({
        data: {
          documentId,
          versionNumber: nextVersionNumber,
          title: docTitle || `Version ${nextVersionNumber}`,
          contentSnapshot: content || '<p></p>',
          yjsSnapshot: yjsState,
          changeSummary: options.changeSummary || `Checkpoint v${nextVersionNumber}`,
          authorId: options.authorId || null,
          addedCount: options.addedCount ?? 0,
          removedCount: options.removedCount ?? 0,
        },
        include: {
          author: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
      });

      // 4. Enforce Snapshot Retention Policy
      try {
        const totalVersions = await prisma.documentVersion.count({
          where: { documentId },
        });

        if (totalVersions > MAX_SNAPSHOT_RETENTION) {
          const excess = totalVersions - MAX_SNAPSHOT_RETENTION;
          const oldestToPrune = await prisma.documentVersion.findMany({
            where: { documentId },
            orderBy: { versionNumber: 'asc' },
            take: excess,
            select: { id: true },
          });

          if (oldestToPrune.length > 0) {
            await prisma.documentVersion.deleteMany({
              where: {
                id: { in: oldestToPrune.map((v: { id: string }) => v.id) },
              },
            });
          }
        }
      } catch (pruneErr) {
        console.warn(`[Snapshots] Error enforcing retention policy on document ${documentId}:`, pruneErr);
      }

      return version;
    } catch (err: unknown) {
      const isPrismaUniqueError =
        typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002';
      if (isPrismaUniqueError && attempt < 4) {
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1) + Math.random() * 30));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to create document snapshot after retries.');
}

/**
 * Safely restores a document to a prior snapshot.
 * 1. Takes an automatic safety snapshot of current document state.
 * 2. Updates PostgreSQL document state.
 * 3. Broadcasts safe collaborative restore event to active WebSocket collaboration rooms.
 */
export async function restoreDocumentSnapshot(
  documentId: string,
  versionId: string,
  restoringUserId: string
) {
  // 1. Fetch target version
  const targetVersion = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId },
    include: {
      author: {
        select: { id: true, name: true, email: true, avatar: true },
      },
    },
  });

  if (!targetVersion) {
    throw new Error('Version snapshot not found.');
  }

  // 2. Fetch current document state for safety backup
  const currentDoc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, content: true, yjsState: true, title: true },
  });

  if (!currentDoc) {
    throw new Error('Target document not found.');
  }

  // 3. Create Safety Snapshot before applying restore
  const safetySnapshot = await createDocumentSnapshot(documentId, {
    authorId: restoringUserId,
    changeSummary: `Safety backup before reverting to v${targetVersion.versionNumber}`,
    contentSnapshot: currentDoc.content,
    yjsSnapshot: currentDoc.yjsState ? new Uint8Array(currentDoc.yjsState) : null,
    title: `Pre-restore v${targetVersion.versionNumber} backup`,
  });

  // 4. Update Document in PostgreSQL
  const updatedDoc = await prisma.document.update({
    where: { id: documentId },
    data: {
      content: targetVersion.contentSnapshot,
      yjsState: targetVersion.yjsSnapshot ? Buffer.from(targetVersion.yjsSnapshot) : null,
      updatedAt: new Date(),
    },
  });

  // 5. Notify active collaboration servers via Redis or direct hook
  const redis = getRedisPublisher();
  if (redis) {
    const payload = JSON.stringify({
      action: 'restore',
      docId: documentId,
      versionId: targetVersion.id,
      versionNumber: targetVersion.versionNumber,
      hasYjsState: Boolean(targetVersion.yjsSnapshot),
    });
    redis.publish('collab:control', payload).catch((err) => {
      console.warn('[Snapshots] Failed to publish restore event to Redis:', err.message);
    });
  }

  return {
    success: true,
    restoredVersion: targetVersion,
    safetyVersion: safetySnapshot,
    updatedDoc,
  };
}

/**
 * Retrieves the version history timeline for a document.
 */
export async function getDocumentVersions(documentId: string) {
  return prisma.documentVersion.findMany({
    where: { documentId },
    include: {
      author: {
        select: { id: true, name: true, email: true, avatar: true },
      },
    },
    orderBy: { versionNumber: 'desc' },
  });
}

/**
 * Retrieves a single version snapshot with full content for preview.
 */
export async function getDocumentVersion(documentId: string, versionId: string) {
  return prisma.documentVersion.findFirst({
    where: { id: versionId, documentId },
    include: {
      author: {
        select: { id: true, name: true, email: true, avatar: true },
      },
    },
  });
}
