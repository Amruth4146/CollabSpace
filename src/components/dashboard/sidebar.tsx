'use client';

import React from 'react';
import Link from 'next/link';
import { Workspace, User } from '@/lib/types';
import {
  DocumentIcon,
  StarIcon,
  UsersIcon,
  CloseIcon,
  ChevronLeftIcon,
  LogoIcon,
  TrashIcon,
  SettingsIcon,
  ArchiveIcon,
  ClockIcon,
} from '../ui/icons';
import { WorkspaceSwitcher } from './workspace-switcher';
import { UserMenu } from './user-menu';

export type DocumentFilter = 'all' | 'recent' | 'starred' | 'shared' | 'archived' | 'trash';

interface SidebarProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onSelectWorkspace: (ws: Workspace) => void;
  currentUser: User;
  currentFilter: DocumentFilter;
  onFilterChange: (filter: DocumentFilter) => void;
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
  availableTags: string[];
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  trashCount?: number;
  archiveCount?: number;
  onCreateWorkspace?: () => void;
}

export function Sidebar({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  currentUser,
  currentFilter,
  onFilterChange,
  selectedTag,
  onTagSelect,
  availableTags,
  isOpen,
  onClose,
  isCollapsed,
  onToggleCollapse,
  trashCount = 0,
  archiveCount = 0,
  onCreateWorkspace,
}: SidebarProps) {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 h-screen flex flex-col justify-between border-r border-slate-200/80 bg-white transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-20' : 'w-72 md:w-68'}`}
      >
        <div className="flex flex-col h-full overflow-hidden p-4">
          {/* Header & Logo */}
          <div className="flex items-center justify-between pb-3">
            <Link href="/" className="flex items-center gap-2 group min-w-0">
              <LogoIcon className="w-7 h-7 shrink-0 group-hover:scale-105 transition-transform" />
              {!isCollapsed && (
                <span className="font-bold text-base text-slate-900 tracking-tight truncate">
                  Collab<span className="text-indigo-600">Space</span>
                </span>
              )}
            </Link>

            {/* Close button on mobile / Collapse toggle on desktop */}
            <div className="flex items-center">
              <button
                onClick={onClose}
                className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                aria-label="Close sidebar"
              >
                <CloseIcon className="w-5 h-5" />
              </button>

              <button
                onClick={onToggleCollapse}
                className="hidden md:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <ChevronLeftIcon
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isCollapsed ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Workspace Switcher */}
          {!isCollapsed ? (
            <div className="mt-2 mb-4">
              <WorkspaceSwitcher
                workspaces={workspaces}
                activeWorkspace={activeWorkspace}
                onSelectWorkspace={onSelectWorkspace}
                onCreateWorkspace={onCreateWorkspace}
              />
            </div>
          ) : (
            <div className="my-3 flex justify-center">
              <div
                className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-lg cursor-pointer"
                title={activeWorkspace.name}
                onClick={onCreateWorkspace}
              >
                {activeWorkspace.icon}
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <div className="flex-1 overflow-y-auto space-y-6 pr-1">
            <div className="space-y-1">
              {!isCollapsed && (
                <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Documents
                </div>
              )}

              <button
                onClick={() => {
                  onFilterChange('all');
                  onTagSelect(null);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  currentFilter === 'all' && !selectedTag
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="All Documents"
              >
                <DocumentIcon className="w-4 h-4 shrink-0 text-indigo-600" />
                {!isCollapsed && <span>All Documents</span>}
              </button>

              <button
                onClick={() => {
                  onFilterChange('recent');
                  onTagSelect(null);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  currentFilter === 'recent'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="Recent Documents"
              >
                <ClockIcon className="w-4 h-4 shrink-0 text-indigo-500" />
                {!isCollapsed && <span>Recent</span>}
              </button>

              <button
                onClick={() => {
                  onFilterChange('starred');
                  onTagSelect(null);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  currentFilter === 'starred'
                    ? 'bg-amber-50 text-amber-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="Starred Documents"
              >
                <StarIcon className="w-4 h-4 shrink-0 text-amber-500" filled={currentFilter === 'starred'} />
                {!isCollapsed && <span>Starred</span>}
              </button>

              <button
                onClick={() => {
                  onFilterChange('shared');
                  onTagSelect(null);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  currentFilter === 'shared'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="Shared with me"
              >
                <UsersIcon className="w-4 h-4 shrink-0 text-slate-500" />
                {!isCollapsed && <span>Shared with me</span>}
              </button>

              <button
                onClick={() => {
                  onFilterChange('archived');
                  onTagSelect(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  currentFilter === 'archived'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="Archived Documents"
              >
                <div className="flex items-center gap-2.5">
                  <ArchiveIcon className={`w-4 h-4 shrink-0 ${currentFilter === 'archived' ? 'text-indigo-600' : 'text-slate-500'}`} />
                  {!isCollapsed && <span>Archived</span>}
                </div>
                {!isCollapsed && (archiveCount ?? 0) > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                    {archiveCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  onFilterChange('trash');
                  onTagSelect(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  currentFilter === 'trash'
                    ? 'bg-rose-50 text-rose-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="Trash"
              >
                <div className="flex items-center gap-2.5">
                  <TrashIcon className={`w-4 h-4 shrink-0 ${currentFilter === 'trash' ? 'text-rose-600' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>Trash</span>}
                </div>
                {!isCollapsed && trashCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                    {trashCount}
                  </span>
                )}
              </button>

              <Link
                href="/settings"
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors ${
                  isCollapsed ? 'justify-center px-0' : ''
                }`}
                title="Workspace Settings"
              >
                <SettingsIcon className="w-4 h-4 shrink-0 text-slate-500" />
                {!isCollapsed && <span>Settings</span>}
              </Link>
            </div>

            {/* Filter by tags */}
            {!isCollapsed && (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Tags & Topics
                  </span>
                  {selectedTag && (
                    <button
                      onClick={() => onTagSelect(null)}
                      className="text-[10px] text-indigo-600 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 px-2 pt-1">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => onTagSelect(selectedTag === tag ? null : tag)}
                      className={`text-xs px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        selectedTag === tag
                          ? 'bg-indigo-600 text-white font-medium shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sync Engine / Phase Status Badge */}
            {!isCollapsed && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-700 font-semibold">
                  <span>Engine Status</span>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Storage & collaboration ready. Changes persist to PostgreSQL with real-time sync available in documents.
                </p>
              </div>
            )}
          </div>

          {/* User Profile Menu at bottom */}
          {!isCollapsed ? (
            <UserMenu user={currentUser} />
          ) : (
            <div className="pt-3 border-t border-slate-200 flex justify-center">
              <div
                className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                title={currentUser.name}
              >
                {currentUser.name.split(' ').map(n => n[0]).join('')}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
