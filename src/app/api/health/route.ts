import { NextResponse } from 'next/server';
import { checkDatabaseHealth, checkRedisHealth } from '@/lib/redis';

export async function GET() {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const isHealthy = dbHealth.status === 'healthy';
  const overallStatus = isHealthy
    ? redisHealth.status === 'healthy'
      ? 'ok'
      : 'degraded'
    : 'unhealthy';

  const responsePayload = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: dbHealth,
      redis: redisHealth,
    },
  };

  return NextResponse.json(responsePayload, {
    status: isHealthy ? 200 : 503,
  });
}
