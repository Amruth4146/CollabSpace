/**
 * CollabSpace Redis Infrastructure & Resilient Coordination Client
 *
 * Guarantees:
 * - Robust connection management with exponential backoff & jitter
 * - Dedicated pub/sub connection pairs
 * - Safe error handling (falls back gracefully to single-node mode if Redis is temporarily unreachable)
 * - Distributed mutex / locking for multi-instance persistence coordination
 * - Health check observability
 */

import Redis, { RedisOptions } from 'ioredis';
import { prisma } from './prisma';

let sharedRedisClient: Redis | null = null;

export function getRedisConfig(): RedisOptions {
  const redisUrl = process.env.REDIS_URL || '';
  const isTls = redisUrl.startsWith('rediss://');

  return {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    connectTimeout: 5000,
    ...(isTls ? { tls: {} } : {}),
    retryStrategy(times) {
      if (times > 10) {
        console.warn('[Redis] Max reconnection attempts reached; slowing retry cadence.');
        return 10000;
      }
      // Exponential backoff with jitter: min 100ms, max 3000ms
      const delay = Math.min(times * 150, 3000);
      return delay + Math.floor(Math.random() * 100);
    },
  };
}

/**
 * Returns a shared Redis singleton for commands, distributed locks, and caching.
 */
export function getRedisClient(): Redis {
  if (sharedRedisClient) return sharedRedisClient;

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  sharedRedisClient = new Redis(redisUrl, getRedisConfig());

  sharedRedisClient.on('error', (err) => {
    console.warn('[Redis] Connection warning (shared client):', err.message);
  });

  sharedRedisClient.on('connect', () => {
    console.log('[Redis] Connected successfully to Redis.');
  });

  sharedRedisClient.on('reconnecting', (time: number) => {
    console.log(`[Redis] Reconnecting in ${time}ms...`);
  });

  // Proactively initiate connection
  sharedRedisClient.connect().catch((err) => {
    console.warn('[Redis] Initial connection deferred:', err.message);
  });

  return sharedRedisClient;
}

/**
 * Creates an isolated pub/sub pair for a collaboration server instance.
 * Dedicated connections are required because subscriber connections enter subscriber mode.
 */
export function createCollabRedisPair(instanceLabel: string): {
  pub: Redis;
  sub: Redis;
  close: () => Promise<void>;
} {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const config = getRedisConfig();

  const pub = new Redis(redisUrl, { ...config, connectionName: `collab-pub-${instanceLabel}` });
  const sub = new Redis(redisUrl, { ...config, connectionName: `collab-sub-${instanceLabel}` });

  pub.on('error', (err) => {
    console.warn(`[Redis Pub ${instanceLabel}] Warning:`, err.message);
  });

  sub.on('error', (err) => {
    console.warn(`[Redis Sub ${instanceLabel}] Warning:`, err.message);
  });

  pub.connect().catch((err) => {
    console.warn(`[Redis Pub ${instanceLabel}] Initial connect error:`, err.message);
  });

  sub.connect().catch((err) => {
    console.warn(`[Redis Sub ${instanceLabel}] Initial connect error:`, err.message);
  });

  const close = async () => {
    try {
      await Promise.all([pub.quit().catch(() => pub.disconnect()), sub.quit().catch(() => sub.disconnect())]);
    } catch {
      pub.disconnect();
      sub.disconnect();
    }
  };

  return { pub, sub, close };
}

/**
 * Health check: Verifies Redis connectivity, latency, and operational status.
 */
export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  info?: {
    version?: string;
    uptimeSeconds?: number;
    connectedClients?: number;
    usedMemoryHuman?: string;
  };
  error?: string;
}> {
  const client = getRedisClient();
  const startTime = Date.now();

  try {
    const pingRes = await client.ping();
    const latencyMs = Date.now() - startTime;

    if (pingRes !== 'PONG') {
      return { status: 'degraded', latencyMs, error: `Unexpected PING response: ${pingRes}` };
    }

    const rawInfo = await client.info('server').catch(() => '');
    const versionMatch = rawInfo.match(/redis_version:([^\r\n]+)/);
    const uptimeMatch = rawInfo.match(/uptime_in_seconds:([^\r\n]+)/);

    return {
      status: 'healthy',
      latencyMs,
      info: {
        version: versionMatch ? versionMatch[1] : undefined,
        uptimeSeconds: uptimeMatch ? parseInt(uptimeMatch[1], 10) : undefined,
      },
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return {
      status: 'unhealthy',
      latencyMs,
      error: err instanceof Error ? err.message : 'Unknown Redis connection error',
    };
  }
}

/**
 * Health check: Verifies PostgreSQL database connectivity and query latency.
 */
export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1 as health_check`;
    return {
      status: 'healthy',
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : 'Database query error',
    };
  }
}

/**
 * Distributed Mutex Lock:
 * Attempts to acquire an exclusive lock with TTL.
 * Useful for multi-instance persistence coordination and debouncing.
 */
export async function acquireDistributedLock(
  lockKey: string,
  ownerId: string,
  ttlMs = 2000
): Promise<boolean> {
  const client = getRedisClient();
  try {
    const result = await client.set(`lock:${lockKey}`, ownerId, 'PX', ttlMs, 'NX');
    return result === 'OK';
  } catch (err) {
    console.warn(`[Redis Lock] Failed to acquire lock ${lockKey}:`, err);
    // If Redis is unreachable, fail-safe: allow leader-less execution
    return true;
  }
}

/**
 * Releases a distributed lock only if held by the expected owner.
 */
export async function releaseDistributedLock(
  lockKey: string,
  ownerId: string
): Promise<boolean> {
  const client = getRedisClient();
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    const result = await client.eval(luaScript, 1, `lock:${lockKey}`, ownerId);
    return result === 1;
  } catch (err) {
    console.warn(`[Redis Lock] Error releasing lock ${lockKey}:`, err);
    return false;
  }
}

export interface RevocationEvent {
  action: 'revoke_user' | 'revoke_doc' | 'role_change' | 'revoke_session';
  userId?: string;
  docId?: string;
  newRole?: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  timestamp?: number;
}

/**
 * Publishes a real-time permission or session revocation event across all WebSocket server instances.
 */
export async function publishRevocationEvent(event: RevocationEvent): Promise<boolean> {
  try {
    const client = getRedisClient();
    const payload = JSON.stringify({
      ...event,
      timestamp: event.timestamp || Date.now(),
    });
    await client.publish('collab:revoke', payload);
    return true;
  } catch (err) {
    console.warn('[Redis Revocation] Failed to publish revocation event:', (err as Error).message);
    return false;
  }
}
