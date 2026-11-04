'use client';

import React, { useState } from 'react';
import { ChevronDownIcon } from './icons';

export interface AccordionItem {
  id: string;
  question: string;
  answer: string;
}

interface AccordionProps {
  items: AccordionItem[];
  defaultOpenId?: string;
  className?: string;
}

export function Accordion({ items, defaultOpenId, className = '' }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId || null);

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden transition-all duration-200"
          >
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left text-sm sm:text-base font-semibold text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer"
              aria-expanded={isOpen}
            >
              <span>{item.question}</span>
              <ChevronDownIcon
                className={`w-4 h-4 text-slate-400 shrink-0 ml-3 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-indigo-600' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-5 sm:px-5 sm:pb-6 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
