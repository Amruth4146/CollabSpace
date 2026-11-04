'use client';

import React from 'react';
import type { Editor } from '@tiptap/react';
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikeIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  BulletListIcon,
  OrderedListIcon,
  CheckSquareIcon,
  BlockquoteIcon,
  HorizontalRuleIcon,
  UndoIcon,
  RedoIcon,
  LinkIcon,
  UnlinkIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  Maximize2Icon,
  Minimize2Icon,
  HelpCircleIcon,
} from '../ui/icons';

interface EditorToolbarProps {
  editor: Editor | null;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  onOpenLinkDialog?: () => void;
  onOpenShortcuts?: () => void;
  readOnly?: boolean;
}

export function EditorToolbar({
  editor,
  isFocusMode = false,
  onToggleFocusMode,
  onOpenLinkDialog,
  onOpenShortcuts,
  readOnly = false,
}: EditorToolbarProps) {
  if (!editor || readOnly) return null;

  const isLinkActive = editor.isActive('link');

  return (
    <div
      role="toolbar"
      aria-label="Document editor toolbar"
      className="sticky top-16 z-20 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-sm px-3 sm:px-6 py-1.5 flex items-center justify-between gap-1 overflow-x-auto shadow-2xs select-none"
    >
      <div className="flex items-center gap-1 min-w-max">
        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <UndoIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <RedoIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Headings */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5 pl-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('heading', { level: 1 })
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Heading 1"
            aria-label="Heading 1"
            aria-pressed={editor.isActive('heading', { level: 1 })}
          >
            <Heading1Icon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('heading', { level: 2 })
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Heading 2"
            aria-label="Heading 2"
            aria-pressed={editor.isActive('heading', { level: 2 })}
          >
            <Heading2Icon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('heading', { level: 3 })
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Heading 3"
            aria-label="Heading 3"
            aria-pressed={editor.isActive('heading', { level: 3 })}
          >
            <Heading3Icon className="w-4 h-4" />
          </button>
        </div>

        {/* Basic Marks: Bold, Italic, Underline, Strike, Code */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5 pl-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('bold')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
            aria-pressed={editor.isActive('bold')}
          >
            <BoldIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('italic')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Italic (Ctrl+I)"
            aria-label="Italic"
            aria-pressed={editor.isActive('italic')}
          >
            <ItalicIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('underline')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Underline (Ctrl+U)"
            aria-label="Underline"
            aria-pressed={editor.isActive('underline')}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('strike')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Strikethrough (Ctrl+Shift+S)"
            aria-label="Strikethrough"
            aria-pressed={editor.isActive('strike')}
          >
            <StrikeIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('code')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Inline Code (Ctrl+E)"
            aria-label="Inline Code"
            aria-pressed={editor.isActive('code')}
          >
            <CodeIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Blocks: Lists & Checklists */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5 pl-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('bulletList')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Bullet List"
            aria-label="Bullet List"
            aria-pressed={editor.isActive('bulletList')}
          >
            <BulletListIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('orderedList')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Numbered List"
            aria-label="Numbered List"
            aria-pressed={editor.isActive('orderedList')}
          >
            <OrderedListIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('taskList')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Task List / Checkbox"
            aria-label="Task List"
            aria-pressed={editor.isActive('taskList')}
          >
            <CheckSquareIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Text Alignment */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5 pl-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive({ textAlign: 'left' })
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Align Left"
            aria-label="Align Left"
          >
            <AlignLeftIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive({ textAlign: 'center' })
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Align Center"
            aria-label="Align Center"
          >
            <AlignCenterIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive({ textAlign: 'right' })
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Align Right"
            aria-label="Align Right"
          >
            <AlignRightIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive({ textAlign: 'justify' })
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Align Justify"
            aria-label="Align Justify"
          >
            <AlignJustifyIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Rich Nodes: Quotes, Codeblock, Horizontal Rule, Link */}
        <div className="flex items-center gap-0.5 pl-1">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('blockquote')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Blockquote"
            aria-label="Blockquote"
            aria-pressed={editor.isActive('blockquote')}
          >
            <BlockquoteIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-1.5 rounded-lg transition-colors ${
              editor.isActive('codeBlock')
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Code Block"
            aria-label="Code Block"
            aria-pressed={editor.isActive('codeBlock')}
          >
            <span className="font-mono text-xs font-semibold px-1">{'</>'}</span>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Horizontal Divider"
            aria-label="Horizontal Divider"
          >
            <HorizontalRuleIcon className="w-4 h-4" />
          </button>

          {/* Link button */}
          <button
            type="button"
            onClick={() => {
              if (isLinkActive) {
                editor.chain().focus().unsetLink().run();
              } else if (onOpenLinkDialog) {
                onOpenLinkDialog();
              }
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              isLinkActive
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={isLinkActive ? 'Remove Link' : 'Insert Link (Ctrl+K)'}
            aria-label={isLinkActive ? 'Remove Link' : 'Insert Link'}
            aria-pressed={isLinkActive}
          >
            {isLinkActive ? <UnlinkIcon className="w-4 h-4 text-indigo-600" /> : <LinkIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Right Controls: Focus Mode & Shortcuts */}
      <div className="flex items-center gap-1 shrink-0 pl-2">
        {onToggleFocusMode && (
          <button
            type="button"
            onClick={onToggleFocusMode}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              isFocusMode
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={isFocusMode ? 'Exit Focus Mode (Esc)' : 'Enter Distraction-Free Focus Mode'}
            aria-label="Toggle focus mode"
            aria-pressed={isFocusMode}
          >
            {isFocusMode ? (
              <>
                <Minimize2Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exit Focus</span>
              </>
            ) : (
              <>
                <Maximize2Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Focus Mode</span>
              </>
            )}
          </button>
        )}

        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors hidden sm:inline-flex"
            title="Keyboard Shortcuts (Ctrl+/)"
            aria-label="Keyboard Shortcuts"
          >
            <HelpCircleIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
