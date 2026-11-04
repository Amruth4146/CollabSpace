import React from 'react';
import Link from 'next/link';
import { Button } from '../ui/button';
import { ArrowRightIcon } from '../ui/icons';

export function CallToAction() {
  return (
    <section className="py-20 bg-white border-t border-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-violet-700 p-8 sm:p-14 text-white shadow-2xl overflow-hidden text-center sm:text-left">
          {/* Subtle background overlay circles */}
          <div className="pointer-events-none absolute -right-20 -top-20 w-80 h-80 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-indigo-900/30 blur-2xl" />

          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-8">
            <div className="max-w-xl space-y-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-200">
                Ready to elevate your team?
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Start collaborating in CollabSpace today.
              </h2>
              <p className="text-indigo-100 text-sm sm:text-base leading-relaxed">
                Join thousands of designers, developers, and product managers writing faster with live collaborative synchronicity.
              </p>
            </div>

            <div className="shrink-0 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Link href="/dashboard" className="w-full sm:w-auto">
                <Button
                  variant="white"
                  size="lg"
                  className="w-full sm:w-auto px-7"
                  rightIcon={<ArrowRightIcon className="w-4 h-4 text-indigo-700" />}
                >
                  Launch Workspace
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
