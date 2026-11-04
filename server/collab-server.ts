/**
 * CollabSpace Dedicated WebSocket Collaboration Server
 * 
 * Powered by Yjs CRDTs, y-protocols, WebSocket (ws), Redis, and PostgreSQL (Prisma).
 * 
 * Guarantees:
 * 1. Authenticated WebSocket connections via session tokens or cookies.
 * 2. Strict RBAC authorization before joining rooms (Owner, Admin, Editor = read/write; Viewer = read-only).
 * 3. Read-only wire protocol enforcement (mutations from viewers are dropped and permission denied is emitted).
 * 4. Durable PostgreSQL persistence via debounced binary Yjs snapshots (yjsState).
 * 5. Safe graceful shutdown: flushes all pending document changes before exit, eliminating lost updates.
 * 6. Ephemeral awareness / presence (cursors, selections, active peer list) never saved to document content.
 * 7. Redis PubSub coordination for seamless multi-instance scaling.
 */

import http from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as authProtocol from 'y-protocols/auth';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import Redis from 'ioredis';
import { prisma } from '../src/lib/prisma';
import { validateSessionToken } from '../src/lib/auth/session';
import { verifyDocumentAccess, AuthError } from '../src/lib/auth/authorization';
import { createDocumentSnapshot } from '../src/lib/snapshots';

// Standard y-websocket wire protocol message codes + custom CollabSpace extensions
const messageSync = 0;
const messageAwareness = 1;
const messageAuth = 2;
const messageComment = 3;

// Max binary payload size: 5MB
const MAX_MESSAGE_SIZE = 5 * 1024 * 1024;

// Unique instance ID for Redis multi-instance deduplication
export let INSTANCE_ID = Math.random().toString(36).substring(2, 10);

interface ClientContext {
  docId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userColor: string;
  role: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  canWrite: boolean;
  controlledUserIds: Set<number>;
  isAlive: boolean;
  messageCount: number;
  messageWindowStart: number;
}

export class WSSharedDoc extends Y.Doc {
  name: string;
  conns: Map<WebSocket, Set<number>>;
  awareness: awarenessProtocol.Awareness;
  saveTimeout: NodeJS.Timeout | null = null;
  isSaving: boolean = false;
  isDirty: boolean = false;
  lastSnapshotTime: number = Date.now();
  updatesSinceSnapshot: number = 0;
  lastAuthorId: string | null = null;
  isRestoring: boolean = false;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    // Broadcast awareness updates to all connected peers in this room
    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        const changedClients = added.concat(updated, removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
        );
        const buff = encoding.toUint8Array(encoder);
        this.conns.forEach((_, conn) => {
          if (conn !== origin && conn.readyState === WebSocket.OPEN) {
            conn.send(buff);
          }
        });

        // Broadcast awareness to Redis for cross-instance presence coordination
        if (origin !== 'redis' && redisPub) {
          const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
          const prefix = Buffer.alloc(8);
          prefix.write(INSTANCE_ID.padEnd(8, ' '), 'utf-8');
          const payload = Buffer.concat([prefix, Buffer.from(awarenessUpdate)]);
          redisPub.publish(`collab:awareness:${this.name}`, payload).catch(() => {});
        }
      }
    );
  }
}

// In-memory document cache: docId -> WSSharedDoc
export const docs = new Map<string, WSSharedDoc>();

// Redis client singletons
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

function initRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    redisPub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redisSub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

    redisPub.connect().catch((err) => {
      console.warn('[CollabServer] Redis Pub connection bypassed:', err.message);
      redisPub = null;
    });

    redisSub.connect().then(() => {
      redisSub?.subscribe('collab:control', 'collab:comments').catch(() => {});
      redisSub?.on('messageBuffer', async (channelBuffer, messageBuffer) => {
        const channel = channelBuffer.toString();

        // Real-time comment event distribution channel
        if (channel === 'collab:comments') {
          try {
            const raw = messageBuffer.toString('utf-8');
            const data = JSON.parse(raw);
            const liveDoc = docs.get(data.docId);
            if (liveDoc) {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, messageComment);
              encoding.writeVarString(encoder, raw);
              const buff = encoding.toUint8Array(encoder);
              liveDoc.conns.forEach((_, conn) => {
                if (conn.readyState === WebSocket.OPEN) {
                  conn.send(buff);
                }
              });
            }
          } catch (e) {
            console.warn('[CollabServer] Error broadcasting comment update:', e);
          }
          return;
        }

        // Control channel for cross-process operations like safe restore
        if (channel === 'collab:control') {
          try {
            const data = JSON.parse(messageBuffer.toString('utf-8'));
            if (data.action === 'restore' && data.docId && data.versionId) {
              const liveDoc = docs.get(data.docId);
              if (liveDoc) {
                const ver = await prisma.documentVersion.findUnique({
                  where: { id: data.versionId },
                });
                if (ver) {
                  await applySafeCollabRestore(
                    data.docId,
                    ver.yjsSnapshot ? new Uint8Array(ver.yjsSnapshot) : null,
                    ver.contentSnapshot
                  );
                }
              }
            }
          } catch (e) {
            console.warn('[CollabServer] Error handling collab:control message:', e);
          }
          return;
        }

        if (channel.startsWith('collab:awareness:')) {
          const docId = channel.slice('collab:awareness:'.length);
          const doc = docs.get(docId);
          if (doc && messageBuffer.length > 8) {
            const senderInstance = messageBuffer.subarray(0, 8).toString('utf-8');
            if (senderInstance !== INSTANCE_ID) {
              const awarenessUpdate = new Uint8Array(messageBuffer.subarray(8));
              awarenessProtocol.applyAwarenessUpdate(doc.awareness, awarenessUpdate, 'redis');
            }
          }
          return;
        }

        if (channel.startsWith('collab:doc:')) {
          const docId = channel.slice('collab:doc:'.length);
          const doc = docs.get(docId);
          if (doc && messageBuffer.length > 8) {
            const senderInstance = messageBuffer.subarray(0, 8).toString('utf-8');
            if (senderInstance !== INSTANCE_ID) {
              const update = new Uint8Array(messageBuffer.subarray(8));
              Y.applyUpdate(doc, update, 'redis');
            }
          }
        }
      });
    }).catch((err) => {
      console.warn('[CollabServer] Redis Sub connection bypassed:', err.message);
      redisSub = null;
    });
  } catch (err) {
    console.warn('[CollabServer] Redis initialization bypassed; running in single-node mode:', err);
  }
}

/**
 * Safely restores an active collaborative document session without desyncing connected clients.
 * Uses an atomic Yjs transaction on the live WSSharedDoc to atomically replace the root fragment
 * elements with deep-cloned elements from the restored snapshot.
 * This generates a clean CRDT differential update that is broadcast to all active peers.
 */
export async function applySafeCollabRestore(
  docId: string,
  targetYjsSnapshot: Uint8Array | null,
  htmlContent: string
): Promise<boolean> {
  const doc = docs.get(docId);
  if (!doc) {
    return false;
  }

  // Concurrency control: serialize concurrent restore requests
  while (doc.isRestoring) {
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  doc.isRestoring = true;

  try {
    if (targetYjsSnapshot && targetYjsSnapshot.length > 0) {
      const tempDoc = new Y.Doc();
      Y.applyUpdate(tempDoc, targetYjsSnapshot);
      const sourceFragment = tempDoc.getXmlFragment('default');

      doc.transact(() => {
        const liveFragment = doc.getXmlFragment('default');
        const currentLength = liveFragment.length;
        if (currentLength > 0) {
          liveFragment.delete(0, currentLength);
        }

        for (let i = 0; i < sourceFragment.length; i++) {
          const item = sourceFragment.get(i);
          liveFragment.push([item.clone()]);
        }
      }, 'restore');

      tempDoc.destroy();
    } else {
      doc.transact(() => {
        const liveFragment = doc.getXmlFragment('default');
        const currentLength = liveFragment.length;
        if (currentLength > 0) {
          liveFragment.delete(0, currentLength);
        }
        const p = new Y.XmlElement('paragraph');
        const stripped = htmlContent.replace(/<[^>]*>?/gm, '');
        p.insert(0, [new Y.XmlText(stripped)]);
        liveFragment.push([p]);
      }, 'restore');
    }

    // Immediately persist restored state
    await persistDocument(doc);
    console.log(`[CollabServer] Safely applied collaborative restore to live document room: ${docId}`);
    return true;
  } catch (err) {
    console.error(`[CollabServer] Error during safe collab restore of ${docId}:`, err);
    throw err;
  } finally {
    doc.isRestoring = false;
  }
}

/**
 * Persists document binary state to PostgreSQL.
 */
export async function persistDocument(doc: WSSharedDoc): Promise<void> {
  if (doc.saveTimeout) {
    clearTimeout(doc.saveTimeout);
    doc.saveTimeout = null;
  }

  // Do not attempt to persist mock demo documents to PostgreSQL
  if (doc.name.startsWith('doc-') || doc.name === 'demo') {
    doc.isDirty = false;
    return;
  }

  if (doc.isSaving) return;
  doc.isSaving = true;

  try {
    // Redis distributed lock to coordinate leader persistence across instances
    if (redisPub) {
      const lockKey = `collab:lock:persist:${doc.name}`;
      const acquired = await redisPub.set(lockKey, INSTANCE_ID, 'PX', 1200, 'NX').catch(() => null);
      if (acquired !== 'OK' && acquired !== null) {
        doc.isDirty = false;
        return;
      }
    }

    // Check document exists in DB before updating
    const existing = await prisma.document.findUnique({
      where: { id: doc.name },
      select: { id: true },
    });
    if (!existing) {
      doc.isDirty = false;
      return;
    }

    const encodedState = Y.encodeStateAsUpdate(doc);
    await prisma.document.update({
      where: { id: doc.name },
      data: {
        yjsState: Buffer.from(encodedState),
        updatedAt: new Date(),
      },
    });
    doc.isDirty = false;
    console.log(`[CollabServer] Persisted document ${doc.name} (${encodedState.length} bytes) to PostgreSQL`);

    // Periodic autosave snapshot
    if (
      doc.updatesSinceSnapshot >= 15 ||
      (Date.now() - doc.lastSnapshotTime >= 60000 && doc.updatesSinceSnapshot > 0)
    ) {
      doc.updatesSinceSnapshot = 0;
      doc.lastSnapshotTime = Date.now();
      createDocumentSnapshot(doc.name, {
        yjsSnapshot: encodedState,
        authorId: doc.lastAuthorId,
        changeSummary: 'Periodic autosave snapshot',
      }).catch((snapErr: unknown) => {
        if ((snapErr as { code?: string })?.code !== 'P2003' && (snapErr as { code?: string })?.code !== 'P2025') {
          console.warn(`[CollabServer] Periodic snapshot failed for ${doc.name}:`, snapErr);
        }
      });
    }
  } catch (err) {
    console.error(`[CollabServer] Error persisting document ${doc.name}:`, err);
  } finally {
    doc.isSaving = false;
  }
}

/**
 * Debounces persistence to prevent excessive database writes during rapid typing.
 */
function schedulePersist(doc: WSSharedDoc, delayMs = 1000) {
  doc.isDirty = true;
  if (doc.saveTimeout) return;

  doc.saveTimeout = setTimeout(async () => {
    doc.saveTimeout = null;
    await persistDocument(doc);
  }, delayMs);
}

/**
 * Loads or creates a shared document instance, restoring persisted Yjs state from PostgreSQL.
 */
export async function getOrCreateDoc(docId: string): Promise<WSSharedDoc> {
  let doc = docs.get(docId);
  if (doc) return doc;

  doc = new WSSharedDoc(docId);
  docs.set(docId, doc);

  // If this is not a mock document, hydrate state from PostgreSQL
  if (!docId.startsWith('doc-') && docId !== 'demo') {
    try {
      const dbDoc = await prisma.document.findUnique({
        where: { id: docId },
        select: { yjsState: true, content: true },
      });

      if (dbDoc?.yjsState && dbDoc.yjsState.length > 0) {
        Y.applyUpdate(doc, new Uint8Array(dbDoc.yjsState));
        console.log(`[CollabServer] Hydrated document ${docId} from PostgreSQL (${dbDoc.yjsState.length} bytes)`);
      }
    } catch (err) {
      console.error(`[CollabServer] Failed to hydrate document ${docId} from DB:`, err);
    }
  }

  // Wire up document mutations: broadcast to peers, publish to Redis, schedule DB save
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    // 1. Broadcast update to local peers in this room
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    doc!.conns.forEach((_, conn) => {
      if (conn !== origin && conn.readyState === WebSocket.OPEN) {
        conn.send(message);
      }
    });

    // 2. Publish to Redis for multi-instance scaling (if not originating from Redis)
    if (origin !== 'redis' && redisPub) {
      const prefix = Buffer.alloc(8);
      prefix.write(INSTANCE_ID.padEnd(8, ' '), 'utf-8');
      const payload = Buffer.concat([prefix, Buffer.from(update)]);
      redisPub.publish(`collab:doc:${docId}`, payload).catch(() => {});
    }

    // 3. Schedule durability write
    doc!.updatesSinceSnapshot++;
    schedulePersist(doc!);
  });

  // Subscribe to Redis updates and awareness for this room
  if (redisSub) {
    redisSub.subscribe(`collab:doc:${docId}`).catch(() => {});
    redisSub.subscribe(`collab:awareness:${docId}`).catch(() => {});
  }

  docs.set(docId, doc);
  return doc;
}

/**
 * Sends a binary message safely to a WebSocket connection.
 */
function send(conn: WebSocket, message: Uint8Array) {
  if (conn.readyState === WebSocket.OPEN) {
    conn.send(message);
  }
}

/**
 * Closes connection with a custom code and reason.
 */
function rejectConnection(conn: WebSocket, code: number, reason: string) {
  console.warn(`[CollabServer] Rejected connection (${code}): ${reason}`);
  try {
    conn.close(code, reason);
  } catch {
    conn.terminate();
  }
}

/**
 * Extracts session token from request query parameters or cookies.
 */
function extractAuthToken(req: http.IncomingMessage, parsedUrl: URL): string | null {
  // 1. From URL query parameter
  const queryToken = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('auth');
  if (queryToken) return queryToken;

  // 2. From Cookie header
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/collabspace_session=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

/**
 * Parses color based on user name/id for visual distinction.
 */
const COLLAB_COLORS = [
  '#4F46E5', '#7C3AED', '#EC4899', '#10B981', '#F59E0B',
  '#06B6D4', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316'
];

function pickColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = (hash << 5) - hash + identifier.charCodeAt(i);
  }
  const idx = Math.abs(hash) % COLLAB_COLORS.length;
  return COLLAB_COLORS[idx];
}

/**
 * Creates the production WebSocket Collaboration Server.
 */
export function createCollabServer(server?: http.Server, customInstanceId?: string): {
  wss: WebSocketServer;
  close: () => Promise<void>;
} {
  if (customInstanceId) {
    INSTANCE_ID = customInstanceId;
  }
  initRedis();

  const wss = new WebSocketServer({
    noServer: !server,
    server: server,
    maxPayload: MAX_MESSAGE_SIZE,
  });

  const connectionContexts = new WeakMap<WebSocket, ClientContext>();

  wss.on('connection', async (conn: WebSocket, req: http.IncomingMessage) => {
    // -------------------------------------------------------------
    // Connection Message Buffering (Prevents dropped packets during async auth/hydration)
    // -------------------------------------------------------------
    const earlyMessageBuffer: (ArrayBuffer | Buffer)[] = [];
    let isInitialized = false;

    const earlyBufferHandler = (msg: ArrayBuffer | Buffer) => {
      if (!isInitialized) {
        earlyMessageBuffer.push(msg);
      }
    };
    conn.on('message', earlyBufferHandler);

    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, 'http://localhost');

    // Extract room / document ID
    const roomParam = parsedUrl.searchParams.get('room');
    const docId = roomParam || parsedUrl.pathname.replace(/^\/collaboration\/?/, '').replace(/^\//, '');

    if (!docId) {
      conn.off('message', earlyBufferHandler);
      return rejectConnection(conn, 4400, 'Missing document ID');
    }

    // -------------------------------------------------------------
    // Security Layer: Origin Verification
    // -------------------------------------------------------------
    const origin = req.headers.origin;
    if (origin && process.env.NODE_ENV === 'production') {
      const allowedAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const allowedHost = new URL(allowedAppUrl).host;
      const requestHost = new URL(origin).host;
      const isLocalhostMatch =
        (allowedHost.startsWith('localhost') || allowedHost.startsWith('127.0.0.1')) &&
        (requestHost.startsWith('localhost') || requestHost.startsWith('127.0.0.1'));

      if (allowedHost !== requestHost && !isLocalhostMatch) {
        conn.off('message', earlyBufferHandler);
        return rejectConnection(conn, 4403, 'Untrusted origin');
      }
    }

    // -------------------------------------------------------------
    // Security Layer: Authentication & Authorization
    // -------------------------------------------------------------
    let context: ClientContext;

    if (docId.startsWith('doc-') || docId === 'demo') {
      // Demo Document Fast-Path for public exploration
      context = {
        docId,
        userId: `demo-user-${Date.now().toString(36)}`,
        userName: 'Demo Collaborator',
        userEmail: 'demo@collabspace.dev',
        userColor: pickColor(docId),
        role: 'editor',
        canWrite: true,
        controlledUserIds: new Set(),
        isAlive: true,
        messageCount: 0,
        messageWindowStart: Date.now(),
      };
    } else {
      // Production Document: Strict Authentication & Workspace Authorization
      const rawToken = extractAuthToken(req, parsedUrl);
      if (!rawToken) {
        conn.off('message', earlyBufferHandler);
        return rejectConnection(conn, 4401, 'Unauthorized: Missing session token');
      }

      const user = await validateSessionToken(rawToken);
      if (!user) {
        conn.off('message', earlyBufferHandler);
        return rejectConnection(conn, 4401, 'Unauthorized: Invalid or expired session');
      }

      try {
        const { userRole } = await verifyDocumentAccess(user.id, docId, 'viewer');
        const canWrite = userRole === 'owner' || userRole === 'admin' || userRole === 'editor';

        context = {
          docId,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userColor: pickColor(user.id),
          role: userRole as 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer',
          canWrite,
          controlledUserIds: new Set(),
          isAlive: true,
          messageCount: 0,
          messageWindowStart: Date.now(),
        };
      } catch (err) {
        conn.off('message', earlyBufferHandler);
        if (err instanceof AuthError) {
          return rejectConnection(conn, err.status === 404 ? 4404 : 4403, err.message);
        }
        return rejectConnection(conn, 4500, 'Authorization verification failed');
      }
    }

    connectionContexts.set(conn, context);

    // Retrieve or initialize the Y.Doc room
    const doc = await getOrCreateDoc(docId);
    doc.conns.set(conn, new Set());

    // -------------------------------------------------------------
    // Initial Handshake: SyncStep1 + Full Document State
    // -------------------------------------------------------------
    {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, doc);
      send(conn, encoding.toUint8Array(encoder));

      const awarenessStates = doc.awareness.getStates();
      if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, messageAwareness);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(
            doc.awareness,
            Array.from(awarenessStates.keys())
          )
        );
        send(conn, encoding.toUint8Array(awarenessEncoder));
      }
    }

    // -------------------------------------------------------------
    // Message Processing & Security Enforcement
    // -------------------------------------------------------------
    conn.off('message', earlyBufferHandler);

    const handleMessage = (message: ArrayBuffer | Buffer) => {
      try {
        // Wire-level rate limiting: max 150 messages/sec per socket connection
        const now = Date.now();
        if (now - context.messageWindowStart > 1000) {
          context.messageWindowStart = now;
          context.messageCount = 1;
        } else {
          context.messageCount++;
          if (context.messageCount > 150) {
            console.warn(`[CollabServer] Rate limit exceeded by client: ${context.userId}`);
            return;
          }
        }
        const uint8Msg = new Uint8Array(message);
        const decoder = decoding.createDecoder(uint8Msg);
        const msgType = decoding.readVarUint(decoder);

        switch (msgType) {
          case messageSync: {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);

            // Read the sync message sub-type
            const subDecoder = decoding.clone(decoder);
            const syncSubtype = decoding.readVarUint(subDecoder);

            // SECURITY ENFORCEMENT: Block write mutations from read-only viewers and commenters
            if (!context.canWrite && (syncSubtype === syncProtocol.messageYjsUpdate || syncSubtype === syncProtocol.messageYjsSyncStep2)) {
              console.warn(`[CollabServer] Blocked unauthorized edit mutation from non-editor client (${context.role}): ${context.userId}`);
              const authEncoder = encoding.createEncoder();
              encoding.writeVarUint(authEncoder, messageAuth);
              authProtocol.writePermissionDenied(authEncoder, 'Permission denied: document is read-only');
              send(conn, encoding.toUint8Array(authEncoder));
              return;
            }

            // Normal processing for authorized clients or non-mutating sync requests
            if (syncSubtype === syncProtocol.messageYjsUpdate || syncSubtype === syncProtocol.messageYjsSyncStep2) {
              doc.lastAuthorId = context.userId;
            }
            syncProtocol.readSyncMessage(decoder, encoder, doc, conn);

            if (encoding.length(encoder) > 1) {
              send(conn, encoding.toUint8Array(encoder));
            }
            break;
          }

          case messageAwareness: {
            // Apply ephemeral presence updates (cursors, selections)
            const awarenessUpdate = decoding.readVarUint8Array(decoder);
            awarenessProtocol.applyAwarenessUpdate(doc.awareness, awarenessUpdate, conn);

            // Track client IDs owned by this connection for reliable disconnect cleanup
            const parsedAwareness = decoding.createDecoder(awarenessUpdate);
            const clientsLength = decoding.readVarUint(parsedAwareness);
            for (let i = 0; i < clientsLength; i++) {
              const clientID = decoding.readVarUint(parsedAwareness);
              decoding.readVarUint(parsedAwareness); // clock
              decoding.readVarString(parsedAwareness); // json state
              context.controlledUserIds.add(clientID);
              const registered = doc.conns.get(conn);
              if (registered) registered.add(clientID);
            }
            break;
          }

          default:
            console.warn(`[CollabServer] Unknown message type received: ${msgType}`);
        }
      } catch (err) {
        console.error('[CollabServer] Error processing message:', err);
      }
    };

    conn.on('message', handleMessage);

    // Drain buffered early messages that arrived during async authorization/hydration
    isInitialized = true;
    for (const earlyMsg of earlyMessageBuffer) {
      handleMessage(earlyMsg);
    }

    // Keepalive ping/pong
    conn.on('pong', () => {
      const ctx = connectionContexts.get(conn);
      if (ctx) ctx.isAlive = true;
    });

    // Cleanup on disconnect
    conn.on('close', async () => {
      const controlledIds = Array.from(context.controlledUserIds);
      if (controlledIds.length > 0) {
        awarenessProtocol.removeAwarenessStates(doc.awareness, controlledIds, 'disconnect');
      }

      doc.conns.delete(conn);

      // If all clients left, flush any unsaved state immediately
      if (doc.conns.size === 0) {
        if (doc.isDirty) {
          await persistDocument(doc);
        }
      }
    });
  });

  // Heartbeat interval to terminate stale connections
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client: WebSocket) => {
      const ctx = connectionContexts.get(client);
      if (ctx) {
        if (!ctx.isAlive) {
          return client.terminate();
        }
        ctx.isAlive = false;
        client.ping();
      }
    });
  }, 30000);

  // Graceful shutdown logic: persist all active documents before stopping
  const close = async () => {
    clearInterval(heartbeatInterval);

    // Flush all active document states to PostgreSQL
    const flushPromises = Array.from(docs.values()).map((doc) => persistDocument(doc));
    await Promise.all(flushPromises);

    // Close Redis connections
    if (redisPub) {
      await redisPub.quit().catch(() => {});
      redisPub = null;
    }
    if (redisSub) {
      await redisSub.quit().catch(() => {});
      redisSub = null;
    }

    return new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  };

  return { wss, close };
}

// Standalone runner execution entrypoint
if (require.main === module) {
  const port = parseInt(process.env.COLLAB_PORT || '1234', 10);
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', activeDocuments: docs.size, timestamp: new Date().toISOString() }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const { close } = createCollabServer(server);

  server.listen(port, () => {
    console.log(`[CollabServer] Real-time collaboration service listening on ws://localhost:${port}`);
  });

  // Safe process shutdown handling
  const handleShutdown = async (signal: string) => {
    console.log(`[CollabServer] Received ${signal}. Flushing documents and shutting down cleanly...`);
    await close();
    server.close(() => {
      console.log('[CollabServer] Safe shutdown completed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}
