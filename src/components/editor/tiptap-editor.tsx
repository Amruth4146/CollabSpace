'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import CharacterCount from '@tiptap/extension-character-count';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import { EditorToolbar } from './editor-toolbar';
import { FloatingBubbleMenu } from './floating-bubble-menu';
import { SlashCommandMenu } from './slash-command-menu';
import { LinkDialog, isValidLinkUrl } from './link-dialog';
import { UsersIcon, SparklesIcon, CheckIcon } from '../ui/icons';
import { User } from '@/lib/types';

export interface TipTapEditorProps {
  documentId?: string;
  initialContent: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  canComment?: boolean;
  onStartComment?: (quote: string) => void;
  onOpenShortcuts?: () => void;
  sessionToken?: string | null;
  currentUser?: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    color?: string;
  } | null;
  onCollaboratorsChange?: (collaborators: User[]) => void;
  onConnectionStatusChange?: (status: 'connected' | 'connecting' | 'disconnected') => void;
}

interface TipTapEditorCanvasProps {
  documentId: string;
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  initialContent: string;
  readOnly: boolean;
  canComment?: boolean;
  onStartComment?: (quote: string) => void;
  onChange?: (html: string) => void;
  onOpenShortcuts?: () => void;
  currentUser?: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    color?: string;
  } | null;
  collabStatus: 'connected' | 'connecting' | 'disconnected';
  activePeers: Array<{ id: string; name: string; color: string; isSelf: boolean }>;
}

function TipTapEditorCanvas({
  ydoc,
  provider,
  initialContent,
  readOnly,
  canComment = true,
  onStartComment,
  onChange,
  onOpenShortcuts,
  currentUser,
  collabStatus,
  activePeers,
}: TipTapEditorCanvasProps) {
  // Focus Mode state
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Link Dialog state
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkInitialUrl, setLinkInitialUrl] = useState('');
  const [linkInitialText, setLinkInitialText] = useState('');
  const [hasSelectionText, setHasSelectionText] = useState(false);

  // Slash Command Menu state
  const [slashState, setSlashState] = useState<{
    isOpen: boolean;
    query: string;
    range: { from: number; to: number } | null;
    position: { top: number; left: number };
  }>({
    isOpen: false,
    query: '',
    range: null,
    position: { top: 0, left: 0 },
  });

  const editorRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Safe user color
  const safeUserColor = currentUser?.color && /^#[0-9a-fA-F]{6}$/.test(currentUser.color)
    ? currentUser.color
    : '#4F46E5';

  // Initialize TipTap Editor with Yjs CRDT and Collaborative Carets
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        // Collaborative UndoManager is managed by the Collaboration extension
        undoRedo: false,
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-indigo-600 underline underline-offset-2 hover:text-indigo-800 transition-colors cursor-pointer',
          rel: 'noopener noreferrer nofollow',
        },
        validate: (href) => isValidLinkUrl(href),
      }),
      Placeholder.configure({
        placeholder: "Write something, or press '/' for commands...",
        emptyEditorClass: 'is-editor-empty',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      CharacterCount,
      Collaboration.configure({
        document: ydoc,
        field: 'default',
      }),
      CollaborationCaret.configure({
        provider: provider,
        user: {
          name: currentUser?.name || 'Collaborator',
          color: safeUserColor,
        },
      }),
    ],
    content: initialContent,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getHTML());

      // Check for Slash Command trigger "/"
      const { selection } = editor.state;
      const { $from } = selection;

      if (selection.empty) {
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, ' ');
        const slashIndex = textBefore.lastIndexOf('/');

        if (slashIndex !== -1 && (slashIndex === 0 || textBefore[slashIndex - 1] === ' ')) {
          const query = textBefore.slice(slashIndex + 1);
          if (!query.includes(' ')) {
            const fromPos = $from.pos - query.length - 1;
            const toPos = $from.pos;

            try {
              const coords = editor.view.coordsAtPos(fromPos);
              setSlashState({
                isOpen: true,
                query,
                range: { from: fromPos, to: toPos },
                position: { top: coords.bottom, left: coords.left },
              });
              return;
            } catch (err) {
              console.warn('Coordinates lookup failed:', err);
            }
          }
        }
      }

      setSlashState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    },
  });

  // Open Link Dialog handler
  const handleOpenLinkDialog = useCallback(() => {
    if (!editor) return;
    const { selection } = editor.state;
    const selectedText = editor.state.doc.textBetween(selection.from, selection.to, ' ');
    const previousUrl = (editor.getAttributes('link').href as string) || '';

    setLinkInitialUrl(previousUrl);
    setLinkInitialText(selectedText);
    setHasSelectionText(selectedText.trim().length > 0);
    setIsLinkDialogOpen(true);
  }, [editor]);

  // Apply Link from Dialog
  const handleApplyLink = useCallback(
    (url: string, text?: string) => {
      if (!editor) return;

      if (text && (!hasSelectionText || editor.state.selection.empty)) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            text: text,
            marks: [{ type: 'link', attrs: { href: url } }],
          })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href: url })
          .run();
      }
    },
    [editor, hasSelectionText]
  );

  // Remove Link
  const handleRemoveLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  }, [editor]);

  // Global event listener for custom link dialog events
  useEffect(() => {
    const handleCustomLinkEvent = () => handleOpenLinkDialog();
    window.addEventListener('collabspace:open-link-dialog', handleCustomLinkEvent);
    return () => window.removeEventListener('collabspace:open-link-dialog', handleCustomLinkEvent);
  }, [handleOpenLinkDialog]);

  // Keyboard shortcut listener for Ctrl+K (Link) and Esc (Close / Focus Mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleOpenLinkDialog();
      } else if (e.key === 'Escape') {
        if (slashState.isOpen) {
          setSlashState((prev) => ({ ...prev, isOpen: false }));
        } else if (isFocusMode) {
          setIsFocusMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenLinkDialog, slashState.isOpen, isFocusMode]);

  // Synchronize readOnly changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  // Update awareness user info if user profile attributes change
  useEffect(() => {
    if (provider?.awareness && currentUser) {
      provider.awareness.setLocalStateField('user', {
        name: currentUser.name,
        color: safeUserColor,
        avatar: currentUser.avatar || '',
      });
    }
  }, [provider, currentUser, safeUserColor]);

  // Calculate live statistics
  const wordCount = editor?.storage.characterCount?.words() ?? 0;
  const charCount = editor?.storage.characterCount?.characters() ?? 0;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  const otherPeers = activePeers.filter((p) => !p.isSelf);

  return (
    <div
      ref={editorRef}
      className={`flex-1 flex flex-col min-h-0 transition-colors duration-200 ${
        isFocusMode ? 'bg-white' : 'bg-slate-50/50'
      }`}
    >
      {/* Formatting Toolbar */}
      <EditorToolbar
        editor={editor}
        isFocusMode={isFocusMode}
        onToggleFocusMode={() => setIsFocusMode((prev) => !prev)}
        onOpenLinkDialog={handleOpenLinkDialog}
        onOpenShortcuts={onOpenShortcuts}
        readOnly={readOnly}
      />

      {/* Floating Selection Bubble Menu */}
      <FloatingBubbleMenu
        editor={editor}
        onOpenLinkDialog={handleOpenLinkDialog}
        onStartComment={onStartComment}
        canComment={canComment}
      />

      {/* Slash Command Autocomplete Popover */}
      <SlashCommandMenu
        editor={editor}
        isOpen={slashState.isOpen && !readOnly}
        query={slashState.query}
        range={slashState.range}
        position={slashState.position}
        onClose={() => setSlashState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Link Insertion / Edit Modal */}
      <LinkDialog
        isOpen={isLinkDialogOpen}
        initialUrl={linkInitialUrl}
        initialText={linkInitialText}
        hasSelectionText={hasSelectionText}
        onApply={handleApplyLink}
        onRemove={handleRemoveLink}
        onClose={() => setIsLinkDialogOpen(false)}
      />

      {/* Editor Main Canvas */}
      <div
        className={`flex-1 overflow-y-auto flex justify-center transition-all duration-300 ${
          isFocusMode
            ? 'px-4 py-6 sm:px-12 sm:py-10'
            : 'px-4 py-8 sm:px-8 sm:py-12'
        }`}
      >
        <div
          className={`w-full transition-all duration-200 ${
            isFocusMode
              ? 'max-w-3xl bg-transparent min-h-[800px] relative px-2 sm:px-6'
              : 'max-w-4xl bg-white rounded-2xl border border-slate-200/90 shadow-xl shadow-slate-200/40 p-8 sm:p-14 min-h-[750px] relative'
          }`}
        >
          {/* Real-time CRDT Status Banner (Hidden in Focus Mode) */}
          {!isFocusMode && (
            <div className="mb-8 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50 text-indigo-900 text-xs flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                {collabStatus === 'connected' ? (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                ) : collabStatus === 'connecting' ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                )}
                <span>
                  <strong>{collabStatus === 'connected' ? 'Live Sync Active:' : collabStatus === 'connecting' ? 'Connecting:' : 'Offline Mode:'}</strong>{' '}
                  {collabStatus === 'connected'
                    ? 'Synchronizing in real-time. Edits merge automatically without page refresh.'
                    : collabStatus === 'connecting'
                    ? 'Connecting to collaboration service...'
                    : 'Changes saved locally & to PostgreSQL.'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 bg-white px-2.5 py-1 rounded-md border border-indigo-200 text-[11px] font-medium text-indigo-700 shadow-2xs">
                <UsersIcon className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  {activePeers.length} {activePeers.length === 1 ? 'Peer in room' : 'Peers in room'}
                </span>
              </div>
            </div>
          )}

          {/* Active TipTap Content */}
          <EditorContent
            editor={editor}
            className="tiptap-container focus:outline-none"
          />

          {/* Collaborator Presence Bar in Margin */}
          {!isFocusMode && (
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              {otherPeers.length > 0 ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-slate-400 font-medium">Active Collaborators:</span>
                  {otherPeers.map((peer) => (
                    <div key={peer.id} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-xs"
                        style={{ backgroundColor: peer.color }}
                      />
                      <span className="text-slate-700 font-medium">{peer.name}</span>
                      <span className="text-[11px] text-slate-400">editing live</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-400">
                  <UsersIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>You are editing live. Open this document in another tab to test concurrent editing.</span>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                <span>Auto-saved to PostgreSQL</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status & Live Metrics Bar */}
      <div className="h-8 border-t border-slate-200/80 bg-white/95 backdrop-blur-xs px-4 sm:px-6 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span>
            <strong className="text-slate-700 font-semibold">{wordCount}</strong> {wordCount === 1 ? 'word' : 'words'}
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span>
            <strong className="text-slate-700 font-semibold">{charCount}</strong> {charCount === 1 ? 'character' : 'characters'}
          </span>
          <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300" />
          <span className="hidden sm:inline-block">~{readTimeMin} min read</span>
        </div>

        <div className="flex items-center gap-2">
          {readOnly ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
              Viewer Mode (Read-Only)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500">
              <SparklesIcon className="w-3 h-3 text-indigo-500" />
              <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] border border-slate-200">/</kbd> for commands</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface CollabSession {
  key: string;
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  refCount: number;
  destroyTimer: NodeJS.Timeout | null;
  status: 'connected' | 'connecting' | 'disconnected';
  peers: Array<{ id: string; name: string; color: string; isSelf: boolean }>;
  users: User[];
  listeners: Set<() => void>;
  ticket: string | null;
  refreshTimer: NodeJS.Timeout | null;
  refreshAbortController: AbortController | null;
  isRefreshing: boolean;
  isDestroyed: boolean;
}

const collabSessionStore = new Map<string, CollabSession>();
const messageAuth = 2;

/**
 * Safely refreshes the short-lived collaboration ticket via HTTP POST.
 * Guarantees:
 * - Single in-flight request deduplication.
 * - Format and structure validation before usage.
 * - In-band reauthorization over WebSocket if connected.
 * - Graceful retry with bounded backoff.
 * - Safe handling of component unmount and destroyed sessions.
 */
async function refreshCollabTicket(
  session: CollabSession,
  docId: string
): Promise<string | null> {
  if (session.isDestroyed || session.isRefreshing) {
    return null;
  }
  session.isRefreshing = true;

  if (session.refreshAbortController) {
    session.refreshAbortController.abort();
  }
  const abortCtrl = new AbortController();
  session.refreshAbortController = abortCtrl;

  try {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts <= maxAttempts && !session.isDestroyed) {
      try {
        const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/collab-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          signal: abortCtrl.signal,
        });

        if (res.ok) {
          const data = await res.json();
          const newTicket = data.ticket || data.collabToken;

          // Validate returned ticket format: string, non-empty, two base64url parts
          if (
            typeof newTicket === 'string' &&
            newTicket.length > 20 &&
            newTicket.split('.').length === 2
          ) {
            if (!session.isDestroyed) {
              session.ticket = newTicket;

              // Reauthorize existing connection in-band if WebSocket is currently open
              const ws = session.provider.ws;
              if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                  const encoder = encoding.createEncoder();
                  encoding.writeVarUint(encoder, messageAuth);
                  encoding.writeVarString(encoder, newTicket);
                  ws.send(encoding.toUint8Array(encoder));
                } catch (sendErr) {
                  console.warn('[Collab] Failed to transmit refreshed ticket in-band:', sendErr);
                }
              }
              return newTicket;
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          return null;
        }
      }

      attempts++;
      if (attempts <= maxAttempts && !session.isDestroyed) {
        await new Promise((resolve) => setTimeout(resolve, 2500 * attempts));
      }
    }
  } finally {
    session.isRefreshing = false;
  }
  return null;
}

/**
 * Creates a specialized WebSocket subclass that securely transmits the short-lived,
 * document-scoped HMAC-SHA256 authentication ticket as the first packet on open.
 * Eliminates long-lived bearer tokens from the WebSocket URL query string.
 */
function createAuthWebSocketClass(getTicket: () => string | null) {
  const BaseWebSocket = typeof window !== 'undefined' ? window.WebSocket : WebSocket;
  return class AuthWebSocket extends BaseWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);

      // Transmit signed HMAC-SHA256 authentication ticket as the first packet on open
      this.addEventListener('open', () => {
        const ticket = getTicket();
        if (ticket) {
          try {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageAuth);
            encoding.writeVarString(encoder, ticket);
            this.send(encoding.toUint8Array(encoder));
          } catch (err) {
            console.error('[Collab] Failed to transmit WebSocket auth ticket:', err);
          }
        }
      });
    }
  };
}

function getOrCreateCollabSession(
  wsUrl: string,
  docId: string,
  sessionToken: string | null
): CollabSession | null {
  if (typeof window === 'undefined') return null;

  const isDemo = docId.startsWith('doc-') || docId === 'demo' || docId === 'collabspace-demo';
  if (!isDemo && !sessionToken) {
    return null;
  }

  const key = `${wsUrl}:${docId}`;
  let session = collabSessionStore.get(key);

  if (session) {
    if (sessionToken && sessionToken !== session.ticket) {
      session.ticket = sessionToken;
    }
    if (session.destroyTimer) {
      clearTimeout(session.destroyTimer);
      session.destroyTimer = null;
    }
    return session;
  }

  const ydoc = new Y.Doc();
  const AuthWS = createAuthWebSocketClass(() => session?.ticket || sessionToken || null);

  const provider = new WebsocketProvider(wsUrl, docId, ydoc, {
    WebSocketPolyfill: AuthWS as unknown as typeof WebSocket,
    disableBc: true,
  });

  const messageComment = 3;
  provider.messageHandlers[messageComment] = (
    _encoder,
    decoder
  ) => {
    try {
      const rawJson = decoding.readVarString(decoder);
      const data = JSON.parse(rawJson);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('collabspace:comment_update', { detail: data })
        );
      }
    } catch (err) {
      console.warn('[Collab] Failed to parse comment packet:', err);
    }
  };

  session = {
    key,
    ydoc,
    provider,
    refCount: 0,
    destroyTimer: null,
    status: 'connecting',
    peers: [],
    users: [],
    listeners: new Set(),
    ticket: sessionToken,
    refreshTimer: null,
    refreshAbortController: null,
    isRefreshing: false,
    isDestroyed: false,
  };

  // Background ticket refresh every 45s for long collaborative sessions
  if (!isDemo) {
    session.refreshTimer = setInterval(() => {
      if (session && !session.isDestroyed) {
        refreshCollabTicket(session, docId).catch(() => {});
      }
    }, 45000);
  }

    const notify = () => {
      session!.listeners.forEach((listener) => listener());
    };

    provider.on('status', ({ status }: { status: 'connected' | 'connecting' | 'disconnected' }) => {
      session!.status = status;
      notify();
    });

    provider.awareness.on('change', () => {
      const states = provider.awareness.getStates();
      const myClientId = provider.awareness.clientID;
      const peers: Array<{ id: string; name: string; color: string; isSelf: boolean }> = [];
      const userList: User[] = [];

      states.forEach((state: Record<string, unknown>, clientId: number) => {
        const u = state.user as Record<string, unknown> | undefined;
        if (u && typeof u.name === 'string') {
          const peerColor = (typeof u.color === 'string' ? u.color : null) || '#4F46E5';
          peers.push({
            id: `${clientId}`,
            name: u.name,
            color: peerColor,
            isSelf: clientId === myClientId,
          });

          userList.push({
            id: (typeof u.id === 'string' ? u.id : null) || `client-${clientId}`,
            name: u.name,
            email: (typeof u.email === 'string' ? u.email : '') || '',
            avatar: (typeof u.avatar === 'string' ? u.avatar : '') || '',
            role: 'editor',
            color: peerColor,
            status: 'online',
          });
        }
      });

      session!.peers = peers;
      session!.users = userList;
      notify();
    });

    collabSessionStore.set(key, session);
    return session;
}

function releaseCollabSession(key: string) {
  const session = collabSessionStore.get(key);
  if (!session) return;

  session.refCount--;
  if (session.refCount <= 0) {
    if (session.destroyTimer) clearTimeout(session.destroyTimer);
    session.destroyTimer = setTimeout(() => {
      if (session.refCount <= 0) {
        session.isDestroyed = true;
        if (session.refreshTimer) {
          clearInterval(session.refreshTimer);
          session.refreshTimer = null;
        }
        if (session.refreshAbortController) {
          session.refreshAbortController.abort();
          session.refreshAbortController = null;
        }
        session.provider.destroy();
        session.ydoc.destroy();
        collabSessionStore.delete(key);
      }
    }, 150);
  }
}

export function TipTapEditor({
  documentId,
  initialContent,
  onChange,
  readOnly = false,
  canComment = true,
  onStartComment,
  onOpenShortcuts,
  sessionToken,
  currentUser,
  onCollaboratorsChange,
  onConnectionStatusChange,
}: TipTapEditorProps) {
  const activeDocId = documentId || 'collabspace-demo';

  // Compute WebSocket URL
  const wsUrl = useMemo(() => {
    if (process.env.NEXT_PUBLIC_COLLAB_WS_URL) {
      return process.env.NEXT_PUBLIC_COLLAB_WS_URL;
    }
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.hostname}:1234`;
    }
    return 'ws://localhost:1234';
  }, []);

  const sessionKey = `${wsUrl}:${activeDocId}`;

  // Stable subscription to external collaboration session using React's useSyncExternalStore
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const session = getOrCreateCollabSession(wsUrl, activeDocId, sessionToken || null);
      if (!session) return () => {};

      session.refCount++;
      session.listeners.add(onStoreChange);

      return () => {
        session.listeners.delete(onStoreChange);
        releaseCollabSession(sessionKey);
      };
    },
    [wsUrl, activeDocId, sessionToken, sessionKey]
  );

  const getSnapshot = useCallback(() => {
    return getOrCreateCollabSession(wsUrl, activeDocId, sessionToken || null);
  }, [wsUrl, activeDocId, sessionToken]);

  const getServerSnapshot = useCallback(() => null, []);

  const session = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Callback refs to forward events without unnecessary effect execution
  const onCollaboratorsChangeRef = useRef(onCollaboratorsChange);
  const onConnectionStatusChangeRef = useRef(onConnectionStatusChange);

  useEffect(() => {
    onCollaboratorsChangeRef.current = onCollaboratorsChange;
  }, [onCollaboratorsChange]);

  useEffect(() => {
    onConnectionStatusChangeRef.current = onConnectionStatusChange;
  }, [onConnectionStatusChange]);

  // Forward connection status changes
  useEffect(() => {
    if (!session) return;
    onConnectionStatusChangeRef.current?.(session.status);
  }, [session, session?.status]);

  // Forward collaborator changes
  useEffect(() => {
    if (!session || session.users.length === 0) return;
    onCollaboratorsChangeRef.current?.(session.users);
  }, [session, session?.users]);

  // Synchronize local awareness user attributes
  const safeColor = currentUser?.color && /^#[0-9a-fA-F]{6}$/.test(currentUser.color)
    ? currentUser.color
    : '#4F46E5';

  useEffect(() => {
    if (!session?.provider?.awareness) return;

    session.provider.awareness.setLocalStateField('user', {
      name: currentUser?.name || 'Anonymous Peer',
      color: safeColor,
      avatar: currentUser?.avatar || '',
      id: currentUser?.id,
    });
  }, [session?.provider, currentUser?.name, currentUser?.avatar, currentUser?.id, safeColor]);

  // If session not yet established, render placeholder
  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 p-12">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span>Connecting to real-time collaboration session...</span>
        </div>
      </div>
    );
  }

  return (
    <TipTapEditorCanvas
      key={activeDocId}
      documentId={activeDocId}
      ydoc={session.ydoc}
      provider={session.provider}
      initialContent={initialContent}
      readOnly={readOnly}
      canComment={canComment}
      onStartComment={onStartComment}
      onChange={onChange}
      onOpenShortcuts={onOpenShortcuts}
      currentUser={currentUser}
      collabStatus={session.status}
      activePeers={session.peers}
    />
  );
}
