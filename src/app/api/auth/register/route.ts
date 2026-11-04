import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/auth/schemas';
import { normalizeEmail, hashPassword, generateSecureToken, hashToken } from '@/lib/auth/crypto';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { createSession } from '@/lib/auth/session';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    // Rate limit registration: max 10 signups per hour per IP
    const rateLimit = await checkRateLimit(`register:${ip}`, 10, 3600);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parseResult = registerSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message || 'Invalid input data.';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { name, email, password, autoLogin } = parseResult.data;
    const normalizedEmail = normalizeEmail(email);

    // Duplicate account prevention
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email address already exists. Please sign in.' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const verificationTokenRaw = generateSecureToken();
    const verificationTokenHash = hashToken(verificationTokenRaw);
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Generate workspace slug
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
    const uniqueSlug = `${slugBase}-${Math.random().toString(36).substring(2, 6)}`;

    // Create User, Workspace, Starter Doc, and Verification Token in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash,
          emailVerified: null,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: `${name}'s Workspace`,
          slug: uniqueSlug,
          ownerId: user.id,
          icon: '⚡',
          plan: 'Free',
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'owner',
        },
      });

      await tx.document.create({
        data: {
          title: 'Welcome to CollabSpace',
          icon: '👋',
          content: `<h1>Welcome to CollabSpace</h1><p>Start collaborating in real-time. Share this document, invite teammates, or explore rich text styling.</p>`,
          excerpt: 'Welcome guide to your new CollabSpace collaborative workspace.',
          workspaceId: workspace.id,
          authorId: user.id,
          tags: ['Getting Started'],
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          tokenHash: verificationTokenHash,
          email: normalizedEmail,
          userId: user.id,
          expiresAt: verificationExpiresAt,
        },
      });

      return { user, workspace };
    });

    // Dispatch verification email (or log in development)
    await sendVerificationEmail(normalizedEmail, name, verificationTokenRaw).catch((err) => {
      console.error('Failed to dispatch verification email:', err);
    });

    if (autoLogin) {
      // Automatically establish secure session for API clients requesting auto-login
      await createSession(result.user.id, true);
    } else {
      // Ensure no leftover session cookie redirects the user away from /login
      try {
        const cookieStore = await cookies();
        cookieStore.set('collabspace_session', '', {
          path: '/',
          maxAge: 0,
          expires: new Date(0),
          httpOnly: true,
          sameSite: 'lax',
        });
      } catch {
        // Ignore if outside cookie context
      }
    }

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          avatar: result.user.avatar,
          emailVerified: result.user.emailVerified,
        },
        workspace: {
          id: result.workspace.id,
          name: result.workspace.name,
          slug: result.workspace.slug,
        },
      },
      { status: 201 }
    );

    if (!autoLogin) {
      response.cookies.set('collabspace_session', '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        sameSite: 'lax',
      });
    }

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during registration. Please try again.' },
      { status: 500 }
    );
  }
}
