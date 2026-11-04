import React from 'react';
import { DocumentIcon, UsersIcon, MessageSquareIcon, HistoryIcon } from '../ui/icons';

export function HowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'Create Your Workspace',
      description:
        'Set up dedicated team spaces with granular role-based permissions for Owners, Admins, Editors, and Viewers.',
      icon: DocumentIcon,
      badge: 'Step 1',
    },
    {
      step: '02',
      title: 'Draft with Rich Typography',
      description:
        'Write naturally with TipTap 3 rich-text editor. Headings, code blocks, callouts, and lists flow under your fingers with zero friction.',
      icon: UsersIcon,
      badge: 'Step 2',
    },
    {
      step: '03',
      title: 'Collaborate with Live Multi-Cursor',
      description:
        'See your teammates typing in real-time with sub-50ms peer latency. CRDT convergence ensures no edit conflicts occur.',
      icon: MessageSquareIcon,
      badge: 'Step 3',
    },
    {
      step: '04',
      title: 'Discuss & Rollback Anytime',
      description:
        'Leave anchored inline comments to debate decisions and travel backward in time with instant snapshot restoration.',
      icon: HistoryIcon,
      badge: 'Step 4',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-white border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-full">
            Seamless Workflow
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            How CollabSpace transforms team writing
          </h2>
          <p className="text-base sm:text-lg text-slate-600">
            From first brainstorm to production-ready specification in four intuitive steps.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative bg-slate-50/70 hover:bg-white rounded-2xl p-6 border border-slate-200/80 hover:border-indigo-300 transition-all duration-200 shadow-2xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-black font-mono text-indigo-600/40">
                      {item.step}
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  </div>

                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600 mb-4 shadow-2xs">
                    <Icon className="w-5 h-5" />
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
