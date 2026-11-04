export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  color: string;
  status?: 'online' | 'idle' | 'offline';
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: 'Free' | 'Pro' | 'Enterprise';
  icon: string;
  documentCount: number;
  membersCount: number;
  role?: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  ownerId?: string;
}

export interface WorkspaceMember {
  id: string;
  user: User;
  role: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  joinedAt: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  icon?: string;
  excerpt: string;
  content: string;
  updatedAt: string;
  createdAt: string;
  author: User;
  collaborators: User[];
  tags: string[];
  isStarred: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface CommentReply {
  id: string;
  commentId?: string;
  author: User;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CommentItem {
  id: string;
  documentId: string;
  author: User;
  text: string;
  createdAt: string;
  updatedAt?: string;
  resolved: boolean;
  resolvedAt?: string | null;
  resolvedBy?: User | null;
  selectedTextSnippet?: string;
  anchorPosition?: string | null;
  replies: CommentReply[];
}

export interface VersionEntry {
  id: string;
  documentId: string;
  versionNumber: string;
  timestamp: string;
  author: User;
  summary: string;
  changes: {
    added: number;
    removed: number;
  };
  contentSnapshot: string;
}
