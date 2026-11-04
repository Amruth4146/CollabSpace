'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SparklesIcon, MessageSquareIcon, HistoryIcon, ArrowRightIcon } from '../ui/icons';

export function InteractivePreview() {
  const [activeTab, setActiveTab] = useState<'editor' | 'comments' | 'history'>('editor');

  return (
    <div className="relative mx-auto max-w-5xl rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-indigo-100/60 overflow-hidden">
      {/* Fake Browser / App Topbar */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-400/80" />
            <span className="w-3 h-3 rounded-full bg-amber-400/80" />
            <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
          </div>
          <span className="text-slate-300 mx-2">|</span>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200/80 shadow-2xs">
            <span>📄</span>
            <span className="truncate max-w-[200px] sm:max-w-xs font-semibold text-slate-800">
              Product Requirements: Real-Time Sync Engine v2
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        {/* Collaborators & Quick Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Avatar stack */}
          <div className="flex -space-x-2 overflow-hidden items-center">
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white bg-indigo-500 text-white text-[11px] font-bold flex items-center justify-center"
              title="Alex Rivera (You)"
            >
              AR
            </div>
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white bg-pink-500 text-white text-[11px] font-bold flex items-center justify-center"
              title="Sarah Chen (Typing...)"
            >
              SC
            </div>
            <div
              className="inline-block h-7 w-7 rounded-full ring-2 ring-white bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center"
              title="Marcus Brody (Viewing)"
            >
              MB
            </div>
          </div>

          <Link
            href="/editor/doc-prd-sync"
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors"
          >
            <span>Open in Editor</span>
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Editor Sub-toolbar */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-2 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              activeTab === 'editor'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Document
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'comments'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <MessageSquareIcon className="w-3.5 h-3.5 text-indigo-500" />
            <span>Comments</span>
            <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded-full text-[10px]">2</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <HistoryIcon className="w-3.5 h-3.5 text-slate-500" />
            <span>Version History</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-400 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            All changes saved
          </span>
          <span className="text-slate-200">|</span>
          <span className="text-slate-400 text-[11px]">3 active collaborators</span>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="p-6 sm:p-10 min-h-[380px] bg-white relative">
        {activeTab === 'editor' && (
          <div className="max-w-3xl mx-auto space-y-5 text-slate-800">
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                Draft Specification
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 pt-2">
                Product Requirements: Real-Time Sync Engine v2
              </h1>
            </div>

            <p className="text-slate-600 text-base leading-relaxed">
              CollabSpace enables distributed cross-functional teams to brainstorm, draft, and finalize mission-critical documents with zero friction. Under high latency conditions, the document state remains consistent across all active peers.
            </p>

            {/* Simulated Live Remote Cursor */}
            <div className="relative border-l-2 border-indigo-500 bg-indigo-50/40 p-4 rounded-r-xl">
              <div className="absolute -top-3 left-4 bg-pink-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>Sarah Chen is editing</span>
              </div>
              <p className="text-slate-700 text-sm italic">
                &ldquo;Sub-50ms Local Echo: Keystrokes mutate local DOM immediately. Changes propagate to peer sockets through Yjs byte-compressed deltas.&rdquo;
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-indigo-200 transition-colors shadow-2xs">
                <div className="text-indigo-600 font-semibold text-xs flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5" />
                  <span>Sub-50ms Echo</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Zero latency typing with optimistic conflict-free replication.</p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-indigo-200 transition-colors shadow-2xs">
                <div className="text-emerald-600 font-semibold text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Live Presence</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Awareness of active cursors, highlighted selections, and views.</p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-indigo-200 transition-colors shadow-2xs">
                <div className="text-purple-600 font-semibold text-xs flex items-center gap-1.5">
                  <HistoryIcon className="w-3.5 h-3.5" />
                  <span>Full Rollback</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Every keystroke tracked with time-travel snapshots.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-pink-500 text-white text-xs font-bold flex items-center justify-center">
                    SC
                  </div>
                  <span className="text-xs font-semibold text-slate-800">Sarah Chen</span>
                  <span className="text-[11px] text-slate-400">25m ago</span>
                </div>
                <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                  Open
                </span>
              </div>
              <p className="text-xs text-slate-500 italic mt-2 border-l-2 border-indigo-300 pl-2">
                &ldquo;Sub-50ms Local Echo: Keystrokes must immediately mutate local DOM&rdquo;
              </p>
              <p className="text-sm text-slate-700 mt-2 font-medium">
                Should we specify fallback mechanisms if WebSocket drops during high-frequency typing?
              </p>
              <div className="mt-3 pl-4 border-l border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                    AR
                  </div>
                  <span className="text-xs font-medium text-slate-800">Alex Rivera (You)</span>
                  <span className="text-[10px] text-slate-400">18m ago</span>
                </div>
                <p className="text-xs text-slate-600">
                  Good point! The client will buffer local Yjs transactions in memory and replay them automatically upon socket handshake.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">
                    MB
                  </div>
                  <span className="text-xs font-semibold text-slate-800">Marcus Brody</span>
                  <span className="text-[11px] text-slate-400">1h ago</span>
                </div>
                <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                  Open
                </span>
              </div>
              <p className="text-sm text-slate-700 mt-2">
                Can we include benchmark metrics for documents over 50,000 words?
              </p>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <HistoryIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">v2.4 (Current Version)</h4>
                  <span className="text-xs text-indigo-700 font-medium">Just now</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">Updated executive summary and refined latency target metrics.</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1.5">
                  <span>Author: Alex Rivera</span>
                  <span>•</span>
                  <span className="text-emerald-600 font-medium">+14 lines</span>
                  <span className="text-rose-600 font-medium">-3 lines</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <HistoryIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-800">v2.3</h4>
                  <span className="text-xs text-slate-400">2 hours ago</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">Added offline buffering requirements and persistence notes.</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1.5">
                  <span>Author: Sarah Chen</span>
                  <span>•</span>
                  <span className="text-emerald-600 font-medium">+32 lines</span>
                  <span className="text-rose-600 font-medium">-8 lines</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
