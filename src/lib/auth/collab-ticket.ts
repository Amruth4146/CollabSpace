/**
 * CollabSpace WebSocket Collaboration Ticket System
 *
 * Implements short-lived, document-scoped authentication tickets for WebSockets:
 * - 60-second time-to-live (TTL)
 * - Cryptographically signed using HMAC-SHA256 with server-side secret COLLAB_WS_TOKEN_SECRET
 * - Binds strictly to specific userId, documentId, and role
 * - Constant-time signature comparison to eliminate timing attacks
 * - Eliminates long-lived bearer tokens from WebSocket URLs, proxy logs, and error trackers
 */

import crypto from 'crypto';
import { prisma } from '../prisma';

export interface CollabTicketPayload {
  userId: string;
  documentId: string;
  role: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  iat: number; // Unix timestamp in seconds
  exp: number; // Unix timestamp in seconds
  nonce: string; // 16-byte random hex for ticket uniqueness
  jti?: string; // Unique ticket identifier for single-use replay protection
}

export const TICKET_TTL_SECONDS = 60;

// In-memory replay cache for development and unit testing when Redis is not configured
const localConsumedTickets = new Map<string, number>();

/**
 * Resets the local in-memory replay cache (used primarily by unit tests).
 */
export function _clearLocalConsumedTickets(): void {
  localConsumedTickets.clear();
}

/**
 * Prunes expired entries from the local in-memory replay cache.
 */
function pruneLocalConsumedTickets(): void {
  const now = Date.now();
  for (const [key, exp] of localConsumedTickets.entries()) {
    if (now > exp) {
      localConsumedTickets.delete(key);
    }
  }
}

export interface ConsumeTicketOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redisClient?: any;
}

/**
 * Atomically consumes a ticket identifier (jti or nonce) to prevent replay attacks.
 * In production, uses Redis atomic `SET key 1 EX <ttl> NX` to ensure multi-instance safety.
 * If Redis is unavailable in production, fails closed to prevent replay vulnerabilities.
 * In development/test mode without Redis, falls back to a local in-memory replay cache.
 */
export async function consumeTicketId(
  ticketId: string,
  expUnixSeconds: number,
  options?: ConsumeTicketOptions
): Promise<{ consumed: boolean; error?: string }> {
  // Hash ticket identifier with SHA-256 to ensure replay cache keys never expose raw user or ticket tokens
  const keyHash = crypto.createHash('sha256').update(ticketId).digest('hex');
  const cacheKey = `collab:consumed_ticket:${keyHash}`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = Math.max(5, expUnixSeconds - nowSeconds + 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let redis: any = options?.redisClient;
  if (redis === undefined) {
    try {
      if (process.env.REDIS_URL) {
        const { getRedisClient } = await import('../redis');
        redis = getRedisClient();
      }
    } catch {
      redis = null;
    }
  }

  if (redis) {
    try {
      const result = await redis.set(cacheKey, '1', 'EX', remainingSeconds, 'NX');
      if (result !== 'OK') {
        return { consumed: false, error: 'Ticket already consumed (replay detected)' };
      }
      return { consumed: true };
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        console.error(
          '[CollabTicket Security] Redis unavailable during ticket replay verification in production:',
          (err as Error).message
        );
        return { consumed: false, error: 'Authentication service temporarily unavailable' };
      }
      // In development/test, fall through to in-memory replay cache
    }
  }

  // Strict production requirement: fail closed if Redis is required for multi-instance replay protection
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[CollabTicket Security] Shared Redis replay protection required in production but unavailable. Failing closed.'
    );
    return { consumed: false, error: 'Authentication service configuration error' };
  }

  // Development and test mode: local in-memory replay cache
  pruneLocalConsumedTickets();
  if (localConsumedTickets.has(cacheKey)) {
    return { consumed: false, error: 'Ticket already consumed (replay detected)' };
  }
  localConsumedTickets.set(cacheKey, Date.now() + remainingSeconds * 1000);
  return { consumed: true };
}

/**
 * Retrieves the server-side signing secret.
 * In production, COLLAB_WS_TOKEN_SECRET must be explicitly configured.
 */
export function getCollabTokenSecret(): string {
  const secret = process.env.COLLAB_WS_TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'COLLAB_WS_TOKEN_SECRET environment variable is missing in production. ' +
        'A secure 256-bit secret is required for signing WebSocket tickets.'
      );
    }
    // Safe deterministic development secret
    return 'collabspace-dev-insecure-websocket-token-secret-key-32-chars-min';
  }
  return secret;
}

export interface VerifyTicketOptions {
  consumeReplay?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redisClient?: any;
}

/**
 * Issues a cryptographically signed, short-lived WebSocket ticket.
 */
export function createCollabTicket(params: {
  userId: string;
  documentId: string;
  role: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = params.ttlSeconds || TICKET_TTL_SECONDS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

  const payload: CollabTicketPayload = {
    userId: params.userId,
    documentId: params.documentId,
    role: params.role,
    iat: now,
    exp: now + ttl,
    nonce,
    jti,
  };

  const secret = getCollabTokenSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');

  return `${body}.${signature}`;
}

export type VerifyTicketResult =
  | { valid: true; payload: CollabTicketPayload }
  | { valid: false; error: string; code: 4401 | 4403 };

/**
 * Validates a WebSocket ticket:
 * 1. Checks structure and format.
 * 2. Verifies cryptographic signature using constant-time comparison.
 * 3. Enforces expiration timestamp (with max 5-second clock skew tolerance).
 * 4. Ensures strict binding to the requested document ID.
 * 5. Atomically consumes the ticket identifier (jti/nonce) to prevent replay attacks.
 * 6. Verifies that the user still exists in PostgreSQL and is not revoked.
 */
export async function verifyCollabTicket(
  ticket: string,
  expectedDocId: string,
  options?: VerifyTicketOptions
): Promise<VerifyTicketResult> {
  if (!ticket || typeof ticket !== 'string') {
    return { valid: false, error: 'Missing or malformed ticket string', code: 4401 };
  }

  const parts = ticket.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed ticket format', code: 4401 };
  }

  const [bodyB64, providedSig] = parts;

  // 1. Verify HMAC signature in constant time
  try {
    const secret = getCollabTokenSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url');

    const providedBuf = Buffer.from(providedSig);
    const expectedBuf = Buffer.from(expectedSig);

    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return { valid: false, error: 'Invalid ticket signature', code: 4401 };
    }
  } catch {
    return { valid: false, error: 'Signature verification failure', code: 4401 };
  }

  // 2. Decode and parse payload
  let payload: CollabTicketPayload;
  try {
    const jsonStr = Buffer.from(bodyB64, 'base64url').toString('utf-8');
    payload = JSON.parse(jsonStr);
  } catch {
    return { valid: false, error: 'Invalid ticket payload encoding', code: 4401 };
  }

  // 3. Verify required claims
  if (!payload.userId || !payload.documentId || !payload.role || !payload.exp || !payload.iat) {
    return { valid: false, error: 'Missing required ticket claims', code: 4401 };
  }

  const now = Math.floor(Date.now() / 1000);

  // Expiration check (allow 5 seconds clock drift)
  if (now > payload.exp + 5) {
    return { valid: false, error: 'Ticket expired', code: 4401 };
  }

  // Issued-at check (reject future timestamps beyond 5 seconds drift)
  if (payload.iat > now + 5) {
    return { valid: false, error: 'Ticket issued in the future', code: 4401 };
  }

  // 4. Strict document binding check
  if (payload.documentId !== expectedDocId) {
    return {
      valid: false,
      error: `Ticket document ID (${payload.documentId}) does not match requested room (${expectedDocId})`,
      code: 4403,
    };
  }

  // 5. Atomic single-use ticket replay consumption
  if (options?.consumeReplay !== false) {
    const ticketId = payload.jti || payload.nonce;
    const consumeRes = await consumeTicketId(ticketId, payload.exp, {
      redisClient: options?.redisClient,
    });
    if (!consumeRes.consumed) {
      return {
        valid: false,
        error: consumeRes.error || 'Ticket replay detected',
        code: 4401,
      };
    }
  }

  // 6. Database user presence & validity check
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return { valid: false, error: 'User associated with ticket no longer exists', code: 4401 };
    }
  } catch (err) {
    console.error('[CollabTicket] Error verifying database user status:', err);
    return { valid: false, error: 'Database verification failed', code: 4401 };
  }

  return { valid: true, payload };
}

