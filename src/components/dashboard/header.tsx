'use client';

import React from 'react';
import { SearchIcon, BellIcon, PlusIcon } from '../ui/icons';
import { Button } from '../ui/button';

interface DashboardHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenNewDoc: () => void;
  onOpenMobileSidebar: () => void;
  workspaceName: string;
}

export function DashboardHeader({
  searchQuery,
  onSearchChange,
  onOpenNewDoc,
  onOpenMobileSidebar,
  workspaceName,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      {/* Left: Mobile trigger & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileSidebar}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          aria-label="Open navigation sidebar"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <span className="text-slate-600 font-semibold">{workspaceName}</span>
          <span>/</span>
          <span className="text-slate-800 font-bold">Documents</span>
        </div>
      </div>

      {/* Middle: Quick Search with Cmd+K hint */}
      <div className="flex-1 max-w-md mx-2 hidden sm:block">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents, tags, or content..."
            className="w-full bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 rounded-xl pl-9 pr-14 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none">
            <kbd className="text-[10px] bg-white border border-slate-200 text-slate-400 rounded px-1 py-0.5 shadow-2xs font-mono">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right: Notifications & New Doc Button */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => alert('No new notifications in Phase 1.')}
          className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          aria-label="Notifications"
        >
          <BellIcon className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" />
        </button>

        <Button
          onClick={onOpenNewDoc}
          variant="primary"
          size="sm"
          leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
        >
          <span>New Document</span>
        </Button>
      </div>
    </header>
  );
}
