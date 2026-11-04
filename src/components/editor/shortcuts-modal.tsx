'use client';

import React, { useEffect } from 'react';
import { CloseIcon, HelpCircleIcon } from '../ui/icons';
import { Button } from '../ui/button';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    category: 'Essential Commands',
    items: [
      { label: 'Save / Sync checkpoint', keys: ['Ctrl / ⌘', 'S'] },
      { label: 'Undo previous edit', keys: ['Ctrl / ⌘', 'Z'] },
      { label: 'Redo edit', keys: ['Ctrl / ⌘', 'Shift', 'Z'] },
      { label: 'Open keyboard shortcuts', keys: ['Ctrl / ⌘', '/'] },
    ],
  },
  {
    category: 'Text Formatting',
    items: [
      { label: 'Bold text', keys: ['Ctrl / ⌘', 'B'] },
      { label: 'Italic text', keys: ['Ctrl / ⌘', 'I'] },
      { label: 'Inline code snippet', keys: ['Ctrl / ⌘', 'E'] },
      { label: 'Strikethrough', keys: ['Ctrl / ⌘', 'Shift', 'X'] },
    ],
  },
  {
    category: 'Blocks & Structure',
    items: [
      { label: 'Heading 1', keys: ['Ctrl / ⌘', 'Alt', '1'] },
      { label: 'Heading 2', keys: ['Ctrl / ⌘', 'Alt', '2'] },
      { label: 'Heading 3', keys: ['Ctrl / ⌘', 'Alt', '3'] },
      { label: 'Bulleted list', keys: ['Ctrl / ⌘', 'Shift', '8'] },
      { label: 'Numbered list', keys: ['Ctrl / ⌘', 'Shift', '7'] },
      { label: 'Quote block', keys: ['Ctrl / ⌘', 'Shift', 'B'] },
      { label: 'Code fence block', keys: ['``` + Space'] },
    ],
  },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <HelpCircleIcon className="w-5 h-5 text-indigo-600" />
            <h2 id="shortcuts-title" className="text-base font-bold text-slate-900">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {group.category}
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden bg-slate-50/50">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-4 py-2.5 text-xs"
                  >
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs text-[11px] font-semibold text-slate-600"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-semibold">⌘ /</kbd> anywhere in the editor to view this reference.</span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
