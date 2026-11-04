'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LogoIcon, ChevronDownIcon, GridIcon, SettingsIcon, LogOutIcon } from '../ui/icons';
import { Button } from '../ui/button';
import type { SessionUser } from '@/lib/auth/session';

interface NavbarProps {
  initialUser?: SessionUser | null;
}

export function Navbar({ initialUser }: NavbarProps) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(initialUser === undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Synchronize authentication status with the server-side session API
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!isMounted) return;

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
          } else {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch {
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    checkAuth();
    window.addEventListener('focus', checkAuth);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', checkAuth);
    };
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle immediate logout and update navigation without flashing
  const handleLogout = async () => {
    setIsProfileOpen(false);
    setMobileMenuOpen(false);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    setUser(null);
    router.refresh();
  };

  // Helper for user avatar initials
  const userInitials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/70 bg-white/80 backdrop-blur-md transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <LogoIcon className="w-8 h-8 rounded-lg shadow-xs group-hover:scale-105 transition-transform" />
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-xl tracking-tight text-slate-900">
              Collab<span className="text-indigo-600">Space</span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded-full">
              v1.0
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="#features" className="hover:text-indigo-600 transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-indigo-600 transition-colors">
            How It Works
          </a>
          <a href="#use-cases" className="hover:text-indigo-600 transition-colors">
            Use Cases
          </a>
          <a href="#faq" className="hover:text-indigo-600 transition-colors">
            FAQ
          </a>
        </nav>

        {/* Desktop Action Buttons / Auth State */}
        <div className="hidden md:flex items-center gap-3">
          {isLoading ? (
            // Reserved dimensions skeleton to prevent layout shift and button flashing
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-8 w-16 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-8 w-28 rounded-lg bg-slate-100 animate-pulse" />
            </div>
          ) : user ? (
            // Authenticated State: Open Dashboard & User Account Menu
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="primary" size="sm" className="shadow-xs font-semibold">
                  Open Dashboard
                </Button>
              </Link>

              {/* Profile / Account Dropdown */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer group"
                  aria-expanded={isProfileOpen}
                  aria-haspopup="true"
                  aria-label="User account menu"
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs overflow-hidden">
                    {user.avatar ? (
                      <Image src={user.avatar} alt={user.name} width={28} height={28} unoptimized className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      userInitials
                    )}
                  </div>
                  <span className="text-xs font-semibold text-slate-700 max-w-[120px] truncate group-hover:text-slate-900">
                    {user.name}
                  </span>
                  <ChevronDownIcon
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-xl border border-slate-200 py-1.5 z-50 text-left animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-900 truncate">{user.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                    </div>

                    <div className="py-1">
                      <Link
                        href="/dashboard"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                      >
                        <GridIcon className="w-4 h-4 text-slate-400" />
                        <span>Workspace Dashboard</span>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                      >
                        <SettingsIcon className="w-4 h-4 text-slate-400" />
                        <span>Account Settings</span>
                      </Link>
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left"
                      >
                        <LogOutIcon className="w-4 h-4 text-rose-500" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Unauthenticated State: Sign In & Get Started Free
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-slate-700 font-medium">
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="primary" size="sm" className="shadow-xs font-semibold">
                  Get Started Free
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Trigger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3 shadow-lg">
          <div className="flex flex-col space-y-2 text-base font-medium text-slate-700">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-50"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-50"
            >
              How It Works
            </a>
            <a
              href="#use-cases"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-50"
            >
              Use Cases
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-50"
            >
              FAQ
            </a>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            {isLoading ? (
              <div className="h-10 w-full rounded-lg bg-slate-100 animate-pulse" />
            ) : user ? (
              // Authenticated Mobile Drawer
              <>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                    {user.avatar ? (
                      <Image src={user.avatar} alt={user.name} width={32} height={32} unoptimized className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      userInitials
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 truncate">{user.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  </div>
                </div>

                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" className="w-full justify-center shadow-xs font-semibold">
                    Open Dashboard
                  </Button>
                </Link>

                <Link href="/settings" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full justify-center text-slate-700 font-medium">
                    Account Settings
                  </Button>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-2 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-center border border-rose-200 cursor-pointer"
                >
                  Sign Out
                </button>
              </>
            ) : (
              // Unauthenticated Mobile Drawer
              <>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full justify-center font-medium">
                    Sign In
                  </Button>
                </Link>
                <Link href="/signup" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" className="w-full justify-center shadow-xs font-semibold">
                    Get Started Free
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
