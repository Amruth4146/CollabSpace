'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { DocumentItem } from '@/lib/types';
import {
  StarIcon,
  MoreVerticalIcon,
  TrashIcon,
  CopyIcon,
  EditIcon,
  ArchiveIcon,
  MoveIcon,
  RefreshCwIcon,
} from '../ui/icons';
import { Badge } from '../ui/badge';

interface DocumentListItemProps {
  document: DocumentItem;
  onToggleStar: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (doc: DocumentItem) => void;
  onRename: (id: string, newTitle: string) => void;
  onArchive?: (id: string) => void;
  onRestoreArchive?: (id: string) => void;
  onMove?: (doc: DocumentItem) => void;
  onRestoreFromTrash?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
}

export function DocumentListItem({
  document,
  onToggleStar,
  onDelete,
  onDuplicate,
  onRename,
  onArchive,
  onRestoreArchive,
  onMove,
  onRestoreFromTrash,
  onPermanentDelete,
}: DocumentListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRenameClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    const newName = prompt('Enter new document title:', document.title);
    if (newName && newName.trim()) {
      onRename(document.id, newName.trim());
    }
  };

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    onDuplicate(document);
  };

  const handleMoveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (onMove) {
      onMove(document);
    }
  };

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (document.isArchived) {
      if (onRestoreArchive) onRestoreArchive(document.id);
    } else {
      if (onArchive) onArchive(document.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    onDelete(document.id);
  };

  const handleRestoreFromTrashClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (onRestoreFromTrash) {
      onRestoreFromTrash(document.id);
    }
  };

  const handlePermanentDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (onPermanentDelete) {
      onPermanentDelete(document.id);
    }
  };

  const formattedDate =
    typeof document.updatedAt === 'string'
      ? document.updatedAt
      : document.updatedAt
      ? new Date(document.updatedAt).toLocaleDateString()
      : 'Just now';

  return (
    <div className="group relative bg-white hover:bg-slate-50/80 border border-slate-200/80 rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition-all duration-150 shadow-2xs">
      {/* Title & Icon & Star */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {!document.isDeleted && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleStar(document.id);
            }}
            className="text-slate-400 hover:text-amber-500 transition-colors p-1 cursor-pointer"
            aria-label="Star document"
          >
            <StarIcon
              className={`w-4 h-4 ${document.isStarred ? 'text-amber-500 fill-amber-500' : ''}`}
              filled={document.isStarred}
            />
          </button>
        )}

        <span className="text-xl shrink-0">{document.icon || '📄'}</span>

        <Link
          href={`/editor/${document.id}`}
          className="min-w-0 flex-1 block group-hover:text-indigo-600 transition-colors"
        >
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900 truncate">
              {document.title}
            </h4>
            {document.tags &&
              document.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="slate" size="sm" className="hidden sm:inline-flex">
                  #{tag}
                </Badge>
              ))}
          </div>
          <p className="text-xs text-slate-400 truncate hidden md:block">
            {document.excerpt}
          </p>
        </Link>
      </div>

      {/* Meta: Author, Collaborators, Timestamp, Actions */}
      <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
        <div className="hidden sm:flex -space-x-1.5 overflow-hidden items-center">
          <div
            className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
            title={`Author: ${document.author?.name || 'Workspace Member'}`}
          >
            {(document.author?.name || 'W')[0]}
          </div>
          {document.collaborators &&
            document.collaborators.map((c) => (
              <div
                key={c.id}
                className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
                style={{ backgroundColor: c.color || '#6366F1' }}
                title={c.name}
              >
                {c.name[0]}
              </div>
            ))}
        </div>

        <span className="text-[11px] text-slate-400 min-w-[70px] text-right">
          {formattedDate}
        </span>

        {/* Action Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Actions"
          >
            <MoreVerticalIcon className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-20 space-y-1 text-xs">
              {document.isDeleted ? (
                <>
                  <button
                    onClick={handleRestoreFromTrashClick}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                  >
                    <RefreshCwIcon className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Restore Document</span>
                  </button>
                  <button
                    onClick={handlePermanentDeleteClick}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer font-medium"
                  >
                    <TrashIcon className="w-3.5 h-3.5 text-rose-500" />
                    <span>Delete Forever</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleRenameClick}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                  >
                    <EditIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>Rename</span>
                  </button>
                  <button
                    onClick={handleDuplicateClick}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                  >
                    <CopyIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>Duplicate</span>
                  </button>
                  {onMove && (
                    <button
                      onClick={handleMoveClick}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                    >
                      <MoveIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Move to Workspace</span>
                    </button>
                  )}
                  {(onArchive || onRestoreArchive) && (
                    <button
                      onClick={handleArchiveClick}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                    >
                      <ArchiveIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>{document.isArchived ? 'Unarchive' : 'Archive'}</span>
                    </button>
                  )}
                  <div className="h-px bg-slate-100 my-1" />
                  <button
                    onClick={handleDeleteClick}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                  >
                    <TrashIcon className="w-3.5 h-3.5 text-rose-500" />
                    <span>Move to Trash</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
