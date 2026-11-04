import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/editor', '/settings'];
const AUTH_PREFIXES = ['/login', '/signup'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('collabspace_session');
  const isAuthenticated = Boolean(sessionCookie?.value);

  // Check protected routes
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login/signup
  const isAuthRoute = AUTH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isAuthRoute && isAuthenticated) {
    // If the user is viewing /login with a registered status flag, permit viewing the confirmation
    const isRegisteredParam =
      request.nextUrl.searchParams.get('registered') === 'true' ||
      request.nextUrl.searchParams.get('status') === 'registered';

    if (pathname === '/login' && isRegisteredParam) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/editor/:path*',
    '/settings/:path*',
    '/login',
    '/signup',
  ],
};
