import React from 'react';
import {
  UsersIcon,
  DocumentIcon,
  MessageSquareIcon,
  HistoryIcon,
  SparklesIcon,
  ZapIcon,
  LockIcon,
  CheckIcon,
} from '../ui/icons';

export function Features() {
  const featureList = [
    {
      id: 'collaboration',
      icon: UsersIcon,
      badge: 'Multiplayer Engine',
      title: 'Real-Time Multiplayer Collaboration',
      description:
        'Co-author documents simultaneously with sub-50ms peer latency. Live colored cursors, presence tags, and conflict-free CRDT synchronization powered by Yjs.',
      points: [
        'Live remote cursor and selection tracking',
        'Optimistic local updates with zero typing lag',
        'Automatic offline reconnection and state reconciliation',
      ],
      color: 'indigo',
    },
    {
      id: 'workflows',
      icon: DocumentIcon,
      badge: 'Organization',
      title: 'Structured Document Management',
      description:
        'Keep knowledge structured across flexible workspaces. Organize notes, PRDs, engineering specs, and meeting minutes with instant search and smart tagging.',
      points: [
        'Multi-tenant team and personal workspace switcher',
        'Instant Cmd+K fuzzy search across all documents',
        'Grid and tabular list view with star filters',
      ],
      color: 'violet',
    },
    {
      id: 'comments',
      icon: MessageSquareIcon,
      badge: 'Discussions',
      title: 'Threaded Contextual Commenting',
      description:
        'Leave targeted feedback directly attached to sentences and paragraphs. Keep discussions focused, mention team members, and resolve discussions as ideas mature.',
      points: [
        'Anchor comments directly to selected text',
        'Nested threaded replies for deep technical debates',
        'Resolve and filter active vs completed feedback',
      ],
      color: 'pink',
    },
    {
      id: 'history',
      icon: HistoryIcon,
      badge: 'Time Travel',
      title: 'Granular Point-in-Time Version History',
      description:
        'Never worry about losing an idea or accidental overwrites. Inspect the exact evolution of your document with author attribution, diff highlights, and instant restore.',
      points: [
        'Continuous automated version snapshots',
        'Visual line additions and deletions (+/- diff count)',
        'One-click rollback to any previous version',
      ],
      color: 'emerald',
    },
  ];

  return (
    <section id="features" className="py-20 md:py-32 bg-slate-50/60 border-t border-slate-200/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-full">
            Engineered for Modern Teams
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            Everything your team needs to write, debate, and deliver.
          </h2>
          <p className="text-base sm:text-lg text-slate-600">
            CollabSpace combines the minimalist elegance of Notion with the multiplayer horsepower of Google Docs and the speed of Linear.
          </p>
        </div>

        {/* 4 Core Pillars Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
          {featureList.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                id={item.id}
                className="group relative bg-white rounded-2xl p-8 border border-slate-200/90 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-slate-600 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 space-y-2.5">
                  {item.points.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                      <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckIcon className="w-3 h-3" />
                      </div>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mini Architecture Highlight Bar */}
        <div className="mt-16 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
            <div className="space-y-1.5">
              <div className="flex items-center justify-center md:justify-start gap-2 text-indigo-400 text-xs font-semibold tracking-wider uppercase">
                <ZapIcon className="w-4 h-4" />
                <span>Yjs CRDT Engine</span>
              </div>
              <h4 className="text-lg font-bold">Conflict-Free by Design</h4>
              <p className="text-xs text-slate-400">
                Mathematical convergence ensures no edits are ever clobbered, even with asynchronous offline merges.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center md:justify-start gap-2 text-indigo-400 text-xs font-semibold tracking-wider uppercase">
                <SparklesIcon className="w-4 h-4" />
                <span>TipTap 3 Foundation</span>
              </div>
              <h4 className="text-lg font-bold">Rich-Text Powerhouse</h4>
              <p className="text-xs text-slate-400">
                Built on top of ProseMirror schema with custom node serialization and keyboard shortcuts.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center md:justify-start gap-2 text-indigo-400 text-xs font-semibold tracking-wider uppercase">
                <LockIcon className="w-4 h-4" />
                <span>Multi-Tenant Workspaces</span>
              </div>
              <h4 className="text-lg font-bold">Role-Based Access</h4>
              <p className="text-xs text-slate-400">
                Secure tenant isolation with distinct Owner, Editor, Commenter, and Viewer access levels.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
