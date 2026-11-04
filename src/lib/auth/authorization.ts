import { getCurrentSession, SessionUser } from './session';
import { prisma } from '../prisma';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';

export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  owner: 5,
  admin: 4,
  editor: 3,
  commenter: 2,
  viewer: 1,
};

export interface RolePermissions {
  canView: boolean;
  canComment: boolean;
  canEdit: boolean;
  canManage: boolean;
}

/**
 * Returns the explicit permission capabilities for a given role.
 */
export function getPermissionsForRole(role: string): RolePermissions {
  const normalized = role.toLowerCase();
  switch (normalized) {
    case 'owner':
    case 'admin':
      return { canView: true, canComment: true, canEdit: true, canManage: true };
    case 'editor':
      return { canView: true, canComment: true, canEdit: true, canManage: false };
    case 'commenter':
      return { canView: true, canComment: true, canEdit: false, canManage: false };
    case 'viewer':
    default:
      return { canView: true, canComment: false, canEdit: false, canManage: false };
  }
}

/**
 * Ensures the request is authenticated, returning the verified user.
 * Throws 401 AuthError if no active session exists.
 */
export async function requireAuthUser(): Promise<SessionUser> {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    throw new AuthError('Authentication required. Please sign in.', 401);
  }
  return sessionData.user;
}

/**
 * Server-side authorization check for workspaces.
 * Guarantees that only members with appropriate permissions can access workspace data.
 */
export async function verifyWorkspaceAccess(
  userId: string,
  workspaceIdOrSlug: string,
  minRole: WorkspaceRole = 'viewer'
) {
  const workspace = await prisma.workspace.findFirst({
    where: {
      OR: [{ id: workspaceIdOrSlug }, { slug: workspaceIdOrSlug }],
    },
    include: {
      members: {
        where: { userId },
      },
    },
  });

  if (!workspace) {
    throw new AuthError('Workspace not found.', 404);
  }

  const membership = workspace.members[0];
  if (!membership && workspace.ownerId !== userId) {
    throw new AuthError('You do not have permission to access this workspace.', 403);
  }

  const userRole = (membership ? membership.role : 'owner') as WorkspaceRole;
  const userRank = ROLE_HIERARCHY[userRole] || 0;
  const requiredRank = ROLE_HIERARCHY[minRole] || 1;

  if (userRank < requiredRank) {
    throw new AuthError(
      `Insufficient permissions. Role "${minRole}" or higher is required.`,
      403
    );
  }

  const permissions = getPermissionsForRole(userRole);
  return { workspace, membership, userRole, permissions };
}

/**
 * Server-side authorization check for documents.
 * Ensures the requesting user belongs to the document's parent workspace
 * and has permission to view, edit, or delete the document.
 */
export async function verifyDocumentAccess(
  userId: string,
  documentId: string,
  minRole: WorkspaceRole = 'viewer'
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      workspace: {
        include: {
          members: {
            where: { userId },
          },
        },
      },
    },
  });

  if (!document) {
    throw new AuthError('Document not found.', 404);
  }

  const membership = document.workspace.members[0];
  const isOwner = document.workspace.ownerId === userId;

  if (!membership && !isOwner) {
    throw new AuthError('You do not have permission to access this document.', 403);
  }

  const userRole = (membership ? membership.role : 'owner') as WorkspaceRole;
  const userRank = ROLE_HIERARCHY[userRole] || 0;
  const requiredRank = ROLE_HIERARCHY[minRole] || 1;

  if (userRank < requiredRank) {
    throw new AuthError(
      `Insufficient permissions. You cannot perform this action on this document.`,
      403
    );
  }

  const permissions = getPermissionsForRole(userRole);
  return { document, workspace: document.workspace, userRole, permissions };
}
