'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckIcon, CloseIcon } from './icons';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextType {
  toast: (options: { title: string; description?: string; variant?: ToastVariant }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({
      title,
      description,
      variant = 'info',
    }: {
      title: string;
      description?: string;
      variant?: ToastVariant;
    }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastItem = { id, title, description, variant };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, 3500);
    },
    [removeToast]
  );

  const success = useCallback((title: string, description?: string) => toast({ title, description, variant: 'success' }), [toast]);
  const error = useCallback((title: string, description?: string) => toast({ title, description, variant: 'error' }), [toast]);
  const info = useCallback((title: string, description?: string) => toast({ title, description, variant: 'info' }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      {/* Toast Notification Container */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 ${
              item.variant === 'success'
                ? 'bg-white/95 border-emerald-200 text-slate-900 ring-1 ring-emerald-500/10'
                : item.variant === 'error'
                ? 'bg-white/95 border-rose-200 text-slate-900 ring-1 ring-rose-500/10'
                : item.variant === 'warning'
                ? 'bg-white/95 border-amber-200 text-slate-900 ring-1 ring-amber-500/10'
                : 'bg-white/95 border-slate-200 text-slate-900 ring-1 ring-indigo-500/10'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {item.variant === 'success' && (
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckIcon className="w-3.5 h-3.5" />
                </div>
              )}
              {item.variant === 'error' && (
                <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs">
                  ✕
                </div>
              )}
              {item.variant === 'warning' && (
                <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-xs">
                  !
                </div>
              )}
              {item.variant === 'info' && (
                <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                  i
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900">{item.title}</p>
              {item.description && (
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{item.description}</p>
              )}
            </div>

            <button
              onClick={() => removeToast(item.id)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Dismiss toast"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      toast: ({ title }: { title: string }) => console.log('[Toast]', title),
      success: (title: string) => console.log('[Toast Success]', title),
      error: (title: string) => console.error('[Toast Error]', title),
      info: (title: string) => console.log('[Toast Info]', title),
    };
  }
  return context;
}
