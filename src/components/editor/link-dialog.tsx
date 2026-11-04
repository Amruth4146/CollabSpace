'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { LinkIcon, UnlinkIcon, AlertCircleIcon } from '../ui/icons';

interface LinkDialogProps {
  isOpen: boolean;
  initialUrl?: string;
  initialText?: string;
  hasSelectionText?: boolean;
  onApply: (url: string, text?: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function isValidLinkUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();

  // Strictly block dangerous pseudo-protocols
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:')
  ) {
    return false;
  }

  // Accept valid web links, relative paths, email, and tel links
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('/') ||
    lower.startsWith('#')
  );
}

export function normalizeLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('mailto:') &&
    !trimmed.startsWith('tel:') &&
    !trimmed.startsWith('/') &&
    !trimmed.startsWith('#')
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function LinkDialog({
  isOpen,
  initialUrl = '',
  initialText = '',
  hasSelectionText = false,
  onApply,
  onRemove,
  onClose,
}: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setUrl(initialUrl);
      setText(initialText);
      setError(null);
    }
  }

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      onRemove();
      onClose();
      return;
    }

    const candidate = normalizeLinkUrl(url);

    if (!isValidLinkUrl(candidate)) {
      setError('Invalid link URL. Please use https://, http://, or mailto:');
      return;
    }

    onApply(candidate, hasSelectionText ? undefined : text.trim() || candidate);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Insert or edit link"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <LinkIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {initialUrl ? 'Edit Link' : 'Insert Link'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Safe HTTPS, HTTP, and mailto links supported
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md text-sm"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!hasSelectionText && (
            <div>
              <label
                htmlFor="link-text-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Display Text
              </label>
              <input
                id="link-text-input"
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Project Documentation"
                className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="link-url-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Destination URL
            </label>
            <input
              id="link-url-input"
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="https://example.com"
              className={`w-full text-xs sm:text-sm px-3 py-2 rounded-xl border focus:outline-none transition-colors ${
                error
                  ? 'border-rose-400 focus:ring-2 focus:ring-rose-100'
                  : 'border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
              }`}
            />
            {error && (
              <div className="flex items-center gap-1.5 text-rose-600 text-xs mt-1.5 font-medium">
                <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {initialUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                leftIcon={<UnlinkIcon className="w-3.5 h-3.5" />}
              >
                Remove Link
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Apply Link
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
