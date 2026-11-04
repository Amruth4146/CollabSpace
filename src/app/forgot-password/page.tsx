'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LogoIcon, ShieldIcon, MailIcon, ArrowLeftIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid work email address.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Failed to dispatch recovery request.');
        setIsLoading(false);
        return;
      }

      setSubmitted(true);
      setIsLoading(false);
    } catch {
      setErrorMessage('Network connection error. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <LogoIcon className="w-9 h-9 rounded-xl shadow-xs group-hover:scale-105 transition-transform" />
          <span className="font-extrabold text-2xl text-slate-900 tracking-tight">
            Collab<span className="text-indigo-600">Space</span>
          </span>
        </Link>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          Reset your password
        </h2>
        <p className="mt-1.5 text-xs text-slate-500">
          Enter your registered email and we&apos;ll send recovery instructions.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5 text-xs text-indigo-900 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <ShieldIcon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-indigo-950">Secure Single-Use Tokens</p>
              <p className="mt-0.5 text-indigo-800 leading-relaxed text-[11px]">
                Reset links are cryptographically random, expire in 1 hour, and are invalidated immediately upon use.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white py-8 px-6 sm:px-8 shadow-xl shadow-slate-200/60 rounded-2xl border border-slate-200/80">
          {submitted ? (
            <div className="text-center py-2 space-y-4">
              <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center mx-auto text-indigo-600">
                <MailIcon className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                Check your inbox
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                If an account exists for <strong className="text-slate-800">{email}</strong>, password reset instructions have been dispatched.
              </p>
              <p className="text-[11px] text-slate-400">
                In local development mode without configured SMTP, the secure link is logged to your server console.
              </p>

              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSubmitted(false)}
                  className="w-full justify-center text-xs"
                >
                  Try another email
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              <div>
                <label htmlFor="recoveryEmail" className="block text-xs font-semibold text-slate-700">
                  Work Email Address
                </label>
                <input
                  id="recoveryEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center shadow-sm"
                isLoading={isLoading}
              >
                Send Password Reset Link
              </Button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-500"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              <span>Back to sign in</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
