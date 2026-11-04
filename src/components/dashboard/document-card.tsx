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

interface DocumentCardProps {
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

export function DocumentCard({
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
}: DocumentCardProps) {
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

  return (
    <div className="group relative bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-indigo-300 transition-all duration-200 flex flex-col justify-between overflow-hidden">
      <Link href={`/editor/${document.id}`} className="p-5 flex-1 flex flex-col">
        {/* Top Header: Icon, Star, Menu */}
        <div className="flex items-start justify-between gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-transform">
            {document.icon || '📄'}
          </div>

          <div className="flex items-center gap-1">
            {!document.isDeleted && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleStar(document.id);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-50 transition-colors cursor-pointer"
                title={document.isStarred ? 'Unstar document' : 'Star document'}
                aria-label="Star document"
              >
                <StarIcon
                  className={`w-4 h-4 ${document.isStarred ? 'text-amber-500 fill-amber-500' : ''}`}
                  filled={document.isStarred}
                />
              </button>
            )}

            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="More actions"
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

        {/* Content Preview */}
        <div className="mt-3 flex-1">
          <h3 className="font-semibold text-sm text-slate-900 group-hover:text-indigo-600 line-clamp-1 transition-colors">
            {document.title}
          </h3>
          <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {document.excerpt}
          </p>
        </div>

        {/* Tags */}
        {document.tags && document.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {document.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="slate" size="sm">
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </Link>

      {/* Footer Info: Collaborator Avatars & Updated Time */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-400">
        <span className="text-[11px] font-medium text-slate-500">
          Updated {typeof document.updatedAt === 'string' ? document.updatedAt : document.updatedAt ? new Date(document.updatedAt).toLocaleDateString() : 'Just now'}
        </span>

        {/* Collaborators */}
        <div className="flex -space-x-1.5 overflow-hidden">
          <div
            className="w-5 h-5 rounded-full ring-2 ring-white bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0"
            title={`Author: ${document.author?.name || 'Workspace Member'}`}
          >
            {(document.author?.name || 'W')[0]}
          </div>
          {document.collaborators && document.collaborators.length > 0 && document.collaborators.slice(0, 2).map((collab) => (
            <div
              key={collab.id}
              className="w-5 h-5 rounded-full ring-2 ring-white text-white text-[9px] font-bold flex items-center justify-center shrink-0"
              style={{ backgroundColor: collab.color || '#6366F1' }}
              title={`Collaborator: ${collab.name}`}
            >
              {collab.name[0]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
