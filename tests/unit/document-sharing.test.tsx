/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { POST as inviteMemberRoute } from '@/app/api/workspaces/[id]/members/route';
import { GET as getDocRoute, PATCH as patchDocRoute } from '@/app/api/documents/[id]/route';
import { GET as getWorkspaceDocsRoute } from '@/app/api/workspaces/[id]/documents/route';
import { ShareModal } from '@/components/editor/share-modal';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, verifyDocumentAccess, verifyWorkspaceAccess, AuthError } from '@/lib/auth/authorization';
import { createCollabTicket, verifyCollabTicket } from '@/lib/auth/collab-ticket';
import { User } from '@/lib/types';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    document: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/authorization', async () => {
  const actual = await vi.importActual<any>('@/lib/auth/authorization');
  return {
    ...actual,
    requireAuthUser: vi.fn(),
    verifyDocumentAccess: vi.fn(),
    verifyWorkspaceAccess: vi.fn(),
    AuthError: class AuthError extends Error {
      status: number;
      constructor(message: string, status = 401) {
        super(message);
        this.status = status;
      }
    },
  };
});

vi.mock('@/lib/redis', () => ({
  publishRevocationEvent: vi.fn().mockResolvedValue(true),
}));

describe('Document Sharing and RBAC System (Phase 5)', () => {
  const userA: User = {
    id: 'usr-amruth-001',
    name: 'Amruth',
    email: 'amruth@collabspace.dev',
    avatar: '',
    role: 'owner',
    color: '#6366F1',
    status: 'online',
  };

  const userB: User = {
    id: 'usr-editor-002',
    name: 'Collaborator B',
    email: 'userb@collabspace.dev',
    avatar: '',
    role: 'editor',
    color: '#8B5CF6',
    status: 'online',
  };

  const userUnauthorized = {
    id: 'usr-rogue-999',
    name: 'Attacker',
    email: 'attacker@evil.com',
  };

  const workspaceId = '00000000-0000-4000-8000-000000000001';
  const documentId = '00000000-0000-4000-8000-000000000010';

  const mockWorkspace = {
    id: workspaceId,
    name: "Amruth's Workspace",
    slug: 'amruths-workspace',
    icon: '🚀',
    ownerId: userA.id,
    plan: 'Pro',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDocument = {
    id: documentId,
    title: 'Project Planning',
    icon: '📄',
    excerpt: 'Quarterly roadmap',
    content: '<p>Initial planning content</p>',
    workspaceId,
    authorId: userA.id,
    isStarred: false,
    isDeleted: false,
    isArchived: false,
    tags: ['planning'],
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      id: userA.id,
      name: userA.name,
      email: userA.email,
      avatar: userA.avatar,
    },
    workspace: {
      id: mockWorkspace.id,
      name: mockWorkspace.name,
      slug: mockWorkspace.slug,
      icon: mockWorkspace.icon,
      ownerId: mockWorkspace.ownerId,
      members: [
        {
          id: 'mem-001',
          workspaceId,
          userId: userA.id,
          role: 'owner',
          joinedAt: new Date(),
          user: {
            id: userA.id,
            name: userA.name,
            email: userA.email,
            avatar: userA.avatar,
          },
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Scenario 1 & 2: User A invites existing registered User B as Editor; invitation persisted in PostgreSQL
  it('Scenario 1 & 2: User A invites existing registered User B as Editor and invitation persists in PostgreSQL', async () => {
    vi.mocked(requireAuthUser).mockResolvedValue(userA as any);
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue({
      workspace: mockWorkspace as any,
      membership: { role: 'owner' } as any,
      userRole: 'owner',
      permissions: { canView: true, canComment: true, canEdit: true, canManage: true },
    });

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: userB.id,
      name: userB.name,
      email: userB.email,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
      avatar: null,
      emailVerified: null,
    });

    vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

    vi.mocked(prisma.workspaceMember.create).mockResolvedValue({
      id: 'mem-002',
      workspaceId,
      userId: userB.id,
      role: 'editor',
      joinedAt: new Date(),
      user: {
        id: userB.id,
        name: userB.name,
        email: userB.email,
        avatar: null,
      },
    } as any);

    const request = new Request(`http://localhost/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'userb@collabspace.dev', role: 'editor' }),
    });

    const response = await inviteMemberRoute(request, { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.member.user.id).toBe(userB.id);
    expect(data.member.role).toBe('editor');

    expect(prisma.workspaceMember.create).toHaveBeenCalledWith({
      data: {
        workspaceId,
        userId: userB.id,
        role: 'editor',
      },
      include: expect.any(Object),
    });
  });

  // Scenario 3: User B can access the shared document
  it('Scenario 3: User B can access the shared document and receive an editor role and collab token', async () => {
    vi.mocked(requireAuthUser).mockResolvedValue(userB as any);
    vi.mocked(verifyDocumentAccess).mockResolvedValue({
      document: mockDocument as any,
      workspace: mockWorkspace as any,
      userRole: 'editor',
      permissions: { canView: true, canComment: true, canEdit: true, canManage: false },
    });

    const docWithBothMembers = {
      ...mockDocument,
      workspace: {
        ...mockDocument.workspace,
        members: [
          ...mockDocument.workspace.members,
          {
            id: 'mem-002',
            workspaceId,
            userId: userB.id,
            role: 'editor',
            joinedAt: new Date(),
            user: {
              id: userB.id,
              name: userB.name,
              email: userB.email,
              avatar: null,
            },
          },
        ],
      },
    };

    vi.mocked(prisma.document.findUnique).mockResolvedValue(docWithBothMembers as any);

    const request = new Request(`http://localhost/api/documents/${documentId}`);
    const response = await getDocRoute(request, { params: Promise.resolve({ id: documentId }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.document.id).toBe(documentId);
    expect(data.document.title).toBe('Project Planning');
    expect(data.userRole).toBe('editor');
    expect(data.permissions.canEdit).toBe(true);
    expect(data.collabToken).toBeTruthy();
    expect(data.document.collaborators).toHaveLength(1);
    expect(data.document.collaborators[0].email).toBe(userB.email);
  });

  // Scenario 4: The document appears in User B's dashboard
  it('Scenario 4: The shared document appears in User B dashboard and Shared with me view', async () => {
    vi.mocked(requireAuthUser).mockResolvedValue(userB as any);
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue({
      workspace: mockWorkspace as any,
      userRole: 'editor',
      permissions: { canView: true, canComment: true, canEdit: true, canManage: false },
    } as any);

    vi.mocked(prisma.document.findMany).mockResolvedValue([mockDocument] as any);

    const request = new Request(`http://localhost/api/workspaces/${workspaceId}/documents?filter=shared`);
    const response = await getWorkspaceDocsRoute(request, { params: Promise.resolve({ id: workspaceId }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.documents).toHaveLength(1);
    expect(data.documents[0].id).toBe(documentId);
    expect(data.documents[0].title).toBe('Project Planning');
    expect(data.documents[0].author.id).toBe(userA.id);
  });

  // Scenario 5: User B can edit the document
  it('Scenario 5: User B can edit the document via PATCH /api/documents/[id]', async () => {
    vi.mocked(requireAuthUser).mockResolvedValue(userB as any);
    vi.mocked(verifyDocumentAccess).mockResolvedValue({
      document: mockDocument as any,
      workspace: mockWorkspace as any,
      userRole: 'editor',
      permissions: { canView: true, canComment: true, canEdit: true, canManage: false },
    });

    const updatedDoc = {
      ...mockDocument,
      content: '<p>Updated by User B</p>',
    };
    vi.mocked(prisma.document.update).mockResolvedValue(updatedDoc as any);

    const request = new Request(`http://localhost/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '<p>Updated by User B</p>' }),
    });

    const response = await patchDocRoute(request, { params: Promise.resolve({ id: documentId }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.document.content).toBe('<p>Updated by User B</p>');
  });

  // Scenario 6: User A sees the actual collaborator in the sharing dialog
  it('Scenario 6: User A sees the actual collaborator in the sharing dialog', () => {
    const handleInvite = vi.fn();
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        documentTitle="Project Planning"
        workspaceName="Amruth's Workspace"
        owner={userA}
        currentUser={userA}
        collaborators={[userB]}
        onInvite={handleInvite}
      />
    );

    expect(screen.getByText(/People with access \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Amruth (You)')).toBeInTheDocument();
    expect(screen.getByText('amruth@collabspace.dev')).toBeInTheDocument();
    expect(screen.getByText('Collaborator B')).toBeInTheDocument();
    expect(screen.getByText('userb@collabspace.dev')).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
  });

  // Scenario 7: Duplicate invitations are handled properly (HTTP 409)
  it('Scenario 7: Duplicate invitation returns HTTP 409', async () => {
    vi.mocked(requireAuthUser).mockResolvedValue(userA as any);
    vi.mocked(verifyWorkspaceAccess).mockResolvedValue({
      workspace: mockWorkspace as any,
      userRole: 'owner',
      permissions: { canView: true, canComment: true, canEdit: true, canManage: true },
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: userB.id,
      email: userB.email,
    } as any);

    // Existing membership found
    vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
      id: 'mem-002',
      workspaceId,
      userId: userB.id,
      role: 'editor',
    } as any);

    const request = new Request(`http://localhost/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'userb@collabspace.dev', role: 'editor' }),
    });

    const response = await inviteMemberRoute(request, { params: Promise.resolve({ id: workspaceId }) });
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe('User is already a member of this workspace.');
    expect(prisma.workspaceMember.create).not.toHaveBeenCalled();
  });

  // Scenario 8: Unauthorized users still receive HTTP 403
  it('Scenario 8: Unauthorized non-member user receives HTTP 403', async () => {
    vi.mocked(requireAuthUser).mockResolvedValue(userUnauthorized as any);
    vi.mocked(verifyDocumentAccess).mockRejectedValue(
      new AuthError('You do not have permission to access this document.', 403)
    );

    const request = new Request(`http://localhost/api/documents/${documentId}`);
    const response = await getDocRoute(request, { params: Promise.resolve({ id: documentId }) });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('You do not have permission to access this document.');
  });

  // Scenario 9: Real-time editing works between both users via signed collaboration tickets
  it('Scenario 9: Collab tickets authorize real-time editing for Editor User B', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: userB.id,
      name: userB.name,
      email: userB.email,
    } as any);

    const ticket = createCollabTicket({
      userId: userB.id,
      documentId,
      role: 'editor',
    });

    expect(ticket).toBeTruthy();
    const verified = await verifyCollabTicket(ticket, documentId);

    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.payload.userId).toBe(userB.id);
      expect(verified.payload.documentId).toBe(documentId);
      expect(verified.payload.role).toBe('editor');
    }
  });

  // Scenario 10: The sharing dialog displays the correct owner and workspace names
  it('Scenario 10: The sharing dialog displays dynamic workspace name and document owner, not hardcoded mocks', () => {
    const handleInvite = vi.fn();
    render(
      <ShareModal
        isOpen={true}
        onClose={() => {}}
        documentTitle="Project Planning"
        workspaceName="Amruth's Workspace"
        owner={{
          id: userA.id,
          name: 'Amruth',
          email: 'amruth@collabspace.dev',
          role: 'owner',
        }}
        currentUser={{
          id: userB.id,
          name: 'Collaborator B',
          email: 'userb@collabspace.dev',
        }}
        collaborators={[userB]}
        onInvite={handleInvite}
      />
    );

    // Workspace link text
    expect(screen.getByText("Anyone in Amruth's Workspace with link")).toBeInTheDocument();
    expect(screen.queryByText(/Acme Product Team/i)).not.toBeInTheDocument();

    // Owner display: Amruth (not Alex Rivera)
    expect(screen.getByText('Amruth')).toBeInTheDocument();
    expect(screen.queryByText(/Alex Rivera/i)).not.toBeInTheDocument();
    expect(screen.getByText('amruth@collabspace.dev')).toBeInTheDocument();

    // User B is viewing, so User B is marked as (You)
    expect(screen.getByText('Collaborator B (You)')).toBeInTheDocument();
  });
});
