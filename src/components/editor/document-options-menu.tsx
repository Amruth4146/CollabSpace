'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MoreVerticalIcon,
  DownloadIcon,
  HelpCircleIcon,
  DocumentIcon,
  CloseIcon,
} from '../ui/icons';
import { Button } from '../ui/button';

interface DocumentOptionsMenuProps {
  title: string;
  content: string;
  onOpenShortcuts: () => void;
}

export function DocumentOptionsMenu({
  title,
  content,
  onOpenShortcuts,
}: DocumentOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute stats from raw HTML / text
  const getPlainText = () => {
    if (typeof window === 'undefined') return '';
    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = content;
    return tempDiv.innerText || tempDiv.textContent || '';
  };

  const plainText = getPlainText();
  const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
  const charCount = plainText.length;
  const readingTimeMin = Math.ceil(wordCount / 200);

  // Client-side export handlers
  const handleExportMarkdown = () => {
    const text = `# ${title}\n\n${plainText}`;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'document'}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  const handleExportPlainText = () => {
    const text = `${title}\n\n${plainText}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'document'}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          title="Document Options"
          aria-label="Document Options"
        >
          <MoreVerticalIcon className="w-4 h-4" />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-1.5 z-40 w-52 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100 text-xs">
            <button
              onClick={() => {
                setIsStatsOpen(true);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors text-left font-medium"
            >
              <DocumentIcon className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Word & Character Count</span>
            </button>

            <button
              onClick={handleExportMarkdown}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors text-left font-medium"
            >
              <DownloadIcon className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Export as Markdown (.md)</span>
            </button>

            <button
              onClick={handleExportPlainText}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors text-left font-medium"
            >
              <DownloadIcon className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Export as Plain Text (.txt)</span>
            </button>

            <div className="my-1 border-t border-slate-100" />

            <button
              onClick={() => {
                setIsOpen(false);
                onOpenShortcuts();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors text-left font-medium"
            >
              <HelpCircleIcon className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Keyboard Shortcuts</span>
            </button>
          </div>
        )}
      </div>

      {/* Word & Stats Dialog Modal */}
      {isStatsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Document Statistics</h3>
              <button
                onClick={() => setIsStatsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
                <span className="text-2xl font-bold text-indigo-600 block">{wordCount}</span>
                <span className="text-xs text-slate-500 font-medium">Words</span>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center">
                <span className="text-2xl font-bold text-indigo-600 block">{charCount}</span>
                <span className="text-xs text-slate-500 font-medium">Characters</span>
              </div>
            </div>

            <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 flex items-center justify-between text-xs text-indigo-900">
              <span className="font-medium">Estimated Reading Time</span>
              <span className="font-bold">{readingTimeMin} {readingTimeMin === 1 ? 'min' : 'mins'}</span>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full justify-center text-xs"
                onClick={() => setIsStatsOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
