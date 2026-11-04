'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoIcon, CheckIcon, ShieldIcon, EyeIcon, EyeOffIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successInfo, setSuccessInfo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessInfo('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage('Please enter a valid work email.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setErrorMessage('Password must contain at least one letter and one number.');
      return;
    }
    if (!confirmPassword) {
      setErrorMessage('Please confirm your password.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      setErrorMessage('You must accept the terms to create an account.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          password,
          confirmPassword,
          autoLogin: false,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || 'Failed to create account. Please try again.');
        setIsLoading(false);
        return;
      }

      // Verified account creation in PostgreSQL: show confirmation and redirect to sign-in page
      setSuccessInfo('Account created successfully. Please sign in.');
      const normalizedEmail = email.trim().toLowerCase();
      const loginUrl = `/login?registered=true&email=${encodeURIComponent(normalizedEmail)}`;
      router.push(loginUrl);
    } catch {
      setErrorMessage('A network error occurred. Please check your connection and try again.');
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
          Create your CollabSpace account
        </h2>
        <p className="mt-1.5 text-xs text-slate-500">
          Start co-authoring and organizing team knowledge in real-time.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5 text-xs text-indigo-900 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <ShieldIcon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-indigo-950">Enterprise Security & Isolation</p>
              <p className="mt-0.5 text-indigo-800 leading-relaxed text-[11px]">
                Credentials hashed with bcrypt cost factor 12. Sessions secured via cryptographic HttpOnly cookies.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white py-8 px-6 sm:px-8 shadow-xl shadow-slate-200/60 rounded-2xl border border-slate-200/80">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
              <label htmlFor="fullName" className="block text-xs font-semibold text-slate-700">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                required
                disabled={isLoading}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sarah Chen"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
              />
            </div>

            <div>
              <label htmlFor="signupEmail" className="block text-xs font-semibold text-slate-700">
                Work Email
              </label>
              <input
                id="signupEmail"
                type="email"
                required
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah.chen@company.com"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
              />
            </div>

            <div>
              <label htmlFor="signupPassword" className="block text-xs font-semibold text-slate-700">
                Create Password
              </label>
              <div className="relative mt-1">
                <input
                  id="signupPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="block w-full rounded-lg border border-slate-300 pl-3.5 pr-10 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                />
                <button
                  id="toggleSignupPassword"
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
              <label htmlFor="confirmSignupPassword" className="block text-xs font-semibold text-slate-700">
                Confirm Password
              </label>
              <div className="relative mt-1">
                <input
                  id="confirmSignupPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  disabled={isLoading}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="block w-full rounded-lg border border-slate-300 pl-3.5 pr-10 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                />
                <button
                  id="toggleConfirmSignupPassword"
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

            <div className="flex items-start gap-2 pt-1">
              <input
                id="agree"
                type="checkbox"
                disabled={isLoading}
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
              />
              <label htmlFor="agree" className="text-xs text-slate-600 leading-tight cursor-pointer">
                I agree to the CollabSpace Terms of Service and Privacy Policy.
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center shadow-sm"
              isLoading={isLoading}
            >
              Create Free Account
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
