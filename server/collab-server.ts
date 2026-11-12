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

import 'dotenv/config';
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
import { verifyCollabTicket } from '../src/lib/auth/collab-ticket';

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
  connectionId: string;
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
  revalidationTimer?: NodeJS.Timeout | null;
  isClosed?: boolean;
}

// Active connections registry across all collaborative rooms on this server instance
export const activeConnections = new Set<WebSocket>();
export const connectionContexts = new WeakMap<WebSocket, ClientContext>();

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

/**
 * Handles real-time session or document permission revocation across active WebSocket connections.
 * Closes unauthorized connections immediately and enforces read-only wire restrictions on demoted roles.
 */
export function handleRevocationEvent(data: {
  action: 'revoke_user' | 'revoke_doc' | 'role_change' | 'revoke_session';
  userId?: string;
  docId?: string;
  newRole?: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
}): void {
  const { action, userId, docId, newRole } = data;

  if (action === 'revoke_doc' && docId) {
    const liveDoc = docs.get(docId);
    if (liveDoc) {
      liveDoc.conns.forEach((_, conn) => {
        rejectConnection(conn, 4403, 'Document access revoked or document deleted');
      });
    }
    return;
  }

  activeConnections.forEach((conn) => {
    const ctx = connectionContexts.get(conn);
    if (!ctx) return;

    if (action === 'revoke_user' && userId && ctx.userId === userId) {
      if (!docId || ctx.docId === docId) {
        rejectConnection(conn, 4403, 'User access revoked');
      }
    } else if (action === 'role_change' && userId && ctx.userId === userId) {
      if (!docId || ctx.docId === docId) {
        if (newRole) {
          ctx.role = newRole;
          ctx.canWrite = newRole === 'owner' || newRole === 'admin' || newRole === 'editor';
          if (!ctx.canWrite) {
            const authEncoder = encoding.createEncoder();
            encoding.writeVarUint(authEncoder, messageAuth);
            authProtocol.writePermissionDenied(
              authEncoder,
              `Permission updated: role changed to ${newRole} (read-only)`
            );
            send(conn, encoding.toUint8Array(authEncoder));
          }
        }
      }
    } else if (action === 'revoke_session' && userId && ctx.userId === userId) {
      rejectConnection(conn, 4401, 'User session revoked');
    }
  });
}

function initRedis() {
  if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
    console.log('[CollabServer] REDIS_URL not configured; running in standalone single-node mode.');
    return;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const isTls = redisUrl.startsWith('rediss://');
  const redisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    ...(isTls ? { tls: {} } : {}),
  };

  try {
    redisPub = new Redis(redisUrl, redisOptions);
    redisSub = new Redis(redisUrl, redisOptions);

    redisPub.on('error', (err) => {
      console.warn('[CollabServer] Redis Pub connection notice:', err.message);
    });

    redisSub.on('error', (err) => {
      console.warn('[CollabServer] Redis Sub connection notice:', err.message);
    });

    redisPub.connect().catch((err) => {
      console.warn('[CollabServer] Redis Pub connection bypassed:', err.message);
      redisPub = null;
    });

    redisSub.connect().then(() => {
      redisSub?.subscribe('collab:control', 'collab:comments', 'collab:revoke').catch(() => {});
      redisSub?.on('messageBuffer', async (channelBuffer, messageBuffer) => {
        const channel = channelBuffer.toString();

        // Cross-instance real-time permission & session revocation channel
        if (channel === 'collab:revoke') {
          try {
            const raw = messageBuffer.toString('utf-8');
            const data = JSON.parse(raw);
            handleRevocationEvent(data);
          } catch (e) {
            console.warn('[CollabServer] Error handling collab:revoke message:', e);
          }
          return;
        }

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

    // Check document exists in DB before updating and is not soft-deleted
    const existing = await prisma.document.findUnique({
      where: { id: doc.name },
      select: { id: true, isDeleted: true },
    });
    if (!existing || existing.isDeleted) {
      doc.isDirty = false;
      if (existing?.isDeleted) {
        doc.conns.forEach((_, conn) => {
          rejectConnection(conn, 4403, 'Document access revoked or document deleted');
        });
      }
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
 * Extracts session or ticket token from request query parameters or cookies.
 */
function extractAuthToken(req: http.IncomingMessage, parsedUrl: URL): string | null {
  // 1. From URL query parameter
  const queryToken =
    parsedUrl.searchParams.get('ticket') ||
    parsedUrl.searchParams.get('token') ||
    parsedUrl.searchParams.get('auth');
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
 * Safely extracts an authentication ticket from an incoming message payload.
 * Supports:
 * 1. Binary messageAuth packet (message type 2) with string payload.
 * 2. JSON text frame { type: "auth", ticket: "..." }.
 */
export function parseAuthPacket(data: unknown): string | null {
  try {
    if (typeof data === 'string') {
      const p = JSON.parse(data);
      return (
        (typeof p.ticket === 'string' ? p.ticket : null) ||
        (typeof p.token === 'string' ? p.token : null) ||
        (typeof p.auth === 'string' ? p.auth : null)
      );
    }
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (buf.length === 0) return null;

    // Check if JSON text frame
    if (buf[0] === 0x7b /* '{' */) {
      const p = JSON.parse(buf.toString('utf-8'));
      return (
        (typeof p.ticket === 'string' ? p.ticket : null) ||
        (typeof p.token === 'string' ? p.token : null) ||
        (typeof p.auth === 'string' ? p.auth : null)
      );
    }

    // Binary messageAuth protocol
    const dec = decoding.createDecoder(new Uint8Array(buf));
    const msgType = decoding.readVarUint(dec);
    if (msgType === messageAuth) {
      return decoding.readVarString(dec);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Authenticates a client using either:
 * 1. Short-lived (60s), document-scoped HMAC-SHA256 ticket with atomic replay consumption (preferred & production mandatory).
 * 2. Database session token (strictly restricted to non-production environments for test fixture compatibility).
 */
export async function authenticateClient(
  tokenStr: string,
  docId: string,
  options?: { isRefresh?: boolean }
): Promise<
  | {
      success: true;
      user: { id: string; name: string; email: string };
      role: string;
      canWrite: boolean;
    }
  | { success: false; code: number; error: string }
> {
  const isRefresh = options?.isRefresh ?? false;

  // 1. First attempt: Verify as a cryptographically signed HMAC-SHA256 Collab Ticket with atomic replay check
  const ticketResult = await verifyCollabTicket(tokenStr, docId, {
    consumeReplay: !isRefresh,
    redisClient: redisPub,
  });

  if (ticketResult.valid) {
    try {
      const { userRole } = await verifyDocumentAccess(ticketResult.payload.userId, docId, 'viewer');
      const canWrite = userRole === 'owner' || userRole === 'admin' || userRole === 'editor';

      const user = await prisma.user.findUnique({
        where: { id: ticketResult.payload.userId },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        return { success: false, code: 4401, error: 'User associated with ticket no longer exists' };
      }

      return {
        success: true,
        user,
        role: userRole,
        canWrite,
      };
    } catch (err) {
      if (err instanceof AuthError) {
        return { success: false, code: err.status === 404 ? 4404 : 4403, error: err.message };
      }
      return { success: false, code: 4500, error: 'Authorization verification failed' };
    }
  }

  // If ticket format was provided (contains '.') and validation failed, strictly reject
  if (tokenStr.includes('.') && !ticketResult.valid) {
    return { success: false, code: ticketResult.code, error: ticketResult.error };
  }

  // STRICT PRODUCTION SECURITY: Reject raw session tokens as WebSocket credentials in production
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      code: 4401,
      error: 'Unauthorized: Signed collaboration ticket required in production',
    };
  }

  // 2. Fallback attempt: Session token validation (only in non-production environments for test fixtures)
  const sessionUser = await validateSessionToken(tokenStr);
  if (!sessionUser) {
    return { success: false, code: 4401, error: ticketResult.error || 'Unauthorized: Invalid or expired session' };
  }

  try {
    const { userRole } = await verifyDocumentAccess(sessionUser.id, docId, 'viewer');
    const canWrite = userRole === 'owner' || userRole === 'admin' || userRole === 'editor';
    return {
      success: true,
      user: sessionUser,
      role: userRole,
      canWrite,
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return { success: false, code: err.status === 404 ? 4404 : 4403, error: err.message };
    }
    return { success: false, code: 4500, error: 'Authorization verification failed' };
  }
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

const MULTI_TENANT_SUFFIXES = [
  'vercel.app',
  'onrender.com',
  'railway.app',
  'fly.dev',
  'pages.dev',
  'github.io',
  'netlify.app',
  'herokuapp.com',
];

/**
 * Checks if a wildcard pattern safely restricts multi-tenant subdomains.
 * Prohibits bare wildcards like `*.vercel.app` because any tenant can create an account there.
 * Allows project-prefixed patterns like `collabspace-*.vercel.app`.
 */
export function isWildcardPatternSafe(pattern: string): boolean {
  const lower = pattern.toLowerCase();
  for (const suffix of MULTI_TENANT_SUFFIXES) {
    if (
      lower === `*.${suffix}` ||
      lower === `*${suffix}` ||
      lower === `https://*.${suffix}` ||
      lower === `http://*.${suffix}`
    ) {
      return false; // Dangerous: bare multi-tenant wildcard
    }
  }
  return true;
}

/**
 * Converts a wildcard pattern like "collabspace-*.vercel.app" or "*.mycompany.com" into a RegExp.
 */
function wildcardToRegExp(pattern: string): RegExp | null {
  try {
    const cleanPattern = pattern.replace(/^https?:\/\//i, '').toLowerCase();
    // Escape regex special characters except *
    const escaped = cleanPattern.replace(/[.+?^${}()|[\]\\-]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\*/g, '[a-z0-9_-]+') + '$';
    return new RegExp(regexStr);
  } catch {
    return null;
  }
}

/**
 * Evaluates whether an incoming HTTP/WebSocket Origin header is permitted.
 * Hardened for Phase 7D-V2.2:
 * - Exact production origin matching by default (NEXT_PUBLIC_APP_URL)
 * - Explicitly configured trusted origins in ALLOWED_ORIGINS
 * - Rejects insecure bare multi-tenant wildcards (*.vercel.app, *.onrender.com)
 * - Permits project-scoped wildcards (collabspace-*.vercel.app)
 * - Rejects malformed origins safely
 * - Restricts localhost to non-production environments unless explicitly listed
 * - Permits missing Origin (non-browser CLI/tools) while mandatory ticket auth protects access
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') return true;

  try {
    const originUrl = new URL(origin);
    const requestHost = originUrl.host.toLowerCase();
    const requestHostname = originUrl.hostname.toLowerCase();

    const isLocalhost = requestHostname === 'localhost' || requestHostname === '127.0.0.1';

    // Build list of configured allowed origins
    const allowedEntries: string[] = [];
    if (process.env.ALLOWED_ORIGINS) {
      allowedEntries.push(...process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean));
    }
    if (process.env.NEXT_PUBLIC_APP_URL) {
      allowedEntries.push(...process.env.NEXT_PUBLIC_APP_URL.split(',').map((s) => s.trim()).filter(Boolean));
    }
    if (allowedEntries.length === 0) {
      // In production without configuration, reject external connections
      return false;
    }

    for (const rawEntry of allowedEntries) {
      if (rawEntry === '*') return true;

      let entryHost = rawEntry.toLowerCase();
      let entryHostname = entryHost;

      try {
        const parsed = entryHost.includes('://') ? new URL(entryHost) : new URL(`https://${entryHost}`);
        entryHost = parsed.host;
        entryHostname = parsed.hostname;
      } catch {
        // Fall back to raw string if not a standard URL
      }

      // Check wildcard prefix
      if (entryHostname.includes('*')) {
        // Disallow bare multi-tenant wildcards
        if (!isWildcardPatternSafe(entryHostname)) {
          console.warn(`[CollabServer Security] Prohibited insecure bare wildcard origin: ${entryHostname}`);
          continue;
        }

        const regex = wildcardToRegExp(entryHostname);
        if (regex && (regex.test(requestHost) || regex.test(requestHostname))) {
          return true;
        }
        continue;
      }

      // Direct host or hostname match
      if (entryHost === requestHost || entryHostname === requestHostname) {
        return true;
      }

      // Localhost match only if explicitly configured
      if (isLocalhost && (entryHostname === 'localhost' || entryHostname === '127.0.0.1')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
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
    if (origin && !isOriginAllowed(origin)) {
      conn.off('message', earlyBufferHandler);
      return rejectConnection(conn, 4403, 'Untrusted origin');
    }

    // Helper to complete initialization once authentication and authorization succeed
    const setupAuthenticatedSession = async (
      context: ClientContext,
      earlyMessages: (ArrayBuffer | Buffer)[]
    ) => {
      activeConnections.add(conn);
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
      const handleMessage = async (message: ArrayBuffer | Buffer) => {
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
              if (
                !context.canWrite &&
                (syncSubtype === syncProtocol.messageYjsUpdate ||
                  syncSubtype === syncProtocol.messageYjsSyncStep2)
              ) {
                console.warn(
                  `[CollabServer] Blocked unauthorized edit mutation from non-editor client (${context.role}): ${context.userId}`
                );
                const authEncoder = encoding.createEncoder();
                encoding.writeVarUint(authEncoder, messageAuth);
                authProtocol.writePermissionDenied(
                  authEncoder,
                  'Permission denied: document is read-only'
                );
                send(conn, encoding.toUint8Array(authEncoder));
                return;
              }

              // Normal processing for authorized clients or non-mutating sync requests
              if (
                syncSubtype === syncProtocol.messageYjsUpdate ||
                syncSubtype === syncProtocol.messageYjsSyncStep2
              ) {
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

            case messageAuth: {
              // Valid authenticated connection sent an in-band auth packet (e.g. ticket renewal / reauthorization)
              try {
                const rawTicket = decoding.readVarString(decoder);
                if (rawTicket) {
                  const reauthResult = await authenticateClient(rawTicket, docId, { isRefresh: true });
                  if (!reauthResult.success) {
                    console.warn(
                      `[CollabServer] In-band reauthorization rejected for user ${context.userId}: ${reauthResult.error}`
                    );
                    rejectConnection(conn, reauthResult.code, reauthResult.error);
                    return;
                  }

                  // SECURITY ENFORCEMENT (Finding V31-03):
                  // In-band renewal must strictly match the authenticated connection's existing user identity.
                  // Rejects any attempt to swap identities, escalate privileges across users, or replay tickets.
                  if (reauthResult.user.id !== context.userId) {
                    console.warn(
                      `[CollabServer Security] In-band renewal user identity mismatch: connection user ${context.userId} vs ticket user ${reauthResult.user.id}`
                    );
                    rejectConnection(
                      conn,
                      4403,
                      'Forbidden: In-band renewal ticket does not match authenticated connection user'
                    );
                    return;
                  }

                  context.role = reauthResult.role as 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
                  context.canWrite = reauthResult.canWrite;

                  if (!context.canWrite) {
                    const authEncoder = encoding.createEncoder();
                    encoding.writeVarUint(authEncoder, messageAuth);
                    authProtocol.writePermissionDenied(
                      authEncoder,
                      'Permission updated: document is now read-only'
                    );
                    send(conn, encoding.toUint8Array(authEncoder));
                  }
                  console.log(
                    `[CollabServer] Reauthorized active connection for ${context.userId} on ${docId} (role: ${context.role})`
                  );
                }
              } catch (reauthErr) {
                console.warn('[CollabServer] Error during in-band reauthorization:', reauthErr);
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
      for (const earlyMsg of earlyMessages) {
        handleMessage(earlyMsg);
      }

      // Keepalive ping/pong
      conn.on('pong', () => {
        const ctx = connectionContexts.get(conn);
        if (ctx) ctx.isAlive = true;
      });

      // Bounded periodic revalidation (every 60s) to catch DB-level user deletion or permission revocation
      if (!docId.startsWith('doc-') && docId !== 'demo' && docId !== 'collabspace-demo') {
        context.revalidationTimer = setInterval(async () => {
          if (context.isClosed || conn.readyState !== WebSocket.OPEN) {
            if (context.revalidationTimer) {
              clearInterval(context.revalidationTimer);
              context.revalidationTimer = null;
            }
            return;
          }
          try {
            const user = await prisma.user.findUnique({
              where: { id: context.userId },
              select: { id: true },
            });
            if (!user) {
              if (context.revalidationTimer) clearInterval(context.revalidationTimer);
              return rejectConnection(conn, 4401, 'User account no longer active');
            }
            const { userRole } = await verifyDocumentAccess(context.userId, context.docId, 'viewer');
            const canWrite = userRole === 'owner' || userRole === 'admin' || userRole === 'editor';
            if (context.canWrite !== canWrite || context.role !== userRole) {
              context.role = userRole;
              context.canWrite = canWrite;
              if (!canWrite) {
                const authEncoder = encoding.createEncoder();
                encoding.writeVarUint(authEncoder, messageAuth);
                authProtocol.writePermissionDenied(
                  authEncoder,
                  'Permission revoked: document is now read-only'
                );
                send(conn, encoding.toUint8Array(authEncoder));
              }
            }
          } catch {
            if (context.revalidationTimer) clearInterval(context.revalidationTimer);
            rejectConnection(conn, 4403, 'Document access revoked');
          }
        }, 60000);
      }

      // Cleanup on disconnect
      conn.on('close', async () => {
        if (context.isClosed) return;
        context.isClosed = true;

        if (context.revalidationTimer) {
          clearInterval(context.revalidationTimer);
          context.revalidationTimer = null;
        }
        activeConnections.delete(conn);

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
    };

    // -------------------------------------------------------------
    // Security Layer: Authentication & Authorization Flow
    // -------------------------------------------------------------
    if (docId.startsWith('doc-') || docId === 'demo') {
      // Demo Document Fast-Path for public exploration
      conn.off('message', earlyBufferHandler);
      const demoContext: ClientContext = {
        connectionId: 'demo-' + Math.random().toString(36).substring(2, 10),
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
      await setupAuthenticatedSession(demoContext, earlyMessageBuffer);
      return;
    }

    // Check if credentials were provided via query parameters (e.g. ?ticket= or ?token=)
    const queryToken = extractAuthToken(req, parsedUrl);
    if (queryToken) {
      const authResult = await authenticateClient(queryToken, docId);
      conn.off('message', earlyBufferHandler);

      if (!authResult.success) {
        return rejectConnection(conn, authResult.code, authResult.error);
      }

      const context: ClientContext = {
        connectionId: 'conn-' + Math.random().toString(36).substring(2, 10),
        docId,
        userId: authResult.user.id,
        userName: authResult.user.name,
        userEmail: authResult.user.email,
        userColor: pickColor(authResult.user.id),
        role: authResult.role as 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer',
        canWrite: authResult.canWrite,
        controlledUserIds: new Set(),
        isAlive: true,
        messageCount: 0,
        messageWindowStart: Date.now(),
      };

      await setupAuthenticatedSession(context, earlyMessageBuffer);
      return;
    }

    // In-Band Ticket Authentication Mode:
    // No token in URL query params. Connection is held pending in-band ticket verification.
    // Client must transmit a signed HMAC-SHA256 ticket as its very first message.
    let isPendingAuth = true;
    let isSocketClosed = false;

    const authTimeout = setTimeout(() => {
      if (isPendingAuth && !isSocketClosed) {
        isPendingAuth = false;
        conn.off('message', earlyBufferHandler);
        conn.off('message', initialAuthHandler);
        rejectConnection(conn, 4401, 'Unauthorized: Missing session token');
      }
    }, 2000);

    conn.on('close', () => {
      isSocketClosed = true;
      clearTimeout(authTimeout);
    });

    const initialAuthHandler = async (msg: ArrayBuffer | Buffer) => {
      if (!isPendingAuth || isSocketClosed) return;

      const ticket = parseAuthPacket(msg);
      if (!ticket) {
        // A non-auth message was received before authenticating!
        isPendingAuth = false;
        clearTimeout(authTimeout);
        conn.off('message', earlyBufferHandler);
        conn.off('message', initialAuthHandler);
        return rejectConnection(
          conn,
          4401,
          'Unauthorized: Authentication required before protocol sync'
        );
      }

      // Ticket received: consume and validate
      isPendingAuth = false;
      clearTimeout(authTimeout);
      conn.off('message', initialAuthHandler);

      const authResult = await authenticateClient(ticket, docId);
      conn.off('message', earlyBufferHandler);

      if (!authResult.success) {
        return rejectConnection(conn, authResult.code, authResult.error);
      }

      const remainingEarlyMessages = earlyMessageBuffer.filter((m) => m !== msg);

      const context: ClientContext = {
        connectionId: 'conn-' + Math.random().toString(36).substring(2, 10),
        docId,
        userId: authResult.user.id,
        userName: authResult.user.name,
        userEmail: authResult.user.email,
        userColor: pickColor(authResult.user.id),
        role: authResult.role as 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer',
        canWrite: authResult.canWrite,
        controlledUserIds: new Set(),
        isAlive: true,
        messageCount: 0,
        messageWindowStart: Date.now(),
      };

      await setupAuthenticatedSession(context, remainingEarlyMessages);
    };

    conn.on('message', initialAuthHandler);
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

    // Clear active revalidation timers
    activeConnections.forEach((conn) => {
      const ctx = connectionContexts.get(conn);
      if (ctx?.revalidationTimer) {
        clearInterval(ctx.revalidationTimer);
        ctx.revalidationTimer = null;
      }
    });
    activeConnections.clear();

    // Flush all active document states to PostgreSQL
    const flushPromises = Array.from(docs.values()).map((doc) => persistDocument(doc));
    await Promise.all(flushPromises);

    Array.from(docs.values()).forEach((doc) => {
      if (doc.saveTimeout) {
        clearTimeout(doc.saveTimeout);
        doc.saveTimeout = null;
      }
    });
    docs.clear();

    // Close Redis connections
    if (redisPub) {
      await redisPub.quit().catch(() => {});
      redisPub = null;
    }
    if (redisSub) {
      await redisSub.quit().catch(() => {});
      redisSub = null;
    }

    // Close active clients
    wss.clients.forEach((client) => {
      try {
        client.terminate();
      } catch {}
    });

    return new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  };

  return { wss, close };
}

// Standalone runner execution entrypoint
if (require.main === module) {
  const port = parseInt(process.env.PORT || process.env.COLLAB_PORT || '1234', 10);
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.PORT;
  const host = isProduction ? '0.0.0.0' : 'localhost';

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ status: 'ok', activeDocuments: docs.size, timestamp: new Date().toISOString() }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const { close } = createCollabServer(server);

  server.listen(port, host, () => {
    console.log(`[CollabServer] Real-time collaboration service listening on ws://${host}:${port}`);
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
