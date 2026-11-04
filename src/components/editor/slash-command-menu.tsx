'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  BulletListIcon,
  OrderedListIcon,
  CheckSquareIcon,
  BlockquoteIcon,
  HorizontalRuleIcon,
  LinkIcon,
} from '../ui/icons';

export interface SlashItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'Text' | 'Lists' | 'Advanced';
  command: (editor: Editor, range: { from: number; to: number }) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'text',
    title: 'Text',
    description: 'Just start writing with plain paragraph text.',
    icon: <span className="font-semibold text-xs text-slate-700">T</span>,
    category: 'Text',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    id: 'h1',
    title: 'Heading 1',
    description: 'Big section heading.',
    icon: <Heading1Icon className="w-4 h-4 text-indigo-600" />,
    category: 'Text',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    id: 'h2',
    title: 'Heading 2',
    description: 'Medium subsection heading.',
    icon: <Heading2Icon className="w-4 h-4 text-indigo-600" />,
    category: 'Text',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    id: 'h3',
    title: 'Heading 3',
    description: 'Small subsection heading.',
    icon: <Heading3Icon className="w-4 h-4 text-indigo-600" />,
    category: 'Text',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    id: 'bullet-list',
    title: 'Bullet List',
    description: 'Create a simple bulleted list.',
    icon: <BulletListIcon className="w-4 h-4 text-indigo-600" />,
    category: 'Lists',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'numbered-list',
    title: 'Numbered List',
    description: 'Create an ordered sequential list.',
    icon: <OrderedListIcon className="w-4 h-4 text-indigo-600" />,
    category: 'Lists',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: 'task-list',
    title: 'Task List',
    description: 'Track tasks with an interactive checklist.',
    icon: <CheckSquareIcon className="w-4 h-4 text-emerald-600" />,
    category: 'Lists',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: 'blockquote',
    title: 'Quote',
    description: 'Capture a quote or callout block.',
    icon: <BlockquoteIcon className="w-4 h-4 text-indigo-600" />,
    category: 'Text',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: 'codeblock',
    title: 'Code Block',
    description: 'Format syntax highlighted code snippet.',
    icon: <span className="font-mono text-xs font-bold text-slate-700">{'</>'}</span>,
    category: 'Advanced',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Visually divide sections with a horizontal rule.',
    icon: <HorizontalRuleIcon className="w-4 h-4 text-slate-500" />,
    category: 'Advanced',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: 'link',
    title: 'Hyperlink',
    description: 'Insert a safe web link or URL.',
    icon: <LinkIcon className="w-4 h-4 text-indigo-600" />,
    category: 'Advanced',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      // Dispatch custom event to trigger link modal
      window.dispatchEvent(new CustomEvent('collabspace:open-link-dialog'));
    },
  },
];

interface SlashCommandMenuProps {
  editor: Editor | null;
  isOpen: boolean;
  query: string;
  range: { from: number; to: number } | null;
  position: { top: number; left: number };
  onClose: () => void;
}

export function SlashCommandMenu({
  editor,
  isOpen,
  query,
  range,
  position,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredItems = SLASH_ITEMS.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setSelectedIndex(0);
  }

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex] && editor && range) {
          filteredItems[selectedIndex].command(editor, range);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, selectedIndex, filteredItems, editor, range, onClose]);

  // Keep selected item visible in scrolling container
  useEffect(() => {
    if (menuRef.current) {
      const activeElement = menuRef.current.querySelector('[data-selected="true"]');
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen || !editor || !range) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Slash commands"
      style={{
        position: 'fixed',
        top: `${Math.min(position.top + 24, window.innerHeight - 340)}px`,
        left: `${Math.min(Math.max(16, position.left), window.innerWidth - 320)}px`,
      }}
      className="z-50 w-72 max-h-80 overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-2xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100"
    >
      <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        <span>Basic Blocks</span>
        {query && <span className="text-indigo-600 font-normal">Matching &quot;{query}&quot;</span>}
      </div>

      {filteredItems.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-slate-400">
          No matching commands found.
        </div>
      ) : (
        filteredItems.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={item.id}
              role="menuitem"
              type="button"
              data-selected={isSelected}
              onClick={() => {
                item.command(editor, range);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                isSelected ? 'bg-indigo-50/80 text-indigo-950 font-medium' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-white border-indigo-200 shadow-2xs' : 'bg-slate-50 border-slate-200/80'
                }`}
              >
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800 leading-snug truncate">
                  {item.title}
                </div>
                <div className="text-[11px] text-slate-400 truncate leading-snug">
                  {item.description}
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
