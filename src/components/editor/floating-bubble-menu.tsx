'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikeIcon,
  CodeIcon,
  LinkIcon,
  UnlinkIcon,
  Heading1Icon,
  Heading2Icon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  MessageSquareIcon,
} from '../ui/icons';

interface FloatingBubbleMenuProps {
  editor: Editor | null;
  onOpenLinkDialog: () => void;
  onStartComment?: (quote: string) => void;
  canComment?: boolean;
}

export function FloatingBubbleMenu({
  editor,
  onOpenLinkDialog,
  onStartComment,
  canComment = true,
}: FloatingBubbleMenuProps) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (!editor) return;

    // Check DOM selection
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
      setCoords(null);
      setSelectedText('');
      return;
    }

    const text = domSelection.toString().trim();
    if (!text) {
      setCoords(null);
      setSelectedText('');
      return;
    }

    // Check that selection is inside the editor DOM
    const editorDom = editor.view.dom;
    const range = domSelection.getRangeAt(0);
    if (!editorDom.contains(range.commonAncestorContainer)) {
      setCoords(null);
      setSelectedText('');
      return;
    }

    // If editor is not editable and user cannot comment, don't show anything
    if (!editor.isEditable && !canComment) {
      setCoords(null);
      setSelectedText('');
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setCoords(null);
      setSelectedText('');
      return;
    }

    const menuWidth = editor.isEditable ? 380 : 130;
    const left = Math.max(16, Math.min(window.innerWidth - menuWidth - 16, rect.left + rect.width / 2 - menuWidth / 2));
    const top = Math.max(10, rect.top - 46);

    setSelectedText(text);
    setCoords({ top, left });
  }, [editor, canComment]);

  useEffect(() => {
    if (!editor) return;

    editor.on('selectionUpdate', updateMenuPosition);
    editor.on('transaction', updateMenuPosition);

    const handleDocSelectionChange = () => {
      // For read-only selection updates (e.g. commenters)
      if (!editor.isEditable) {
        updateMenuPosition();
      }
    };

    document.addEventListener('selectionchange', handleDocSelectionChange);

    editor.on('blur', () => {
      setTimeout(() => {
        if (!document.activeElement || !menuRef.current?.contains(document.activeElement)) {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed) {
            setCoords(null);
          }
        }
      }, 150);
    });

    return () => {
      editor.off('selectionUpdate', updateMenuPosition);
      editor.off('transaction', updateMenuPosition);
      document.removeEventListener('selectionchange', handleDocSelectionChange);
    };
  }, [editor, updateMenuPosition]);

  if (!editor || !coords) return null;

  const handleCommentClick = () => {
    const textToQuote = selectedText || editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      ' '
    );
    if (textToQuote.trim()) {
      onStartComment?.(textToQuote.trim());
    }
  };

  // If editor is NOT editable (e.g. Commenter role), render only the "Add Comment" button
  if (!editor.isEditable) {
    if (!canComment) return null;

    return (
      <div
        ref={menuRef}
        role="toolbar"
        aria-label="Add comment to selected text"
        style={{
          position: 'fixed',
          top: `${coords.top}px`,
          left: `${coords.left}px`,
        }}
        className="z-40 flex items-center bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-xl px-2 py-1 border border-slate-700/60 animate-in fade-in zoom-in-95 duration-100 select-none"
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          onClick={handleCommentClick}
          aria-label="Add Comment"
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-indigo-300 hover:text-white hover:bg-indigo-600 transition-colors"
        >
          <MessageSquareIcon className="w-3.5 h-3.5 text-indigo-400" />
          <span>Add Comment</span>
        </button>
      </div>
    );
  }

  // Editable mode: full formatting bar + Add Comment button
  const isLinkActive = editor.isActive('link');

  return (
    <div
      ref={menuRef}
      role="toolbar"
      aria-label="Floating text selection formatting toolbar"
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
      className="z-40 flex items-center gap-0.5 bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-xl px-1.5 py-1 border border-slate-700/60 animate-in fade-in zoom-in-95 duration-100 select-none"
      onMouseDown={(e) => {
        // Prevent losing editor selection when clicking formatting buttons
        e.preventDefault();
      }}
    >
      {/* Bold */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold (Ctrl+B)"
        title="Bold (Ctrl+B)"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive('bold')
            ? 'bg-indigo-600 text-white font-bold'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <BoldIcon className="w-3.5 h-3.5" />
      </button>

      {/* Italic */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic (Ctrl+I)"
        title="Italic (Ctrl+I)"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive('italic')
            ? 'bg-indigo-600 text-white font-bold'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <ItalicIcon className="w-3.5 h-3.5" />
      </button>

      {/* Underline */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        aria-label="Underline (Ctrl+U)"
        title="Underline (Ctrl+U)"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive('underline')
            ? 'bg-indigo-600 text-white font-bold'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <UnderlineIcon className="w-3.5 h-3.5" />
      </button>

      {/* Strike */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-label="Strikethrough"
        title="Strikethrough"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive('strike')
            ? 'bg-indigo-600 text-white font-bold'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <StrikeIcon className="w-3.5 h-3.5" />
      </button>

      {/* Inline Code */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        aria-label="Inline Code"
        title="Inline Code"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive('code')
            ? 'bg-indigo-600 text-white font-bold'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <CodeIcon className="w-3.5 h-3.5" />
      </button>

      <span className="w-px h-4 bg-slate-700 mx-0.5" />

      {/* Link */}
      <button
        type="button"
        onClick={() => {
          if (isLinkActive) {
            editor.chain().focus().unsetLink().run();
          } else {
            onOpenLinkDialog();
          }
        }}
        aria-label={isLinkActive ? 'Remove Link' : 'Add Link'}
        title={isLinkActive ? 'Remove Link' : 'Add Link'}
        className={`p-1.5 rounded-lg transition-colors ${
          isLinkActive
            ? 'bg-indigo-600 text-white font-bold'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        {isLinkActive ? <UnlinkIcon className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
      </button>

      <span className="w-px h-4 bg-slate-700 mx-0.5" />

      {/* Heading 1 & 2 */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        aria-label="Heading 1"
        title="Heading 1"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive('heading', { level: 1 })
            ? 'bg-indigo-600 text-white font-bold'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <Heading1Icon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="Heading 2"
        title="Heading 2"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive('heading', { level: 2 })
            ? 'bg-indigo-600 text-white font-bold'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <Heading2Icon className="w-3.5 h-3.5" />
      </button>

      <span className="w-px h-4 bg-slate-700 mx-0.5" />

      {/* Align Left & Center & Right */}
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        aria-label="Align Left"
        title="Align Left"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive({ textAlign: 'left' })
            ? 'bg-indigo-600 text-white'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <AlignLeftIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        aria-label="Align Center"
        title="Align Center"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive({ textAlign: 'center' })
            ? 'bg-indigo-600 text-white'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <AlignCenterIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        aria-label="Align Right"
        title="Align Right"
        className={`p-1.5 rounded-lg transition-colors ${
          editor.isActive({ textAlign: 'right' })
            ? 'bg-indigo-600 text-white'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <AlignRightIcon className="w-3.5 h-3.5" />
      </button>

      {/* Comment Button */}
      {canComment && (
        <>
          <span className="w-px h-4 bg-slate-700 mx-0.5" />
          <button
            type="button"
            onClick={handleCommentClick}
            aria-label="Add Comment"
            title="Add Comment"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-indigo-600 transition-colors"
          >
            <MessageSquareIcon className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
