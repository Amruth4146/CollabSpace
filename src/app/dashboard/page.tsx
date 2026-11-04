'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  MOCK_WORKSPACES,
  MOCK_DOCUMENTS,
  CURRENT_USER,
} from '@/lib/mock-data';
import { DocumentItem, Workspace, User } from '@/lib/types';
import { Sidebar, DocumentFilter } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';
import { DocumentCard } from '@/components/dashboard/document-card';
import { DocumentListItem } from '@/components/dashboard/document-list-item';
import { NewDocModal } from '@/components/dashboard/new-doc-modal';
import { CreateWorkspaceModal } from '@/components/dashboard/create-workspace-modal';
import { MoveDocModal } from '@/components/dashboard/move-doc-modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { DocumentCardSkeleton, DocumentListSkeleton } from '@/components/ui/skeleton';
import {
  GridIcon,
  ListIcon,
  PlusIcon,
  DocumentIcon,
  TrashIcon,
  RefreshCwIcon,
  ArchiveIcon,
  StarIcon,
  UsersIcon,
  ChevronDownIcon,
  HelpCircleIcon,
} from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

export type SortOption = 'updated-desc' | 'created-desc' | 'name-asc';

export default function DashboardPage() {
  const router = useRouter();
  const { toast, success, error } = useToast();

  const [currentUser, setCurrentUser] = useState<User>(CURRENT_USER);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(MOCK_WORKSPACES);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(MOCK_WORKSPACES[0]);
  const [documents, setDocuments] = useState<DocumentItem[]>(MOCK_DOCUMENTS);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFilter, setCurrentFilter] = useState<DocumentFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('updated-desc');

  // Modals state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNewDocModalOpen, setIsNewDocModalOpen] = useState(false);
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);

  // Move document modal state
  const [movingDoc, setMovingDoc] = useState<DocumentItem | null>(null);

  // Confirmation modal state
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: async () => {},
  });

  // Load authenticated user and their workspaces
  useEffect(() => {
    let isMounted = true;

    async function loadAuthAndWorkspaces() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }

        const data = await res.json();
        if (!isMounted) return;

        if (data.authenticated && data.user) {
          setCurrentUser({
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            avatar: data.user.avatar || '',
            role: 'owner',
            color: '#6366F1',
            status: 'online',
          });

          if (data.workspaces && data.workspaces.length > 0) {
            setWorkspaces(data.workspaces);
            setActiveWorkspace(data.workspaces[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load user session:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadAuthAndWorkspaces();
    return () => {
      isMounted = false;
    };
  }, [router]);

  // Load workspace documents whenever activeWorkspace changes
  useEffect(() => {
    if (!activeWorkspace?.id) return;

    let isMounted = true;
    async function loadDocuments() {
      try {
        const res = await fetch(`/api/workspaces/${activeWorkspace.id}/documents`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.documents) {
            const mappedDocs: DocumentItem[] = data.documents.map(
              (d: {
                id: string;
                title?: string;
                icon?: string;
                excerpt?: string;
                content?: string;
                updatedAt?: string;
                createdAt?: string;
                isStarred?: boolean;
                isDeleted?: boolean;
                deletedAt?: string;
                isArchived?: boolean;
                archivedAt?: string;
                tags?: string[];
                author?: { id: string; name: string; email: string; avatar?: string };
              }) => ({
                id: d.id,
                title: d.title || 'Untitled Document',
                icon: d.icon || '📄',
                excerpt: d.excerpt || 'No description provided.',
                content: d.content || '',
                updatedAt: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : 'Just now',
                createdAt: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : 'Just now',
                isStarred: Boolean(d.isStarred),
                isDeleted: Boolean(d.isDeleted),
                deletedAt: d.deletedAt,
                isArchived: Boolean(d.isArchived),
                archivedAt: d.archivedAt,
                tags: Array.isArray(d.tags) ? d.tags : [],
                author: d.author
                  ? {
                      id: d.author.id,
                      name: d.author.name,
                      email: d.author.email,
                      avatar: d.author.avatar || '',
                      role: 'editor',
                      color: '#6366F1',
                      status: 'online',
                    }
                  : currentUser,
                collaborators: [],
              })
            );
            setDocuments(mappedDocs);
          }
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
    }

    loadDocuments();
    return () => {
      isMounted = false;
    };
  }, [activeWorkspace?.id, currentUser]);

  // Compute active, trash, and archive counts
  const trashCount = useMemo(() => {
    return documents.filter((d) => d.isDeleted).length;
  }, [documents]);

  const archiveCount = useMemo(() => {
    return documents.filter((d) => d.isArchived && !d.isDeleted).length;
  }, [documents]);

  const activeDocumentsCount = useMemo(() => {
    return documents.filter((d) => !d.isDeleted && !d.isArchived).length;
  }, [documents]);

  // Available tags computed from non-deleted, non-archived documents
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    documents
      .filter((d) => !d.isDeleted && !d.isArchived)
      .forEach((d) => d.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [documents]);

  // Filtered & Sorted documents
  const filteredDocuments = useMemo(() => {
    const list = documents.filter((doc) => {
      // Trash filter
      if (currentFilter === 'trash') {
        if (!doc.isDeleted) return false;
      } else {
        if (doc.isDeleted) return false;

        // Archive filter
        if (currentFilter === 'archived') {
          if (!doc.isArchived) return false;
        } else {
          if (doc.isArchived) return false;

          // Categorical filters
          if (currentFilter === 'starred' && !doc.isStarred) return false;
          if (currentFilter === 'shared' && doc.author?.id === currentUser.id) return false;
        }
      }

      // Search matching across title, excerpt, and tags
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesTitle = doc.title.toLowerCase().includes(q);
        const matchesExcerpt = doc.excerpt.toLowerCase().includes(q);
        const matchesTags = doc.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesExcerpt && !matchesTags) return false;
      }

      // Tag filter
      if (selectedTag && !doc.tags.includes(selectedTag)) return false;

      return true;
    });

    // Sorting
    return list.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'created-desc') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      // default: updated-desc
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });
  }, [documents, searchQuery, currentFilter, selectedTag, currentUser.id, sortBy]);

  // 1. Star / Unstar
  const handleToggleStar = async (id: string) => {
    const doc = documents.find((d) => d.id === id);
    const newStarred = !doc?.isStarred;

    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isStarred: newStarred } : d))
    );

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: newStarred }),
      });
      if (res.ok) {
        toast({
          title: newStarred ? 'Added to Starred' : 'Removed from Starred',
          variant: 'info',
        });
      }
    } catch {
      // Revert on failure
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, isStarred: !newStarred } : d))
      );
      error('Failed to update star status.');
    }
  };

  // 2. Soft delete / Move to Trash
  const handleDeleteDoc = async (id: string) => {
    const docToDelete = documents.find((d) => d.id === id);
    if (!docToDelete) return;

    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isDeleted: true, deletedAt: 'Just now' } : d))
    );

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDeleted: true }),
      });
      if (res.ok) {
        success(`"${docToDelete.title}" moved to Trash.`);
      } else {
        throw new Error();
      }
    } catch {
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, isDeleted: false, deletedAt: undefined } : d))
      );
      error('Failed to move document to trash.');
    }
  };

  // 3. Restore from Trash
  const handleRestoreDoc = async (id: string) => {
    const docToRestore = documents.find((d) => d.id === id);
    if (!docToRestore) return;

    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isDeleted: false, deletedAt: undefined } : d))
    );

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDeleted: false }),
      });
      if (res.ok) {
        success(`"${docToRestore.title}" restored.`);
      } else {
        throw new Error();
      }
    } catch {
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, isDeleted: true } : d))
      );
      error('Failed to restore document.');
    }
  };

  // 4. Archive Document
  const handleArchiveDoc = async (id: string) => {
    const docToArchive = documents.find((d) => d.id === id);
    if (!docToArchive) return;

    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isArchived: true, archivedAt: 'Just now' } : d))
    );

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      });
      if (res.ok) {
        success(`"${docToArchive.title}" archived.`);
      } else {
        throw new Error();
      }
    } catch {
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, isArchived: false } : d))
      );
      error('Failed to archive document.');
    }
  };

  // 5. Restore from Archive
  const handleRestoreArchiveDoc = async (id: string) => {
    const docToRestore = documents.find((d) => d.id === id);
    if (!docToRestore) return;

    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isArchived: false, archivedAt: undefined } : d))
    );

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false }),
      });
      if (res.ok) {
        success(`"${docToRestore.title}" restored from archive.`);
      } else {
        throw new Error();
      }
    } catch {
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, isArchived: true } : d))
      );
      error('Failed to unarchive document.');
    }
  };

  // 6. Move Document to Another Workspace
  const handleMoveDoc = async (doc: DocumentItem, targetWorkspaceId: string) => {
    const targetWs = workspaces.find((w) => w.id === targetWorkspaceId);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: targetWorkspaceId }),
      });

      if (res.ok) {
        // Remove from current workspace list
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        success(`"${doc.title}" moved to ${targetWs?.name || 'new workspace'}.`);
      } else {
        const data = await res.json();
        error(data.error || 'Failed to move document.');
      }
    } catch {
      error('Network error moving document.');
    }
  };

  // 7. Permanently Delete Document (with confirmation dialog)
  const handlePermanentDeleteDoc = (id: string) => {
    const docToDelete = documents.find((d) => d.id === id);
    if (!docToDelete) return;

    setConfirmModalConfig({
      isOpen: true,
      title: 'Permanently Delete Document?',
      description: `Are you sure you want to delete "${docToDelete.title}" forever? This action is irreversible.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/documents/${id}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            setDocuments((prev) => prev.filter((d) => d.id !== id));
            success('Document permanently deleted.');
          } else {
            error('Failed to permanently delete document.');
          }
        } catch {
          error('Network error deleting document.');
        } finally {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // 8. Empty Trash (with confirmation dialog)
  const handleEmptyTrash = () => {
    const deletedDocs = documents.filter((d) => d.isDeleted);
    if (deletedDocs.length === 0) return;

    setConfirmModalConfig({
      isOpen: true,
      title: 'Empty Trash?',
      description: `Permanently delete all ${deletedDocs.length} items currently in the trash? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          for (const doc of deletedDocs) {
            await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
          }
          setDocuments((prev) => prev.filter((d) => !d.isDeleted));
          success('Trash emptied successfully.');
        } catch {
          error('Failed to empty all items in trash.');
        } finally {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // 9. Duplicate Document
  const handleDuplicateDoc = async (doc: DocumentItem) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/duplicate`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        const duplicated: DocumentItem = {
          ...data.document,
          updatedAt: 'Just now',
          createdAt: 'Just now',
        };
        setDocuments((prev) => [duplicated, ...prev]);
        success(`"${doc.title}" duplicated.`);
      } else {
        const data = await res.json();
        error(data.error || 'Failed to duplicate document.');
      }
    } catch {
      error('Network error duplicating document.');
    }
  };

  // 10. Rename Document
  const handleRenameDoc = async (id: string, newTitle: string) => {
    const originalDoc = documents.find((d) => d.id === id);
    if (!originalDoc || originalDoc.title === newTitle) return;

    setDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, title: newTitle } : doc))
    );

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        success('Document title updated.');
      } else {
        throw new Error();
      }
    } catch {
      // Revert on failure
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, title: originalDoc.title } : doc))
      );
      error('Failed to rename document.');
    }
  };

  // 11. Create Workspace
  const handleCreateWorkspace = async (name: string, icon: string) => {
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon }),
      });

      if (res.ok) {
        const data = await res.json();
        const newWs: Workspace = {
          id: data.workspace.id,
          name: data.workspace.name,
          slug: data.workspace.slug,
          icon: data.workspace.icon,
          membersCount: 1,
          documentCount: 0,
          plan: 'Free',
        };
        setWorkspaces((prev) => [...prev, newWs]);
        setActiveWorkspace(newWs);
        success(`Workspace "${newWs.name}" created!`);
        setIsCreateWorkspaceModalOpen(false);
      } else {
        const data = await res.json();
        error(data.error || 'Failed to create workspace.');
      }
    } catch {
      error('Network error creating workspace.');
    }
  };

  // 12. Create New Document
  const handleCreateDoc = async (title: string, icon: string, tag: string) => {
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, icon, tag }),
      });

      if (res.ok) {
        const data = await res.json();
        success('Document created. Opening editor...');
        setIsNewDocModalOpen(false);
        router.push(`/editor/${data.document.id}`);
      } else {
        const data = await res.json();
        error(data.error || 'Failed to create document.');
      }
    } catch {
      error('Network error creating document.');
    }
  };

  // Keyboard shortcut for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Determine whether the active workspace is a demonstration fixture
  const isDemoWorkspace = useMemo(() => {
    if (!activeWorkspace?.id) return true;
    return (
      activeWorkspace.id === 'ws_core' ||
      activeWorkspace.id === 'ws_eng' ||
      activeWorkspace.id.startsWith('ws_') ||
      activeWorkspace.id === 'demo'
    );
  }, [activeWorkspace.id]);

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <Sidebar
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={(ws) => {
          setActiveWorkspace(ws);
          success(`Switched to ${ws.name}`);
        }}
        currentUser={currentUser}
        currentFilter={currentFilter}
        onFilterChange={setCurrentFilter}
        selectedTag={selectedTag}
        onTagSelect={setSelectedTag}
        availableTags={availableTags}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        trashCount={trashCount}
        archiveCount={archiveCount}
        onCreateWorkspace={() => setIsCreateWorkspaceModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenNewDoc={() => setIsNewDocModalOpen(true)}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          workspaceName={activeWorkspace.name}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Welcome & Stats Banner */}
          <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-purple-950 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-indigo-800/40">
            {/* Ambient background glows for visual depth */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 max-w-3xl space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-200 bg-white/10 px-2.5 py-0.5 rounded-full inline-block backdrop-blur-xs border border-white/10">
                  {activeWorkspace.plan} Workspace
                </span>
                {isDemoWorkspace && (
                  <span className="text-[11px] font-medium text-amber-300/90 bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 rounded-full">
                    Demo Mode
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Welcome back, {currentUser.name} 👋
              </h1>
              <p className="text-indigo-200 text-xs sm:text-sm leading-relaxed max-w-2xl">
                You have <span className="font-semibold text-white">{activeDocumentsCount}</span> active{' '}
                {activeDocumentsCount === 1 ? 'document' : 'documents'} in{' '}
                <span className="font-semibold text-white">{activeWorkspace.name}</span>. Open any document to start editing or collaborating with your team.
              </p>
            </div>

            {/* Statistics Cards Grid */}
            <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 relative z-10">
              {/* 1. Active Documents */}
              <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-xs transition-colors">
                <span className="text-indigo-200 text-xs font-medium block truncate">Active Documents</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-bold text-white tracking-tight">{activeDocumentsCount}</span>
                  <span className="text-[11px] text-indigo-300 font-normal">live</span>
                </div>
              </div>

              {/* 2. Archived */}
              <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-xs transition-colors">
                <span className="text-indigo-200 text-xs font-medium block truncate">Archived</span>
                <div className="mt-1">
                  <span className="text-xl sm:text-2xl font-bold text-indigo-200 tracking-tight">{archiveCount}</span>
                </div>
              </div>

              {/* 3. In Trash */}
              <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-xs transition-colors">
                <span className="text-indigo-200 text-xs font-medium block truncate">In Trash</span>
                <div className="mt-1">
                  <span className={`text-xl sm:text-2xl font-bold tracking-tight ${trashCount > 0 ? 'text-amber-300' : 'text-indigo-200'}`}>
                    {trashCount}
                  </span>
                </div>
              </div>

              {/* 4. Team Members */}
              <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-xs transition-colors">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-indigo-200 text-xs font-medium truncate">Team Members</span>
                  {isDemoWorkspace && (
                    <span
                      className="text-[9px] uppercase font-bold tracking-wider text-amber-200 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-400/30"
                      title="Demonstration workspace data"
                    >
                      Demo
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {activeWorkspace.membersCount || 1}
                  </span>
                  <span className="text-[11px] text-indigo-300 font-normal">
                    {(activeWorkspace.membersCount || 1) === 1 ? 'member' : 'members'}
                  </span>
                </div>
              </div>

              {/* 5. Collaboration */}
              <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-xs transition-colors col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-indigo-200 text-xs font-medium truncate">Collaboration</span>
                  <div
                    className="group relative cursor-help text-indigo-300 hover:text-white"
                    aria-label="Technology Information"
                  >
                    <HelpCircleIcon className="w-3.5 h-3.5" />
                    <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-30 w-56 p-2.5 bg-slate-900/95 text-white text-[11px] rounded-lg shadow-xl border border-slate-700 leading-snug backdrop-blur-xs">
                      Document co-editing is powered by Yjs CRDTs & persistent WebSockets when opening a document.
                    </div>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span className="text-sm sm:text-base font-semibold text-emerald-300 truncate">
                    Collaboration Ready
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                {currentFilter === 'trash'
                  ? 'Trash'
                  : currentFilter === 'archived'
                  ? 'Archived Documents'
                  : currentFilter === 'starred'
                  ? 'Starred Documents'
                  : currentFilter === 'shared'
                  ? 'Shared With Me'
                  : currentFilter === 'recent'
                  ? 'Recent Documents'
                  : selectedTag
                  ? `Documents tagged #${selectedTag}`
                  : 'All Documents'}
              </h2>
              <span className="text-xs font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                {filteredDocuments.length}
              </span>
            </div>

            {/* View Mode Toggle, Sorting & Actions */}
            <div className="flex items-center gap-2">
              {currentFilter === 'trash' && trashCount > 0 && (
                <Button
                  onClick={handleEmptyTrash}
                  variant="outline"
                  size="sm"
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 cursor-pointer"
                  leftIcon={<TrashIcon className="w-3.5 h-3.5" />}
                >
                  Empty Trash
                </Button>
              )}

              {/* Sort Selector */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-white border border-slate-200 text-xs font-medium text-slate-700 rounded-lg px-2.5 py-1.5 pr-7 appearance-none shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                  aria-label="Sort documents"
                >
                  <option value="updated-desc">Last Updated</option>
                  <option value="created-desc">Created Date</option>
                  <option value="name-asc">Alphabetical (A-Z)</option>
                </select>
                <ChevronDownIcon className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Grid / List View Toggle */}
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md text-slate-500 transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-slate-100 text-indigo-600 font-semibold shadow-2xs'
                      : 'hover:text-slate-900'
                  }`}
                  aria-label="Grid view"
                  title="Grid view"
                >
                  <GridIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md text-slate-500 transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-slate-100 text-indigo-600 font-semibold shadow-2xs'
                      : 'hover:text-slate-900'
                  }`}
                  aria-label="List view"
                  title="List view"
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>

              {currentFilter !== 'trash' && (
                <Button
                  onClick={() => setIsNewDocModalOpen(true)}
                  variant="primary"
                  size="sm"
                  leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                  className="cursor-pointer"
                >
                  <span>New</span>
                </Button>
              )}
            </div>
          </div>

          {/* Skeletons while mounting */}
          {isLoading ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <DocumentCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <DocumentListSkeleton />
            )
          ) : filteredDocuments.length > 0 ? (
            currentFilter === 'trash' ? (
              /* Trash items view with Restore & Permanent Delete actions */
              <div className="space-y-4">
                <div className="rounded-xl border border-rose-200/80 bg-rose-50/60 p-4 text-xs text-rose-800 flex items-center justify-between">
                  <span>
                    Items in trash will be permanently purged after 30 days. You can restore or delete them immediately.
                  </span>
                </div>

                <div className="space-y-2">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{doc.icon}</span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-slate-900 truncate">
                            {doc.title}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">
                            Deleted {doc.deletedAt || 'recently'} • {doc.tags.join(', ')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreDoc(doc.id)}
                          leftIcon={<RefreshCwIcon className="w-3 h-3" />}
                        >
                          Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50 cursor-pointer"
                          onClick={() => handlePermanentDeleteDoc(doc.id)}
                          leftIcon={<TrashIcon className="w-3 h-3" />}
                        >
                          Delete Permanently
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocuments.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onToggleStar={handleToggleStar}
                    onDelete={handleDeleteDoc}
                    onDuplicate={handleDuplicateDoc}
                    onRename={handleRenameDoc}
                    onArchive={handleArchiveDoc}
                    onRestoreArchive={handleRestoreArchiveDoc}
                    onMove={(d) => setMovingDoc(d)}
                    onRestoreFromTrash={handleRestoreDoc}
                    onPermanentDelete={handlePermanentDeleteDoc}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocuments.map((doc) => (
                  <DocumentListItem
                    key={doc.id}
                    document={doc}
                    onToggleStar={handleToggleStar}
                    onDelete={handleDeleteDoc}
                    onDuplicate={handleDuplicateDoc}
                    onRename={handleRenameDoc}
                    onArchive={handleArchiveDoc}
                    onRestoreArchive={handleRestoreArchiveDoc}
                    onMove={(d) => setMovingDoc(d)}
                    onRestoreFromTrash={handleRestoreDoc}
                    onPermanentDelete={handlePermanentDeleteDoc}
                  />
                ))}
              </div>
            )
          ) : (
            /* Clean Empty State */
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-4 max-w-md mx-auto my-12 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto text-xl">
                {currentFilter === 'trash' ? (
                  <TrashIcon className="w-6 h-6 text-slate-400" />
                ) : currentFilter === 'archived' ? (
                  <ArchiveIcon className="w-6 h-6 text-indigo-500" />
                ) : currentFilter === 'starred' ? (
                  <StarIcon className="w-6 h-6 text-amber-500" />
                ) : currentFilter === 'shared' ? (
                  <UsersIcon className="w-6 h-6 text-indigo-500" />
                ) : (
                  <DocumentIcon className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {currentFilter === 'trash'
                    ? 'Trash is empty'
                    : currentFilter === 'archived'
                    ? 'No archived documents'
                    : currentFilter === 'starred'
                    ? 'No starred documents'
                    : currentFilter === 'shared'
                    ? 'No shared documents'
                    : searchQuery
                    ? 'No matching documents'
                    : 'No documents yet'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {currentFilter === 'trash'
                    ? 'Documents that you delete will be stored here temporarily before being permanently removed.'
                    : currentFilter === 'archived'
                    ? 'Archived documents will be stored here safely without cluttering your main workspace.'
                    : currentFilter === 'starred'
                    ? 'Star important documents to access them quickly from this view.'
                    : currentFilter === 'shared'
                    ? 'Documents shared with you by other team members will appear here.'
                    : searchQuery
                    ? `No documents match "${searchQuery}". Try a different search term or reset filters.`
                    : selectedTag
                    ? `No documents tagged with #${selectedTag}.`
                    : 'Get started by creating your first document in this workspace.'}
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-2">
                {searchQuery || selectedTag || currentFilter !== 'all' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedTag(null);
                      setCurrentFilter('all');
                    }}
                  >
                    Reset all filters
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsNewDocModalOpen(true)}
                    leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
                  >
                    Create First Document
                  </Button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* New Document Modal */}
      <NewDocModal
        isOpen={isNewDocModalOpen}
        onClose={() => setIsNewDocModalOpen(false)}
        onCreate={handleCreateDoc}
      />

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={isCreateWorkspaceModalOpen}
        onClose={() => setIsCreateWorkspaceModalOpen(false)}
        onCreate={handleCreateWorkspace}
      />

      {/* Move Document Modal */}
      <MoveDocModal
        isOpen={Boolean(movingDoc)}
        onClose={() => setMovingDoc(null)}
        document={movingDoc}
        workspaces={workspaces}
        currentWorkspaceId={activeWorkspace.id}
        onMove={handleMoveDoc}
      />

      {/* Reusable Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        onClose={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalConfig.onConfirm}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
      />
    </div>
  );
}
