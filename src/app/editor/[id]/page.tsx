'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  MOCK_COMMENTS,
  MOCK_VERSIONS,
  MOCK_COLLABORATORS,
  MOCK_DOCUMENTS,
  CURRENT_USER,
} from '@/lib/mock-data';
import { DocumentItem, CommentItem, VersionEntry, User } from '@/lib/types';
import { EditorHeader } from '@/components/editor/editor-header';
import { TipTapEditor } from '@/components/editor/tiptap-editor';
import { CommentsSidebar } from '@/components/editor/comments-sidebar';
import { HistorySidebar } from '@/components/editor/history-sidebar';
import { ShareModal } from '@/components/editor/share-modal';
import { ShortcutsModal } from '@/components/editor/shortcuts-modal';
import { ShieldIcon, ArrowLeftIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

function DocumentEditorContent() {
  const params = useParams();
  const { toast, success } = useToast();

  const docId = params?.id as string;

  const [documentData, setDocumentData] = useState<DocumentItem | null>(null);
  const [workspaceName, setWorkspaceName] = useState('CollabSpace Workspace');
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'>('editor');
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<{ status: number; message: string } | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sidebars & Modals
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Comments and Version states
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>(MOCK_VERSIONS);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [collaborators, setCollaborators] = useState<User[]>(MOCK_COLLABORATORS);
  const [collabToken, setCollabToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User>(CURRENT_USER);
  const [collabStatus, setCollabStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  // Debounce timers for autosave
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch comments from PostgreSQL
  const loadComments = useCallback(async () => {
    if (!docId) return;
    if (docId.startsWith('doc-') || docId === 'demo') {
      setComments(MOCK_COMMENTS);
      return;
    }
    try {
      const res = await fetch(`/api/documents/${docId}/comments`);
      if (res.ok) {
        const data = await res.json();
        if (data.comments) {
          setComments(data.comments);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch comments:', e);
    }
  }, [docId]);

  // Fetch version snapshots
  const loadVersions = useCallback(async () => {
    if (!docId || docId.startsWith('doc-') || docId === 'demo') return;
    setIsLoadingVersions(true);
    try {
      const res = await fetch(`/api/documents/${docId}/versions`);
      if (res.ok) {
        const data = await res.json();
        if (data.versions && data.versions.length > 0) {
          setVersions(data.versions);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch versions:', e);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [docId]);

  // Fetch document from PostgreSQL
  useEffect(() => {
    let isMounted = true;
    async function loadDocument() {
      // Fast path: pre-populated demo documents load asynchronously
      const demoDoc = MOCK_DOCUMENTS.find((d) => d.id === docId);
      if (demoDoc) {
        if (isMounted) {
          setDocumentData(demoDoc);
          setTitle(demoDoc.title);
          setContent(demoDoc.content);
          setWorkspaceName('Acme Product Team');
          setUserRole('editor');
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setAuthError(null);

      try {
        const res = await fetch(`/api/documents/${docId}`);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (isMounted) {
            setAuthError({
              status: res.status,
              message:
                errData.error ||
                (res.status === 403
                  ? 'You do not have permission to access this document.'
                  : res.status === 404
                  ? 'The requested document could not be found.'
                  : 'Failed to load document.'),
            });
          }
          return;
        }

        const data = await res.json();
        if (isMounted && data.document) {
          setDocumentData(data.document);
          setTitle(data.document.title);
          setContent(data.document.content);
          if (data.document.workspace?.name) {
            setWorkspaceName(data.document.workspace.name);
          }
          if (data.userRole) {
            setUserRole(data.userRole);
          }
          if (data.collabToken) {
            setCollabToken(data.collabToken);
          }
          if (data.currentUser) {
            setCurrentUser({
              id: data.currentUser.id,
              name: data.currentUser.name,
              email: data.currentUser.email,
              avatar: data.currentUser.avatar || '',
              role: data.userRole || 'editor',
              color: '#4F46E5',
              status: 'online',
            });
          }
          // Load version history and comments
          loadVersions();
          loadComments();
        }
      } catch (err) {
        console.error('Failed to load document:', err);
        const demoDoc = MOCK_DOCUMENTS.find((d) => d.id === docId);
        if (demoDoc && isMounted) {
          setDocumentData(demoDoc);
          setTitle(demoDoc.title);
          setContent(demoDoc.content);
          setWorkspaceName('Acme Product Team');
          setUserRole('editor');
          return;
        }
        if (isMounted) {
          setAuthError({
            status: 500,
            message: 'A network error occurred while loading this document.',
          });
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadDocument();
    return () => {
      isMounted = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [docId, loadVersions, loadComments]);

  // Keyboard shortcut for Cmd+/ or Ctrl+/
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Real-time synchronization for comment updates from WebSocket
  useEffect(() => {
    const handleCommentUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail || detail.docId === docId || !detail.docId) {
        loadComments();
      }
    };

    window.addEventListener('collabspace:comment_update', handleCommentUpdate);
    return () => {
      window.removeEventListener('collabspace:comment_update', handleCommentUpdate);
    };
  }, [docId, loadComments]);

  // Autosave content changes to PostgreSQL
  const handleContentChange = useCallback((newHtml: string) => {
    if (userRole === 'viewer' || userRole === 'commenter') return;
    setContent(newHtml);
    setIsSaving(true);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (docId?.startsWith('doc-') || docId === 'demo') {
        setIsSaving(false);
        return;
      }
      try {
        await fetch(`/api/documents/${docId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newHtml }),
        });
      } catch (err) {
        console.error('Autosave content failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, 800);
  }, [docId, userRole]);

  // Autosave title changes to PostgreSQL
  const handleTitleChange = useCallback((newTitle: string) => {
    if (userRole === 'viewer' || userRole === 'commenter') return;
    setTitle(newTitle);
    setIsSaving(true);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (docId?.startsWith('doc-') || docId === 'demo') {
        setIsSaving(false);
        toast({ title: 'Title saved', variant: 'info' });
        return;
      }
      try {
        const res = await fetch(`/api/documents/${docId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        if (res.ok) {
          toast({ title: 'Title saved', variant: 'info' });
        }
      } catch (err) {
        console.error('Autosave title failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, 600);
  }, [docId, toast, userRole]);

  // Stabilized callbacks for TipTapEditor to prevent unnecessary provider teardown
  const handleCollaboratorsChange = useCallback((activeUsers: User[]) => {
    setCollaborators(activeUsers);
  }, []);

  const handleConnectionStatusChange = useCallback((status: 'connected' | 'connecting' | 'disconnected') => {
    setCollabStatus(status);
  }, []);

  const handleOpenShortcuts = useCallback(() => {
    setIsShortcutsOpen(true);
  }, []);

  // Start comment on selected quote
  const handleStartComment = useCallback((quote: string) => {
    setActiveQuote(quote);
    setIsCommentsOpen(true);
    setIsHistoryOpen(false);
  }, []);

  // Jump to quoted text in document
  const handleSelectQuote = useCallback((quote: string) => {
    if (!quote) return;
    const container = document.querySelector('.tiptap-container') || document.querySelector('.tiptap');
    if (!container) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.includes(quote)) {
        const el = node.parentElement;
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-amber-100', 'transition-colors', 'duration-500', 'rounded');
          setTimeout(() => {
            el.classList.remove('bg-amber-100', 'transition-colors', 'duration-500', 'rounded');
          }, 2000);
          break;
        }
      }
    }
  }, []);

  // Add Comment (PostgreSQL API)
  const handleAddComment = async (text: string, quote?: string) => {
    if (docId?.startsWith('doc-') || docId === 'demo') {
      const newComment: CommentItem = {
        id: `cmt-${Date.now()}`,
        documentId: docId,
        author: currentUser,
        text,
        createdAt: 'Just now',
        resolved: false,
        selectedTextSnippet: quote,
        replies: [],
      };
      setComments((prev) => [newComment, ...prev]);
      setActiveQuote(null);
      success('Comment posted.');
      return;
    }

    try {
      const res = await fetch(`/api/documents/${docId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, quote }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.comment) {
          setComments((prev) => [data.comment, ...prev]);
        }
        setActiveQuote(null);
        success('Comment posted.');
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || 'Failed to post comment', variant: 'error' });
      }
    } catch (err) {
      console.error('Error posting comment:', err);
      toast({ title: 'Network error posting comment', variant: 'error' });
    }
  };

  // Reply to Comment (PostgreSQL API)
  const handleReplyComment = async (commentId: string, text: string) => {
    if (docId?.startsWith('doc-') || docId === 'demo') {
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              replies: [
                ...c.replies,
                {
                  id: `rep-${Date.now()}`,
                  commentId,
                  author: currentUser,
                  text,
                  createdAt: 'Just now',
                },
              ],
            };
          }
          return c;
        })
      );
      success('Reply posted.');
      return;
    }

    try {
      const res = await fetch(`/api/documents/${docId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, parentId: commentId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.comment) {
          setComments((prev) =>
            prev.map((c) => {
              if (c.id === commentId) {
                return {
                  ...c,
                  replies: [...c.replies, data.comment],
                };
              }
              return c;
            })
          );
        }
        success('Reply posted.');
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || 'Failed to post reply', variant: 'error' });
      }
    } catch (err) {
      console.error('Error replying to comment:', err);
      toast({ title: 'Network error posting reply', variant: 'error' });
    }
  };

  // Toggle Resolve (PostgreSQL API)
  const handleToggleResolve = async (commentId: string) => {
    const target = comments.find((c) => c.id === commentId);
    if (!target) return;
    const newResolved = !target.resolved;

    if (docId?.startsWith('doc-') || docId === 'demo') {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, resolved: newResolved } : c))
      );
      success(newResolved ? 'Thread marked as resolved.' : 'Thread reopened.');
      return;
    }

    try {
      const res = await fetch(`/api/documents/${docId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: newResolved }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.comment) {
          setComments((prev) =>
            prev.map((c) => (c.id === commentId ? { ...c, resolved: data.comment.resolved } : c))
          );
        }
        success(newResolved ? 'Thread marked as resolved.' : 'Thread reopened.');
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || 'Failed to update thread status', variant: 'error' });
      }
    } catch (err) {
      console.error('Error updating comment resolve state:', err);
      toast({ title: 'Network error updating thread', variant: 'error' });
    }
  };

  // Delete Comment (PostgreSQL API)
  const handleDeleteComment = async (commentId: string) => {
    if (docId?.startsWith('doc-') || docId === 'demo') {
      setComments((prev) =>
        prev
          .filter((c) => c.id !== commentId)
          .map((c) => ({
            ...c,
            replies: c.replies.filter((r) => r.id !== commentId),
          }))
      );
      success('Comment deleted.');
      return;
    }

    try {
      const res = await fetch(`/api/documents/${docId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setComments((prev) =>
          prev
            .filter((c) => c.id !== commentId)
            .map((c) => ({
              ...c,
              replies: c.replies.filter((r) => r.id !== commentId),
            }))
        );
        success('Comment deleted.');
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || 'Failed to delete comment', variant: 'error' });
      }
    } catch (err) {
      console.error('Error deleting comment:', err);
      toast({ title: 'Network error deleting comment', variant: 'error' });
    }
  };

  // Create Manual Version Checkpoint
  const handleCreateCheckpoint = async (customTitle?: string, customSummary?: string) => {
    if (docId?.startsWith('doc-') || docId === 'demo') {
      const newVer: VersionEntry = {
        id: `ver-${Date.now()}`,
        documentId: docId,
        versionNumber: `v${versions.length + 1}`,
        timestamp: 'Just now',
        author: currentUser,
        summary: customSummary || 'Manual snapshot checkpoint',
        changes: { added: 12, removed: 0 },
        contentSnapshot: content,
      };
      setVersions((prev) => [newVer, ...prev]);
      success('Version checkpoint saved.');
      return;
    }

    try {
      const res = await fetch(`/api/documents/${docId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: customTitle, changeSummary: customSummary }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.version) {
          setVersions((prev) => [data.version, ...prev]);
          success(`Version checkpoint ${data.version.versionNumber} saved.`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || 'Failed to create checkpoint', variant: 'error' });
      }
    } catch (err) {
      console.error('Error creating checkpoint:', err);
      toast({ title: 'Network error saving checkpoint', variant: 'error' });
    }
  };

  // Safe Restore Version
  const handleRestoreVersion = async (version: VersionEntry) => {
    if (!docId?.startsWith('doc-') && docId !== 'demo') {
      try {
        const res = await fetch(`/api/documents/${docId}/versions/${version.id}/restore`, {
          method: 'POST',
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast({ title: errData.error || 'Failed to restore version', variant: 'error' });
          return;
        }
        await loadVersions();
      } catch (err) {
        console.error('Failed to restore version:', err);
        toast({ title: 'Network error restoring version', variant: 'error' });
        return;
      }
    }

    if (version.contentSnapshot) {
      setContent(version.contentSnapshot);
    }
    success(`Document safely restored to version ${version.versionNumber}.`);
    setIsHistoryOpen(false);
  };

  // Invite Collaborator
  const handleInviteCollaborator = (email: string, role: string) => {
    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: email.split('@')[0],
      email,
      avatar: '',
      role: role as 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer',
      color: '#8B5CF6',
      status: 'online',
    };
    setCollaborators((prev) => [...prev, newUser]);
    success(`Invite sent to ${email} as ${role}.`);
  };

  // Access Denied / 403 / 404 Error State
  if (authError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto ring-8 ring-rose-50/50">
            <ShieldIcon className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">
              {authError.status === 403
                ? 'Access Restricted'
                : authError.status === 404
                ? 'Document Not Found'
                : 'Error Loading Document'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              {authError.message}
            </p>
          </div>

          <div className="pt-2">
            <Link href="/dashboard">
              <Button variant="primary" size="md" className="w-full justify-center">
                <ArrowLeftIcon className="w-4 h-4 mr-2" />
                Return to Workspace Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading Skeleton State
  if (isLoading || !documentData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-200 animate-pulse" />
            <div className="w-48 h-4 rounded bg-slate-200 animate-pulse" />
          </div>
          <div className="w-24 h-8 rounded bg-slate-200 animate-pulse" />
        </header>
        <div className="flex-1 max-w-4xl w-full mx-auto p-12 space-y-4">
          <div className="w-3/4 h-8 rounded bg-slate-200 animate-pulse" />
          <div className="w-full h-4 rounded bg-slate-100 animate-pulse" />
          <div className="w-5/6 h-4 rounded bg-slate-100 animate-pulse" />
          <div className="w-2/3 h-4 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Top Document Header */}
      <EditorHeader
        title={title}
        onTitleChange={handleTitleChange}
        icon={documentData.icon}
        isSaving={isSaving}
        collaborators={collaborators}
        collabStatus={collabStatus}
        onOpenShare={() => setIsShareModalOpen(true)}
        commentsCount={comments.filter((c) => !c.resolved).length}
        isCommentsOpen={isCommentsOpen}
        onToggleComments={() => {
          setIsCommentsOpen(!isCommentsOpen);
          if (!isCommentsOpen) setIsHistoryOpen(false);
        }}
        isHistoryOpen={isHistoryOpen}
        onToggleHistory={() => {
          setIsHistoryOpen(!isHistoryOpen);
          if (!isHistoryOpen) setIsCommentsOpen(false);
        }}
        content={content}
        workspaceName={workspaceName}
        userRole={userRole}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Editor Body + Collapsible Sidebars */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* TipTap Rich Text Editor */}
        <TipTapEditor
          documentId={docId}
          initialContent={documentData.content}
          onChange={handleContentChange}
          readOnly={userRole === 'viewer' || userRole === 'commenter'}
          canComment={userRole !== 'viewer'}
          onStartComment={handleStartComment}
          onOpenShortcuts={handleOpenShortcuts}
          sessionToken={collabToken}
          currentUser={currentUser}
          onCollaboratorsChange={handleCollaboratorsChange}
          onConnectionStatusChange={handleConnectionStatusChange}
        />

        {/* Comments Sidebar */}
        <CommentsSidebar
          isOpen={isCommentsOpen}
          onClose={() => setIsCommentsOpen(false)}
          comments={comments}
          currentUser={currentUser}
          canComment={userRole !== 'viewer'}
          userRole={userRole}
          activeQuote={activeQuote}
          onClearQuote={() => setActiveQuote(null)}
          onSelectQuote={handleSelectQuote}
          onAddComment={handleAddComment}
          onReplyComment={handleReplyComment}
          onToggleResolve={handleToggleResolve}
          onDeleteComment={handleDeleteComment}
        />

        {/* History Sidebar */}
        <HistorySidebar
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          versions={versions}
          isLoading={isLoadingVersions}
          onRestoreVersion={handleRestoreVersion}
          onCreateCheckpoint={handleCreateCheckpoint}
          userRole={userRole}
        />
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        documentTitle={title}
        collaborators={collaborators}
        onInvite={handleInviteCollaborator}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}

export default function DocumentEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading editor...</span>
          </div>
        </div>
      }
    >
      <DocumentEditorContent />
    </Suspense>
  );
}
