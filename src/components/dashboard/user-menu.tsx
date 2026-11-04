'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User } from '@/lib/types';
import { SettingsIcon, MoreVerticalIcon } from '../ui/icons';

interface UserMenuProps {
  user: User;
}

export function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative pt-3 border-t border-slate-200/80" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 transition-colors text-left group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            {/* User Avatar */}
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center ring-2 ring-white">
              {user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-indigo-600">
              {user.name}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
        <MoreVerticalIcon className="w-4 h-4 text-slate-500 group-hover:text-slate-700 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 space-y-1 z-30">
          <div className="px-3 py-1.5 border-b border-slate-100">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Account status
            </span>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Online • Local Editor Active</span>
            </div>
          </div>

          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <SettingsIcon className="w-3.5 h-3.5 text-slate-500" />
            <span>Workspace Settings</span>
          </Link>

          <button
            onClick={async () => {
              setIsOpen(false);
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
              } catch {
                // Ignore
              }
              router.push('/login');
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer text-left"
          >
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
