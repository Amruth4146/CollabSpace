/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH, DELETE } from '@/app/api/documents/[id]/route';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, verifyDocumentAccess, verifyWorkspaceAccess } from '@/lib/auth/authorization';
import { publishRevocationEvent } from '@/lib/redis';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    document: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/authorization', () => ({
  requireAuthUser: vi.fn(),
  verifyDocumentAccess: vi.fn(),
  verifyWorkspaceAccess: vi.fn(),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/lib/redis', () => ({
  publishRevocationEvent: vi.fn().mockResolvedValue(true),
}));

describe('Document Revocation API Integration (Phase 7D-V3.1.1 Finding V31-04)', () => {
  const mockUser = { id: 'usr-editor-123', name: 'Editor User', email: 'editor@test.com' };
  const mockDocId = 'doc-test-456';
  const mockWorkspaceId = '00000000-0000-4000-8000-000000000001';
  const newWorkspaceId = '00000000-0000-4000-8000-000000000002';

  const mockExistingDoc = {
    id: mockDocId,
    title: 'Existing Document',
    content: '<p>Content</p>',
    workspaceId: mockWorkspaceId,
    isStarred: false,
    isDeleted: false,
    isArchived: false,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    author: mockUser,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthUser).mockResolvedValue(mockUser as any);
    vi.mocked(verifyDocumentAccess).mockResolvedValue({
      canWrite: true,
      userRole: 'editor',
      document: mockExistingDoc,
    } as any);
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue({
      canWrite: true,
      userRole: 'editor',
    } as any);
    vi.mocked(prisma.document.findUnique).mockResolvedValue(mockExistingDoc as any);
    vi.mocked(prisma.document.update).mockImplementation((args: any) =>
      Promise.resolve({
        ...mockExistingDoc,
        ...args.data,
        author: mockUser,
      }) as any
    );
    vi.mocked(prisma.document.delete).mockResolvedValue(mockExistingDoc as any);
  });

  it('publishes revoke_doc event immediately when document is soft-deleted (isDeleted: true)', async () => {
    const request = new Request(`http://localhost:3000/api/documents/${mockDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDeleted: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: mockDocId }) });
    expect(response.status).toBe(200);

    expect(publishRevocationEvent).toHaveBeenCalledTimes(1);
    expect(publishRevocationEvent).toHaveBeenCalledWith({
      action: 'revoke_doc',
      docId: mockDocId,
    });
  });

  it('publishes revoke_doc event immediately when document is moved to another workspace', async () => {
    const request = new Request(`http://localhost:3000/api/documents/${mockDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: newWorkspaceId }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: mockDocId }) });
    expect(response.status).toBe(200);

    expect(publishRevocationEvent).toHaveBeenCalledTimes(1);
    expect(publishRevocationEvent).toHaveBeenCalledWith({
      action: 'revoke_doc',
      docId: mockDocId,
    });
  });

  it('does NOT publish revoke_doc event on normal metadata update', async () => {
    const request = new Request(`http://localhost:3000/api/documents/${mockDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: mockDocId }) });
    expect(response.status).toBe(200);

    expect(publishRevocationEvent).not.toHaveBeenCalled();
  });

  it('publishes revoke_doc event upon permanent deletion (DELETE route)', async () => {
    const request = new Request(`http://localhost:3000/api/documents/${mockDocId}`, {
      method: 'DELETE',
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: mockDocId }) });
    expect(response.status).toBe(200);

    expect(publishRevocationEvent).toHaveBeenCalledTimes(1);
    expect(publishRevocationEvent).toHaveBeenCalledWith({
      action: 'revoke_doc',
      docId: mockDocId,
    });
  });

  it('gracefully completes document update even if Redis publishRevocationEvent fails', async () => {
    vi.mocked(publishRevocationEvent).mockRejectedValueOnce(new Error('Redis connection timeout'));

    const request = new Request(`http://localhost:3000/api/documents/${mockDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDeleted: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: mockDocId }) });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.document.isDeleted).toBe(true);
  });
});

