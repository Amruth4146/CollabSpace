'use client';

import React from 'react';
import Link from 'next/link';
import { User } from '@/lib/types';
import {
  ChevronLeftIcon,
  CheckIcon,
  ShareIcon,
  MessageSquareIcon,
  HistoryIcon,
} from '../ui/icons';
import { Button } from '../ui/button';
import { DocumentOptionsMenu } from './document-options-menu';

interface EditorHeaderProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  icon?: string;
  isSaving: boolean;
  collaborators: User[];
  onOpenShare: () => void;
  commentsCount: number;
  isCommentsOpen: boolean;
  onToggleComments: () => void;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  content?: string;
  workspaceName?: string;
  onOpenShortcuts?: () => void;
  userRole?: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  collabStatus?: 'connected' | 'connecting' | 'disconnected';
}

export function EditorHeader({
  title,
  onTitleChange,
  icon = '📄',
  isSaving,
  collaborators,
  onOpenShare,
  commentsCount,
  isCommentsOpen,
  onToggleComments,
  isHistoryOpen,
  onToggleHistory,
  content = '',
  workspaceName = 'CollabSpace Workspace',
  onOpenShortcuts = () => {},
  userRole = 'editor',
  collabStatus = 'connected',
}: EditorHeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
      {/* Left: Back & Editable Title with Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <Link
          href="/dashboard"
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
          title="Back to Dashboard"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </Link>

        <span className="text-xl shrink-0 hidden sm:inline-block">{icon}</span>

        <div className="min-w-0 flex-1 max-w-md lg:max-w-xl">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium truncate mb-0.5">
            <Link href="/dashboard" className="hover:text-indigo-600 transition-colors truncate">
              {workspaceName}
            </Link>
            <span>/</span>
            <span>Documents</span>
          </div>
          <input
            type="text"
            value={title}
            disabled={userRole === 'viewer' || userRole === 'commenter'}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full font-bold text-sm sm:text-base text-slate-900 bg-transparent hover:bg-slate-100/70 focus:bg-white rounded px-2 py-0.5 outline-none border border-transparent focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 truncate transition-colors disabled:cursor-not-allowed"
            placeholder="Untitled Document..."
          />
        </div>

        {/* Live Sync / Save Status Badge */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 shrink-0 pl-1">
          {userRole === 'viewer' ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600">
              View Only
            </span>
          ) : userRole === 'commenter' ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
              Comment Only
            </span>
          ) : collabStatus === 'connecting' ? (
            <span className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/80 text-[11px] font-medium">
              <span className="w-2 h-2 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              <span>Connecting...</span>
            </span>
          ) : isSaving ? (
            <span className="flex items-center gap-1.5 text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200/80 text-[11px] font-medium">
              <span className="w-2 h-2 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
              <span>Saving...</span>
            </span>
          ) : collabStatus === 'connected' ? (
            <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80 text-[11px] font-semibold tracking-wide" title="Live real-time CRDT room connected">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live CRDT</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400 hover:text-slate-600 cursor-default text-[11px]" title="Saved to PostgreSQL">
              <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span>Saved</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: Presence Avatars, Share, Comments, History */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Collaborators Stack */}
        <div className="flex -space-x-1.5 overflow-hidden items-center mr-1">
          {collaborators.map((c) => (
            <div
              key={c.id}
              className="relative group cursor-pointer"
            >
              <div
                className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white shadow-2xs hover:scale-110 transition-transform"
                style={{ backgroundColor: c.color }}
              >
                {c.name[0]}
              </div>
              <span
                className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-1 ring-white ${
                  c.status === 'online' ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
              />

              {/* Tooltip on hover */}
              <div className="absolute right-0 top-full mt-2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
                <span className="font-semibold">{c.name}</span>
                <span className="text-slate-400 capitalize">{c.role} • {c.status}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Comments Toggle */}
        <button
          onClick={onToggleComments}
          className={`p-2 rounded-xl transition-colors relative ${
            isCommentsOpen
              ? 'bg-indigo-50 text-indigo-700 font-semibold'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
          title="Toggle comments"
          aria-label="Toggle comments"
        >
          <MessageSquareIcon className="w-4 h-4" />
          {commentsCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" />
          )}
        </button>

        {/* History Toggle */}
        <button
          onClick={onToggleHistory}
          className={`p-2 rounded-xl transition-colors ${
            isHistoryOpen
              ? 'bg-indigo-50 text-indigo-700 font-semibold'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
          title="Toggle version history"
          aria-label="Toggle version history"
        >
          <HistoryIcon className="w-4 h-4" />
        </button>

        {/* Share Button */}
        <Button
          onClick={onOpenShare}
          variant="primary"
          size="sm"
          leftIcon={<ShareIcon className="w-3.5 h-3.5" />}
        >
          <span className="hidden sm:inline">Share</span>
        </Button>

        {/* Document Options Dropdown */}
        <DocumentOptionsMenu
          title={title}
          content={content}
          onOpenShortcuts={onOpenShortcuts}
        />
      </div>
    </header>
  );
}
