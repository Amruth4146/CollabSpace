'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, CheckIcon } from '../ui/icons';

export function UseCases() {
  const [activeTab, setActiveTab] = useState<'product' | 'engineering' | 'meetings' | 'wiki'>('product');

  const cases = {
    product: {
      title: 'Product Requirements Documents (PRDs)',
      subtitle: 'Align product managers, designers, and engineers on user stories and acceptance criteria.',
      benefits: [
        'Multiplayer commenting directly attached to user stories',
        'Structured tables and callout boxes for UX edge cases',
        'Real-time status badges for sprint milestones',
      ],
      sampleTitle: 'PRD: Real-Time Sync Engine v2.4',
      docTag: '#Product #Specs',
    },
    engineering: {
      title: 'Technical Architecture & RFCs',
      subtitle: 'Debate system design, data schemas, and API contracts before writing code.',
      benefits: [
        'Syntax-highlighted code blocks with monospaced typography',
        'Point-in-time diff snapshots for tracking design revisions',
        'Granular reviewer feedback on critical algorithmic sections',
      ],
      sampleTitle: 'RFC-402: CRDT State Vector Compression',
      docTag: '#Engineering #Architecture',
    },
    meetings: {
      title: 'Collaborative Meeting Notes & Agendas',
      subtitle: 'Turn synchronous discussions into actionable agendas with shared real-time capture.',
      benefits: [
        'Simultaneous typing by all attendees during standups',
        'Checklists and action items with clear ownership',
        'Searchable archive to keep historic decisions transparent',
      ],
      sampleTitle: 'Weekly Product & Core Infra Sync',
      docTag: '#Meetings #ActionItems',
    },
    wiki: {
      title: 'Company Knowledge Base & Playbooks',
      subtitle: 'Centralize onboarding guides, runbooks, and design tokens for the entire organization.',
      benefits: [
        'Organized tag-based indexing across flexible workspaces',
        'Blazing-fast Cmd+K search finding answers in milliseconds',
        'Role-based permissions protecting confidential playbooks',
      ],
      sampleTitle: 'CollabSpace Engineering Onboarding Guide',
      docTag: '#Wiki #Handbook',
    },
  };

  const current = cases[activeTab];

  return (
    <section id="use-cases" className="py-20 md:py-28 bg-slate-50/70 border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-full">
            Tailored For Teams
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            One powerful editor for every mission-critical document
          </h2>
          <p className="text-base sm:text-lg text-slate-600">
            Whether you are writing a product roadmap, an architecture RFC, or meeting minutes.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="mt-12 flex justify-center overflow-x-auto pb-2">
          <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 shadow-2xs gap-1">
            <button
              onClick={() => setActiveTab('product')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'product'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Product Specs
            </button>
            <button
              onClick={() => setActiveTab('engineering')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'engineering'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Engineering RFCs
            </button>
            <button
              onClick={() => setActiveTab('meetings')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'meetings'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Meeting Notes
            </button>
            <button
              onClick={() => setActiveTab('wiki')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'wiki'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Company Wiki
            </button>
          </div>
        </div>

        {/* Content Showcase Card */}
        <div className="mt-8 max-w-4xl mx-auto bg-white rounded-3xl border border-slate-200/90 p-8 sm:p-12 shadow-xl flex flex-col md:flex-row gap-8 items-center justify-between">
          <div className="space-y-4 max-w-lg">
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md">
              {current.docTag}
            </span>
            <h3 className="text-2xl font-bold text-slate-900 leading-tight">
              {current.title}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {current.subtitle}
            </p>

            <div className="space-y-2 pt-2">
              {current.benefits.map((b, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckIcon className="w-3 h-3" />
                  </div>
                  <span>{b}</span>
                </div>
              ))}
            </div>

            <div className="pt-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                <span>Try this workflow in CollabSpace</span>
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="w-full md:w-80 bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3 shadow-inner">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Preview Card</span>
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <span className="text-lg">📄</span>
              <h4 className="text-xs font-bold text-slate-900 truncate">{current.sampleTitle}</h4>
              <p className="text-[11px] text-slate-500 line-clamp-2">
                Real-time collaborative editing with multi-cursor presence and instant team rollback.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
