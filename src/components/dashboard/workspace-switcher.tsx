'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Workspace } from '@/lib/types';
import { ChevronDownIcon, CheckIcon, PlusIcon } from '../ui/icons';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace?: () => void;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 transition-colors shadow-2xs text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-base shrink-0 shadow-2xs">
            {activeWorkspace.icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900 truncate">
              {activeWorkspace.name}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {activeWorkspace.plan} Plan • {activeWorkspace.membersCount} members
            </p>
          </div>
        </div>
        <ChevronDownIcon className="w-4 h-4 text-slate-500 shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-30 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 space-y-1">
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Workspaces
          </div>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                onSelectWorkspace(ws);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                ws.id === activeWorkspace.id
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-sm">{ws.icon}</span>
                <span className="truncate">{ws.name}</span>
              </div>
              {ws.id === activeWorkspace.id && (
                <CheckIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              )}
            </button>
          ))}

          <div className="pt-1 border-t border-slate-100 mt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                if (onCreateWorkspace) {
                  onCreateWorkspace();
                }
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Create new workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
