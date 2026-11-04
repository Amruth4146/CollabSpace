'use client';

import React, { useState } from 'react';
import { Workspace, DocumentItem } from '@/lib/types';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { CheckIcon } from '../ui/icons';

interface MoveDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentItem | null;
  workspaces: Workspace[];
  currentWorkspaceId: string;
  onMove: (document: DocumentItem, targetWorkspaceId: string) => Promise<void>;
}

export function MoveDocModal({
  isOpen,
  onClose,
  document,
  workspaces,
  currentWorkspaceId,
  onMove,
}: MoveDocModalProps) {
  const otherWorkspaces = workspaces.filter((ws) => ws.id !== currentWorkspaceId);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const targetId =
    selectedWorkspaceId && otherWorkspaces.some((w) => w.id === selectedWorkspaceId)
      ? selectedWorkspaceId
      : otherWorkspaces[0]?.id || '';

  if (!document) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;

    setIsSubmitting(true);
    try {
      await onMove(document, targetId);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Move Document"
      description={`Select the destination workspace to transfer "${document.title}".`}
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {otherWorkspaces.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <p className="text-xs text-slate-500 font-medium">
              No other workspaces available. Create a new workspace first to move documents between workspaces.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {otherWorkspaces.map((ws) => {
              const isSelected = ws.id === targetId;
              return (
                <button
                  type="button"
                  key={ws.id}
                  onClick={() => setSelectedWorkspaceId(ws.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="text-lg shrink-0">{ws.icon || '🚀'}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{ws.name}</p>
                      <p className="text-[10px] text-slate-500">{ws.plan} Plan</p>
                    </div>
                  </div>
                  {isSelected && (
                    <CheckIcon className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isSubmitting || otherWorkspaces.length === 0}
          >
            {isSubmitting ? 'Moving...' : 'Move Document'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
