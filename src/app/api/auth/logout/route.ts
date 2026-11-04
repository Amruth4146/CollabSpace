import { NextResponse } from 'next/server';
import { destroyCurrentSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function POST() {
  try {
    await destroyCurrentSession();
    const response = NextResponse.json({ success: true, message: 'Signed out successfully.' });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'An error occurred during logout.' },
      { status: 500 }
    );
  }
}
