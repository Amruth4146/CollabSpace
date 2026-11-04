import Redis from 'ioredis';
import { prisma } from '../prisma';

let redisClient: Redis | null = null;
let redisFailed = false;

function getRedisClient(): Redis | null {
  if (redisFailed) return null;
  if (!redisClient && process.env.REDIS_URL) {
    try {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: false,
      });
      redisClient.on('error', () => {
        redisFailed = true;
      });
    } catch {
      redisFailed = true;
    }
  }
  return redisClient;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Checks and increments rate limit counter for a given key.
 * Uses Redis if reachable, falling back to PostgreSQL RateLimitRecord.
 *
 * @param key Unique identifier (e.g., "login:127.0.0.1" or "forgot:user@example.com")
 * @param maxAttempts Allowed attempts within the time window
 * @param windowSeconds Window length in seconds
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedisClient();

  if (redis && !redisFailed) {
    try {
      const fullKey = `ratelimit:${key}`;
      const count = await redis.incr(fullKey);
      if (count === 1) {
        await redis.expire(fullKey, windowSeconds);
      }
      const ttl = await redis.ttl(fullKey);
      const resetAt = new Date(Date.now() + Math.max(ttl, 1) * 1000);

      return {
        success: count <= maxAttempts,
        remaining: Math.max(0, maxAttempts - count),
        resetAt,
      };
    } catch {
      redisFailed = true;
      // Fall through to database fallback
    }
  }

  // Database fallback
  try {
    const now = new Date();
    const existing = await prisma.rateLimitRecord.findUnique({
      where: { key },
    });

    if (existing && existing.expiresAt > now) {
      if (existing.count >= maxAttempts) {
        return {
          success: false,
          remaining: 0,
          resetAt: existing.expiresAt,
        };
      }

      const updated = await prisma.rateLimitRecord.update({
        where: { key },
        data: { count: { increment: 1 } },
      });

      return {
        success: true,
        remaining: Math.max(0, maxAttempts - updated.count),
        resetAt: existing.expiresAt,
      };
    }

    // Upsert fresh record with new expiration
    const resetAt = new Date(Date.now() + windowSeconds * 1000);
    await prisma.rateLimitRecord.upsert({
      where: { key },
      create: { key, count: 1, expiresAt: resetAt },
      update: { count: 1, expiresAt: resetAt },
    });

    return {
      success: true,
      remaining: maxAttempts - 1,
      resetAt,
    };
  } catch (error) {
    console.error('Rate limiting error (failing open for resilience):', error);
    return {
      success: true,
      remaining: 1,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }
}
