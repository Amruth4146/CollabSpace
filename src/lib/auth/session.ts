import { cookies, headers } from 'next/headers';
import { prisma } from '../prisma';
import { generateSecureToken, hashToken } from './crypto';

export const SESSION_COOKIE_NAME = 'collabspace_session';
export const DEFAULT_SESSION_EXPIRY_DAYS = 30;
export const SHORT_SESSION_EXPIRY_HOURS = 24;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  emailVerified: Date | null;
  createdAt: Date;
}

export interface ActiveSession {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

/**
 * Creates a new cryptographically secure session and sets the HttpOnly cookie.
 */
export async function createSession(
  userId: string,
  rememberMe: boolean = true
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);

  const durationMs = rememberMe
    ? DEFAULT_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    : SHORT_SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs);

  let userAgent: string | null = null;
  let ipAddress: string | null = null;

  try {
    const headersList = await headers();
    userAgent = headersList.get('user-agent');
    ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
      headersList.get('x-real-ip') ||
      null;
  } catch {
    // Header access may fail outside request context (e.g. tests)
  }

  // Create session in database
  await prisma.session.create({
    data: {
      sessionToken: tokenHash,
      userId,
      expiresAt,
      userAgent,
      ipAddress,
    },
  });

  // Set secure cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return { rawToken, expiresAt };
}

/**
 * Validates the session cookie and retrieves the authenticated user.
 * Automatically cleans up expired sessions.
 */
export async function getCurrentSession(): Promise<{
  user: SessionUser;
  session: ActiveSession;
} | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      return null;
    }

    const tokenHash = hashToken(sessionCookie.value);
    const session = await prisma.session.findUnique({
      where: { sessionToken: tokenHash },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Check if session has expired
    if (session.expiresAt <= new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      cookieStore.delete(SESSION_COOKIE_NAME);
      return null;
    }

    return {
      user: session.user,
      session: {
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Destroys the current user session and clears the cookie.
 */
export async function destroyCurrentSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (sessionCookie?.value) {
      const tokenHash = hashToken(sessionCookie.value);
      await prisma.session.delete({ where: { sessionToken: tokenHash } }).catch(() => {});
    }

    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (err) {
    console.error('Error destroying session:', err);
  }
}

/**
 * Invalidates all active sessions for a user (e.g. after password reset).
 */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId },
  });

  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // Ignore outside request context
  }
}

/**
 * Validates a raw bearer/cookie session token directly against PostgreSQL.
 * Used for WebSocket connections, external sync, and background workers.
 */
export async function validateSessionToken(rawToken: string): Promise<SessionUser | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;

  try {
    const tokenHash = hashToken(rawToken.trim());
    const session = await prisma.session.findUnique({
      where: { sessionToken: tokenHash },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            emailVerified: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) return null;

    if (session.expiresAt <= new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return session.user;
  } catch (err) {
    console.error('Session token validation error:', err);
    return null;
  }
}

