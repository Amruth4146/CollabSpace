import React from 'react';
import { Accordion, AccordionItem } from '../ui/accordion';

export function FAQ() {
  const faqItems: AccordionItem[] = [
    {
      id: 'faq-1',
      question: 'How does real-time collaboration work in CollabSpace?',
      answer:
        'CollabSpace uses Conflict-free Replicated Data Types (CRDTs) powered by Yjs. Every keystroke is immediately applied locally with zero input latency, while compact binary delta updates are broadcast to connected peers over WebSockets for instant synchronization.',
    },
    {
      id: 'faq-2',
      question: 'What happens if two team members type in the same section simultaneously?',
      answer:
        'CRDT mathematical convergence guarantees that all peer documents converge to the exact same state without locks, merge conflicts, or overwritten changes. Color-coded cursor labels display exactly where colleagues are typing in real time.',
    },
    {
      id: 'faq-3',
      question: 'Can I work on documents while offline or on poor network connections?',
      answer:
        'Yes. Local edits are buffered seamlessly in memory and local storage. When your connection is restored, CollabSpace synchronizes pending changes automatically with the server without disrupting your active writing session.',
    },
    {
      id: 'faq-4',
      question: 'How does point-in-time version history and rollback work?',
      answer:
        'Every document automatically records periodic version snapshots with author attribution and line diff counts (+/- lines). You can review historical revisions in the sidebar and restore any previous version with a single click.',
    },
    {
      id: 'faq-5',
      question: 'What permissions and security controls are available in workspaces?',
      answer:
        'CollabSpace enforces role-based access control (RBAC) with Owner, Admin, Editor, and Viewer permission tiers. Team links can be restricted to verified workspace members or shared via read-only public links.',
    },
  ];

  return (
    <section id="faq" className="py-20 md:py-28 bg-white border-t border-slate-200/80">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto space-y-4 mb-14">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-3 py-1 rounded-full">
            Frequently Asked Questions
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Everything you need to know about CollabSpace
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Answers to common questions about our real-time engine, security, and versioning.
          </p>
        </div>

        <Accordion items={faqItems} defaultOpenId="faq-1" />
      </div>
    </section>
  );
}
