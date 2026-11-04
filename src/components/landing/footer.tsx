import React from 'react';
import Link from 'next/link';
import { LogoIcon } from '../ui/icons';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 text-slate-600 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand Col */}
          <div className="col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <LogoIcon className="w-7 h-7" />
              <span className="font-bold text-lg text-slate-900 tracking-tight">
                Collab<span className="text-indigo-600">Space</span>
              </span>
            </Link>
            <p className="text-slate-500 max-w-sm leading-relaxed">
              High-performance collaborative document editing for high-output product teams. Built with Yjs, TipTap 3, and Next.js.
            </p>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-slate-600">All systems operational (v1.0.0-rc)</span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-900 uppercase tracking-wider text-[11px]">
              Product
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">
                  Workspace Dashboard
                </Link>
              </li>
              <li>
                <Link href="/editor/doc-prd-sync" className="hover:text-indigo-600 transition-colors">
                  Document Editor
                </Link>
              </li>
              <li>
                <a href="#collaboration" className="hover:text-indigo-600 transition-colors">
                  Multiplayer Engine
                </a>
              </li>
              <li>
                <a href="#history" className="hover:text-indigo-600 transition-colors">
                  Version History
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-900 uppercase tracking-wider text-[11px]">
              Resources
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="hover:text-indigo-600 transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#workflows" className="hover:text-indigo-600 transition-colors">
                  Keyboard Shortcuts
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-indigo-600 transition-colors">
                  API Reference
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-indigo-600 transition-colors">
                  Pricing Plans
                </a>
              </li>
            </ul>
          </div>

          {/* Security & Legal */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-900 uppercase tracking-wider text-[11px]">
              Trust & Legal
            </h4>
            <ul className="space-y-2">
              <li>
                <span className="text-slate-500 hover:text-slate-700 cursor-pointer">
                  Privacy Policy
                </span>
              </li>
              <li>
                <span className="text-slate-500 hover:text-slate-700 cursor-pointer">
                  Terms of Service
                </span>
              </li>
              <li>
                <span className="text-slate-500 hover:text-slate-700 cursor-pointer">
                  Security Disclosures
                </span>
              </li>
              <li>
                <span className="text-slate-500 hover:text-slate-700 cursor-pointer">
                  GDPR & Compliance
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
          <p>© 2026 CollabSpace Inc. All rights reserved.</p>
          <p className="text-[11px] text-slate-400">
            Phase 1 Frontend Foundation • Engineered with Next.js & Tailwind CSS
          </p>
        </div>
      </div>
    </footer>
  );
}
