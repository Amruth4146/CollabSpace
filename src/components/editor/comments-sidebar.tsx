'use client';

import React, { useState } from 'react';
import { CommentItem, User } from '@/lib/types';
import { CloseIcon, CheckIcon, SendIcon, MessageSquareIcon, TrashIcon } from '../ui/icons';
import { Button } from '../ui/button';

interface CommentsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  comments: CommentItem[];
  currentUser: User;
  canComment?: boolean;
  userRole?: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  activeQuote?: string | null;
  onClearQuote?: () => void;
  onSelectQuote?: (quote: string) => void;
  onAddComment: (text: string, quote?: string) => void;
  onReplyComment: (commentId: string, text: string) => void;
  onToggleResolve: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
}

export function CommentsSidebar({
  isOpen,
  onClose,
  comments,
  currentUser,
  canComment = true,
  userRole = 'editor',
  activeQuote,
  onClearQuote,
  onSelectQuote,
  onAddComment,
  onReplyComment,
  onToggleResolve,
  onDeleteComment,
}: CommentsSidebarProps) {
  const [filter, setFilter] = useState<'open' | 'resolved'>('open');
  const [newCommentText, setNewCommentText] = useState('');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const filteredComments = comments.filter((c) =>
    filter === 'open' ? !c.resolved : c.resolved
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    onAddComment(newCommentText.trim(), activeQuote || undefined);
    setNewCommentText('');
    onClearQuote?.();
  };

  const handleReplySubmit = (commentId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = replyTexts[commentId];
    if (!text || !text.trim()) return;
    onReplyComment(commentId, text.trim());
    setReplyTexts((prev) => ({ ...prev, [commentId]: '' }));
  };

  return (
    <aside className="w-80 sm:w-96 border-l border-slate-200/80 bg-white flex flex-col h-full shadow-lg z-30 shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquareIcon className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-sm text-slate-900">Comments</h3>
          <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
            {comments.filter((c) => !c.resolved).length} open
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Close comments"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Tabs: Open vs Resolved */}
      <div className="flex border-b border-slate-200 px-4 pt-2 text-xs font-medium">
        <button
          onClick={() => setFilter('open')}
          className={`pb-2 px-2 border-b-2 transition-colors ${
            filter === 'open'
              ? 'border-indigo-600 text-indigo-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Open ({comments.filter((c) => !c.resolved).length})
        </button>
        <button
          onClick={() => setFilter('resolved')}
          className={`pb-2 px-2 border-b-2 transition-colors ${
            filter === 'resolved'
              ? 'border-indigo-600 text-indigo-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Resolved ({comments.filter((c) => c.resolved).length})
        </button>
      </div>

      {/* New Comment Input Box / Viewer Notice */}
      {filter === 'open' && (
        <>
          {canComment ? (
            <form onSubmit={handleAddSubmit} className="p-4 border-b border-slate-100 bg-slate-50/50">
              {/* Active Quote preview */}
              {activeQuote && (
                <div className="flex items-center justify-between text-xs bg-indigo-50 border border-indigo-200 text-indigo-900 px-2.5 py-1.5 rounded-lg mb-2.5">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <MessageSquareIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate italic font-medium">&ldquo;{activeQuote}&rdquo;</span>
                  </div>
                  <button
                    type="button"
                    onClick={onClearQuote}
                    className="text-indigo-400 hover:text-indigo-700 shrink-0 ml-1.5"
                    title="Remove quote"
                  >
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full text-white font-bold text-[10px] flex items-center justify-center shrink-0 ring-1 ring-slate-200"
                  style={{ backgroundColor: currentUser.color || '#4F46E5' }}
                  title={currentUser.name}
                >
                  {currentUser.name ? currentUser.name[0].toUpperCase() : 'U'}
                </div>
                <input
                  type="text"
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder={activeQuote ? 'Comment on selected text...' : 'Leave a comment...'}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!newCommentText.trim()}
                  leftIcon={<SendIcon className="w-3 h-3" />}
                >
                  Post
                </Button>
              </div>
            </form>
          ) : (
            <div className="p-3 border-b border-slate-100 bg-slate-50/80 text-slate-500 text-xs text-center font-medium">
              Viewer role: You have read-only access to comments.
            </div>
          )}
        </>
      )}

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredComments.length > 0 ? (
          filteredComments.map((comment) => {
            const isAuthor = comment.author.id === currentUser.id;
            const isManager = userRole === 'owner' || userRole === 'admin';
            const canResolve =
              canComment &&
              (isAuthor || userRole === 'editor' || userRole === 'admin' || userRole === 'owner');
            const canDelete = isAuthor || isManager;

            return (
              <div
                key={comment.id}
                className={`rounded-xl border p-3.5 space-y-2.5 transition-all ${
                  comment.resolved
                    ? 'border-slate-200/60 bg-slate-50/60 opacity-80'
                    : 'border-slate-200 bg-white shadow-2xs hover:border-indigo-200'
                }`}
              >
                {/* Comment Author & Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full text-white font-bold text-[10px] flex items-center justify-center shrink-0"
                      style={{ backgroundColor: comment.author.color || '#4F46E5' }}
                    >
                      {comment.author.name ? comment.author.name[0].toUpperCase() : 'U'}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-900">
                        {comment.author.name}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1.5">
                        {comment.createdAt}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Resolve Button */}
                    {canResolve ? (
                      <button
                        onClick={() => onToggleResolve(comment.id)}
                        className={`p-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                          comment.resolved
                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-100'
                        }`}
                        title={comment.resolved ? 'Reopen thread' : 'Mark as resolved'}
                      >
                        <CheckIcon className="w-3.5 h-3.5" />
                        <span className="text-[10px]">{comment.resolved ? 'Resolved' : 'Resolve'}</span>
                      </button>
                    ) : (
                      comment.resolved && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                          Resolved
                        </span>
                      )
                    )}

                    {/* Delete Button */}
                    {canDelete && (
                      <button
                        onClick={() => onDeleteComment?.(comment.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1"
                        title="Delete thread"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Anchored Quote snippet if present */}
                {comment.selectedTextSnippet && (
                  <div
                    onClick={() => onSelectQuote?.(comment.selectedTextSnippet!)}
                    className="text-[11px] text-indigo-900 bg-indigo-50/70 border-l-2 border-indigo-400 pl-2.5 py-1.5 rounded-r cursor-pointer hover:bg-indigo-100/70 transition-colors flex items-center justify-between group"
                    title="Click to jump to selected text in editor"
                  >
                    <span className="italic truncate">&ldquo;{comment.selectedTextSnippet}&rdquo;</span>
                    <span className="text-[9px] font-semibold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                      Scroll to text &rarr;
                    </span>
                  </div>
                )}

                {/* Comment text */}
                <p className="text-xs text-slate-800 leading-relaxed font-medium break-words">
                  {comment.text}
                </p>

                {/* Threaded Replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="pt-2 pl-3 border-l-2 border-slate-100 space-y-2">
                    {comment.replies.map((reply) => {
                      const isReplyAuthor = reply.author.id === currentUser.id;
                      const canDeleteReply = isReplyAuthor || isManager;

                      return (
                        <div key={reply.id} className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center shrink-0"
                                style={{ backgroundColor: reply.author.color || '#4F46E5' }}
                              >
                                {reply.author.name ? reply.author.name[0].toUpperCase() : 'U'}
                              </div>
                              <span className="text-[11px] font-semibold text-slate-800">
                                {reply.author.name}
                              </span>
                              <span className="text-[9px] text-slate-400">
                                {reply.createdAt}
                              </span>
                            </div>

                            {canDeleteReply && (
                              <button
                                onClick={() => onDeleteComment?.(reply.id)}
                                className="p-0.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Delete reply"
                              >
                                <TrashIcon className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 pl-5.5 break-words">
                            {reply.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply Input Box */}
                {!comment.resolved && canComment && (
                  <form
                    onSubmit={(e) => handleReplySubmit(comment.id, e)}
                    className="pt-2 flex gap-1.5"
                  >
                    <input
                      type="text"
                      value={replyTexts[comment.id] || ''}
                      onChange={(e) =>
                        setReplyTexts((prev) => ({ ...prev, [comment.id]: e.target.value }))
                      }
                      placeholder="Reply to thread..."
                      className="flex-1 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="xs"
                      disabled={!replyTexts[comment.id]?.trim()}
                    >
                      Reply
                    </Button>
                  </form>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-slate-400 space-y-2">
            <MessageSquareIcon className="w-8 h-8 mx-auto opacity-40 text-slate-400" />
            <p className="text-xs font-medium">
              {filter === 'open' ? 'No open comments' : 'No resolved comments'}
            </p>
            <p className="text-[11px] text-slate-400 px-4">
              {filter === 'open'
                ? canComment
                  ? 'Select text in the editor to comment on a snippet, or use the box above to start a discussion.'
                  : 'No open comments on this document.'
                : 'Resolved feedback threads will appear here.'}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
