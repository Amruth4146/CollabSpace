import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'violet';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({
  children,
  variant = 'slate',
  size = 'md',
  className = '',
}: BadgeProps) {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 rounded-md font-medium',
    md: 'text-xs px-2.5 py-0.5 rounded-full font-medium',
  }[size];

  const variantStyles = {
    slate: 'bg-slate-100 text-slate-700 border border-slate-200/80',
    indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    amber: 'bg-amber-50 text-amber-800 border border-amber-200/80',
    rose: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    violet: 'bg-purple-50 text-purple-700 border border-purple-200/80',
  }[variant];

  return (
    <span className={`inline-flex items-center gap-1 leading-none ${sizeStyles} ${variantStyles} ${className}`}>
      {children}
    </span>
  );
}
