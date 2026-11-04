'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogoIcon, CheckIcon, EyeIcon, EyeOffIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successInfo, setSuccessInfo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessInfo('');

    if (!token) {
      setErrorMessage('Missing password reset token. Please use the link provided in your email.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Failed to reset password. The link may have expired.');
        setIsLoading(false);
        return;
      }

      setSuccessInfo('Password reset successfully! Redirecting to workspace...');
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 900);
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
          Create new password
        </h2>
        <p className="mt-1.5 text-xs text-slate-500">
          Enter and confirm your new secure password below.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        {!token && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-900 shadow-2xs">
            <p className="font-semibold">Missing Reset Token</p>
            <p className="mt-0.5 text-rose-800 leading-relaxed text-[11px]">
              No recovery token was found in the URL. Please check the link from your email or request a new one.
            </p>
            <Link
              href="/forgot-password"
              className="mt-2 inline-block font-semibold text-rose-950 underline"
            >
              Request a new password reset link →
            </Link>
          </div>
        )}

        <div className="bg-white py-8 px-6 sm:px-8 shadow-xl shadow-slate-200/60 rounded-2xl border border-slate-200/80">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {errorMessage}
              </div>
            )}
            {successInfo && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-1.5">
                <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successInfo}</span>
              </div>
            )}

            <div>
              <label htmlFor="newPassword" className="block text-xs font-semibold text-slate-700">
                New Password
              </label>
              <div className="relative mt-1">
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="block w-full rounded-lg border border-slate-300 pl-3.5 pr-10 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer z-10"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOffIcon className="w-4 h-4 pointer-events-none" />
                  ) : (
                    <EyeIcon className="w-4 h-4 pointer-events-none" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmNewPassword" className="block text-xs font-semibold text-slate-700">
                Confirm New Password
              </label>
              <div className="relative mt-1">
                <input
                  id="confirmNewPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  disabled={isLoading}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="block w-full rounded-lg border border-slate-300 pl-3.5 pr-10 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer z-10"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOffIcon className="w-4 h-4 pointer-events-none" />
                  ) : (
                    <EyeIcon className="w-4 h-4 pointer-events-none" />
                  )}
                </button>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={password.length >= 8 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                  {password.length >= 8 ? '✓' : '○'}
                </span>
                <span>At least 8 characters (with letter and number)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={password.length > 0 && password === confirmPassword ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                  {password.length > 0 && password === confirmPassword ? '✓' : '○'}
                </span>
                <span>Passwords match</span>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center shadow-sm"
              isLoading={isLoading}
              disabled={!token}
            >
              Update Password
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-xs">
            <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Return to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-400">
          Loading password reset...
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
