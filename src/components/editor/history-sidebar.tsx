'use client';

import React, { useState } from 'react';
import { VersionEntry } from '@/lib/types';
import { CloseIcon, HistoryIcon, UndoIcon, PlusIcon, CheckIcon, ShieldIcon } from '../ui/icons';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  versions: VersionEntry[];
  onRestoreVersion: (version: VersionEntry) => Promise<void> | void;
  onCreateCheckpoint?: (title?: string, summary?: string) => Promise<void> | void;
  userRole?: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
  isLoading?: boolean;
}

export function HistorySidebar({
  isOpen,
  onClose,
  versions,
  onRestoreVersion,
  onCreateCheckpoint,
  userRole = 'editor',
  isLoading = false,
}: HistorySidebarProps) {
  const [selectedVersion, setSelectedVersion] = useState<VersionEntry | null>(null);
  const [previewVersion, setPreviewVersion] = useState<VersionEntry | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false);
  const [checkpointTitle, setCheckpointTitle] = useState('');
  const [checkpointSummary, setCheckpointSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const canEdit = userRole === 'owner' || userRole === 'admin' || userRole === 'editor';

  const handleOpenRestoreConfirm = (ver: VersionEntry) => {
    setSelectedVersion(ver);
    setIsConfirmOpen(true);
  };

  const handleConfirmRestore = async () => {
    if (!selectedVersion) return;
    setIsSubmitting(true);
    try {
      await onRestoreVersion(selectedVersion);
      setIsConfirmOpen(false);
      setSelectedVersion(null);
      setPreviewVersion(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateCheckpoint) return;
    setIsSubmitting(true);
    try {
      await onCreateCheckpoint(checkpointTitle.trim() || undefined, checkpointSummary.trim() || undefined);
      setCheckpointTitle('');
      setCheckpointSummary('');
      setIsCreatingCheckpoint(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <aside className="w-80 sm:w-96 border-l border-slate-200/80 bg-white flex flex-col h-full shadow-lg z-30 shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Version History</h3>
            <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
              {versions.length} versions
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close history"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="p-3 bg-indigo-50/60 border-b border-indigo-100 text-[11px] text-indigo-900 flex items-start justify-between gap-2">
          <span>Continuous point-in-time CRDT snapshots with author attribution and safe rollback.</span>
          {canEdit && onCreateCheckpoint && !isCreatingCheckpoint && (
            <button
              onClick={() => setIsCreatingCheckpoint(true)}
              className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline shrink-0 flex items-center gap-1"
            >
              <PlusIcon className="w-3 h-3" />
              <span>Checkpoint</span>
            </button>
          )}
        </div>

        {/* Checkpoint Creation Form */}
        {isCreatingCheckpoint && (
          <form onSubmit={handleCreateSubmit} className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">New Version Checkpoint</span>
              <button
                type="button"
                onClick={() => setIsCreatingCheckpoint(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={checkpointTitle}
              onChange={(e) => setCheckpointTitle(e.target.value)}
              placeholder="Checkpoint title (e.g., Final Draft)"
              className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="text"
              value={checkpointSummary}
              onChange={(e) => setCheckpointSummary(e.target.value)}
              placeholder="Summary of changes..."
              className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-1.5 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setIsCreatingCheckpoint(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="xs"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Checkpoint'}
              </Button>
            </div>
          </form>
        )}

        {/* Timeline List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs">Loading version history...</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <HistoryIcon className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
              <p className="text-xs font-medium">No versions saved yet</p>
              <p className="text-[11px] text-slate-400">
                Snapshots are automatically created during collaborative editing sessions.
              </p>
            </div>
          ) : (
            versions.map((ver, idx) => {
              const isLatest = idx === 0;
              return (
                <div
                  key={ver.id}
                  className={`relative rounded-xl border p-4 space-y-2.5 transition-all ${
                    isLatest
                      ? 'border-indigo-300 bg-indigo-50/30 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  {/* Version & Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                          isLatest
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {ver.versionNumber}
                      </span>
                      <span className="text-[11px] text-slate-400">{ver.timestamp}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                      <span className="text-emerald-600 font-mono">+{ver.changes.added}</span>
                      <span className="text-rose-500 font-mono">-{ver.changes.removed}</span>
                    </div>
                  </div>

                  {/* Author */}
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: ver.author.color }}
                    >
                      {ver.author.name[0]}
                    </div>
                    <span className="text-xs text-slate-600 font-medium truncate">
                      Edited by {ver.author.name}
                    </span>
                  </div>

                  {/* Summary of edits */}
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {ver.summary}
                  </p>

                  {/* Actions: Preview & Safe Restore */}
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    {ver.contentSnapshot && (
                      <button
                        type="button"
                        onClick={() => setPreviewVersion(ver)}
                        className="text-xs text-slate-500 hover:text-indigo-600 font-medium transition-colors"
                      >
                        Preview
                      </button>
                    )}

                    {!isLatest && canEdit && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleOpenRestoreConfirm(ver)}
                        leftIcon={<UndoIcon className="w-3 h-3" />}
                        className="ml-auto"
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Preview Modal */}
      {previewVersion && (
        <Modal
          isOpen={Boolean(previewVersion)}
          onClose={() => setPreviewVersion(null)}
          title={`Previewing Snapshot ${previewVersion.versionNumber}`}
          description={`Created ${previewVersion.timestamp} by ${previewVersion.author.name}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-amber-600 shrink-0" />
              <span>This is a read-only preview of the document snapshot taken at this point in time.</span>
            </div>

            <div className="max-h-96 overflow-y-auto p-4 rounded-xl border border-slate-200 bg-white prose prose-sm max-w-none">
              <div dangerouslySetInnerHTML={{ __html: previewVersion.contentSnapshot || '<p></p>' }} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setPreviewVersion(null)}>
                Close Preview
              </Button>
              {canEdit && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    handleOpenRestoreConfirm(previewVersion);
                  }}
                  leftIcon={<UndoIcon className="w-3.5 h-3.5" />}
                >
                  Restore this version
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal Before Safe Restore */}
      {selectedVersion && (
        <Modal
          isOpen={isConfirmOpen}
          onClose={() => {
            if (!isSubmitting) {
              setIsConfirmOpen(false);
              setSelectedVersion(null);
            }
          }}
          title={`Restore Document to ${selectedVersion.versionNumber}?`}
          description="Confirming will safely revert the collaborative document without disconnecting active peers."
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/60 text-xs text-indigo-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-950">
                <CheckIcon className="w-4 h-4 text-indigo-600" />
                <span>Zero Data Loss Protection</span>
              </div>
              <p className="text-[11px] leading-relaxed text-indigo-800/90">
                A safety snapshot of your current document will automatically be created before restoring.
                Active collaborators will receive this restored state via real-time CRDT updates smoothly.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsConfirmOpen(false);
                  setSelectedVersion(null);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmRestore}
                disabled={isSubmitting}
                leftIcon={<UndoIcon className="w-3.5 h-3.5" />}
              >
                {isSubmitting ? 'Restoring...' : `Restore to ${selectedVersion.versionNumber}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
