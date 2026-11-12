import { NextResponse } from 'next/server';
import { requireAuthUser, verifyDocumentAccess, AuthError } from '@/lib/auth/authorization';
import { createCollabTicket } from '@/lib/auth/collab-ticket';

/**
 * Dedicated endpoint to issue or refresh a short-lived WebSocket collaboration ticket.
 * - Authenticates the caller via session cookie
 * - Verifies current document permissions
 * - Issues a 60-second cryptographically signed document-scoped ticket
 * - Supports both POST and GET for consistent client integration
 */
async function handleCollabTokenRequest(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { id: documentId } = await context.params;

    const { userRole, permissions } = await verifyDocumentAccess(user.id, documentId, 'viewer');

    const ticket = createCollabTicket({
      userId: user.id,
      documentId,
      role: userRole,
    });

    return NextResponse.json({
      success: true,
      ticket,
      collabToken: ticket, // Backward-compatible alias
      documentId,
      userRole,
      permissions,
      expiresInSeconds: 60,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to issue collaboration ticket.' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handleCollabTokenRequest(request, context);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return handleCollabTokenRequest(request, context);
}

