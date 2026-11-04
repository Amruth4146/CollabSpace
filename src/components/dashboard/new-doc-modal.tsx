'use client';

import React, { useState } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';

interface NewDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, icon: string, tag: string) => void;
}

const EMOJI_OPTIONS = ['📄', '🚀', '💡', '🎨', '📝', '📊', '⚡', '🔍', '🛡️', '🎯'];

export function NewDocModal({ isOpen, onClose, onCreate }: NewDocModalProps) {
  const [title, setTitle] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('📄');
  const [tag, setTag] = useState('General');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);
    setTimeout(() => {
      onCreate(title.trim(), selectedEmoji, tag);
      setIsLoading(false);
      onClose();
      setTitle('');
    }, 300);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Document"
      description="Start a collaborative document with instant sync."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Document Icon
          </label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => setSelectedEmoji(emoji)}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                  selectedEmoji === emoji
                    ? 'bg-indigo-50 border-2 border-indigo-600 shadow-2xs'
                    : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="newDocTitle" className="block text-xs font-semibold text-slate-700">
            Document Title
          </label>
          <input
            id="newDocTitle"
            type="text"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Q1 Marketing Plan, Architecture RFC..."
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div>
          <label htmlFor="docTag" className="block text-xs font-semibold text-slate-700">
            Topic Tag
          </label>
          <select
            id="docTag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="General">General</option>
            <option value="Architecture">Architecture</option>
            <option value="Engine">Engine</option>
            <option value="Design">Design</option>
            <option value="Roadmap">Roadmap</option>
            <option value="Security">Security</option>
            <option value="Meetings">Meetings</option>
          </select>
        </div>

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isLoading} disabled={!title.trim()}>
            Create & Open
          </Button>
        </div>
      </form>
    </Modal>
  );
}
