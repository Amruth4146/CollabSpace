'use client';

import React, { useState } from 'react';
import { CloseIcon, PlusIcon, ShieldIcon } from '../ui/icons';
import { Button } from '../ui/button';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, icon: string) => void;
}

const EMOJI_OPTIONS = ['🚀', '⚡', '🎨', '📚', '💡', '🏢', '🔬', '🌐', '📊', '🛠️'];

export function CreateWorkspaceModal({
  isOpen,
  onClose,
  onCreate,
}: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🚀');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a workspace name.');
      return;
    }
    onCreate(name.trim(), selectedIcon);
    setName('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-workspace-title"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="create-workspace-title" className="text-base font-bold text-slate-900">
            Create a New Workspace
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs text-indigo-900 flex items-start gap-2">
            <ShieldIcon className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Your workspace will be saved securely with PostgreSQL persistence, dedicated role-based access control, and document isolation.
            </p>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="workspace-name" className="block text-xs font-semibold text-slate-700">
              Workspace Name
            </label>
            <input
              id="workspace-name"
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Acme Product Hub"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Choose Workspace Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => setSelectedIcon(emoji)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all cursor-pointer ${
                    selectedIcon === emoji
                      ? 'bg-indigo-100 border-2 border-indigo-600 scale-105 shadow-xs'
                      : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="text-xs"
              leftIcon={<PlusIcon className="w-3.5 h-3.5" />}
            >
              Create Workspace
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
