'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LogoIcon, ArrowRightIcon, CheckIcon, MailIcon, RefreshCwIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [isVerifying, setIsVerifying] = useState(Boolean(token));
  const [isVerified, setIsVerified] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Resend state
  const [emailToResend, setEmailToResend] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');

  // Auto-verify if token is present in URL
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    async function verify() {
      setIsVerifying(true);
      setVerifyError('');

      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!isMounted) return;

        if (response.ok) {
          setIsVerified(true);
        } else {
          setVerifyError(data.error || 'Verification token is invalid or expired.');
        }
      } catch {
        if (isMounted) setVerifyError('Network error verifying email.');
      } finally {
        if (isMounted) setIsVerifying(false);
      }
    }

    verify();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailToResend.trim() || !emailToResend.includes('@')) {
      setResendError('Please enter a valid work email.');
      return;
    }

    setIsResending(true);
    setResendMessage('');
    setResendError('');

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToResend.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setResendMessage(data.message || 'Verification link has been dispatched!');
      } else {
        setResendError(data.error || 'Failed to resend verification.');
      }
    } catch {
      setResendError('Network error. Please try again.');
    } finally {
      setIsResending(false);
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
          Verify your email address
        </h2>
        <p className="mt-1.5 text-xs text-slate-500">
          Confirm your email to unlock all collaboration capabilities.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-8 shadow-xl shadow-slate-200/60 rounded-2xl border border-slate-200/80 text-center">
          {/* State 1: Verifying in progress */}
          {isVerifying && (
            <div className="py-6 space-y-3">
              <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-700">
                Verifying your token securely...
              </p>
            </div>
          )}

          {/* State 2: Successfully Verified */}
          {!isVerifying && isVerified && (
            <div className="space-y-4 py-2">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
                <CheckIcon className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Email Confirmed Successfully!
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your email address has been verified. You now have full access to team documents and collaborative editing.
              </p>
              <div className="pt-2">
                <Link href="/dashboard" className="block w-full">
                  <Button variant="primary" className="w-full justify-center text-xs" rightIcon={<ArrowRightIcon className="w-3.5 h-3.5" />}>
                    Continue to Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* State 3: Token Error or No Token -> Resend Form */}
          {!isVerifying && !isVerified && (
            <div className="space-y-4">
              <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto text-indigo-600 shadow-2xs">
                <MailIcon className="w-7 h-7" />
              </div>

              {verifyError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-left">
                  {verifyError}
                </div>
              )}

              <h3 className="text-base font-semibold text-slate-900">
                Check your inbox for a verification link
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Click the confirmation link sent to your work email. If you need a new link, enter your email below to resend:
              </p>

              {resendMessage && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 text-left">
                  <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{resendMessage}</span>
                </div>
              )}

              {resendError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-left">
                  {resendError}
                </div>
              )}

              <form onSubmit={handleResend} className="space-y-3 pt-2 text-left">
                <div>
                  <label htmlFor="verifyEmail" className="block text-xs font-semibold text-slate-700">
                    Your Registered Email
                  </label>
                  <input
                    id="verifyEmail"
                    type="email"
                    required
                    value={emailToResend}
                    onChange={(e) => setEmailToResend(e.target.value)}
                    placeholder="name@company.com"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <Button
                  type="submit"
                  variant="outline"
                  isLoading={isResending}
                  leftIcon={<RefreshCwIcon className="w-3.5 h-3.5" />}
                  className="w-full justify-center text-xs"
                >
                  Resend Verification Email
                </Button>
              </form>

              <div className="pt-2">
                <Link href="/dashboard" className="block w-full">
                  <Button variant="primary" className="w-full justify-center text-xs">
                    Return to Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-500">
            Need to change account?{' '}
            <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Sign in with another email
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-400">
          Loading email verification...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
