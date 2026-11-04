import React from 'react';
import Link from 'next/link';
import { Button } from '../ui/button';
import { ArrowRightIcon, SparklesIcon, ShieldIcon, ZapIcon } from '../ui/icons';
import { InteractivePreview } from './interactive-preview';

export function Hero() {
  return (
    <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden bg-gradient-to-b from-white via-slate-50/50 to-white">
      {/* Background radial glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-tr from-indigo-200/40 via-violet-200/30 to-pink-200/20 blur-3xl rounded-full"
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Announcement Pill */}
        <div className="flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/70 text-indigo-700 text-xs font-medium hover:bg-indigo-100/70 transition-all hover:scale-102 shadow-2xs"
          >
            <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
            <span className="font-semibold">Next-Gen Realtime Core:</span>
            <span>CRDTs & TipTap 3 rich-text editor is live</span>
            <ArrowRightIcon className="w-3.5 h-3.5 text-indigo-600" />
          </Link>
        </div>

        {/* Hero Title & Subtitle */}
        <div className="text-center mt-6 max-w-4xl mx-auto space-y-6">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.08]">
            Your team&apos;s ideas,{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-800 bg-clip-text text-transparent">
              perfectly in sync.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            The real-time collaborative platform where distributed teams draft specs, debate architectural designs, and build knowledge together with sub-millisecond local latency.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto shadow-md hover:shadow-lg text-base px-7 text-white"
                rightIcon={<ArrowRightIcon className="w-4 h-4 ml-1 text-white" />}
              >
                Start Creating Free
              </Button>
            </Link>
            <Link href="#features" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-6">
                Explore Features
              </Button>
            </Link>
          </div>

          {/* Value props badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-y-2 gap-x-8 text-xs font-medium text-slate-500">
            <div className="flex items-center gap-2">
              <ZapIcon className="w-4 h-4 text-amber-500" />
              <span>Sub-50ms sync latency</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-emerald-600" />
              <span>Enterprise-grade security</span>
            </div>
            <div className="flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-indigo-600" />
              <span>No signup required to test</span>
            </div>
          </div>
        </div>

        {/* Visual Interactive App Demo */}
        <div className="mt-14 sm:mt-18">
          <InteractivePreview />
        </div>
      </div>
    </section>
  );
}
