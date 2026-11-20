import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, Eye, EyeOff, KeyRound, Lock, X } from 'lucide-react';

interface DemoUnlockModalProps {
  isOpen: boolean;
  blocking: boolean;
  expiresAtMs: number;
  remainingLabel: string;
  onUnlock: (password: string) => boolean;
  onClose?: () => void;
}

export const DemoUnlockModal: React.FC<DemoUnlockModalProps> = ({
  isOpen,
  blocking,
  expiresAtMs,
  remainingLabel,
  onUnlock,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || blocking || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, blocking, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Enter the unlock password to activate the full version.');
      return;
    }
    const ok = onUnlock(password);
    if (!ok) {
      setError('Incorrect password. Please check and try again.');
      return;
    }
    setError(null);
    setPassword('');
    if (onClose) onClose();
  };

  const formattedExpiry = new Date(expiresAtMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      className={
        blocking
          ? 'min-h-screen flex items-center justify-center px-4 py-10 bg-[#F7F8FA] dark:bg-slate-950'
          : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4'
      }
      onClick={() => {
        if (!blocking && onClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-unlock-title"
    >
      <div
        className={
          blocking
            ? 'w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-5'
            : 'w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5'
        }
        onClick={(e) => e.stopPropagation()}
      >
        {!blocking && (
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                blocking
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400'
                  : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400'
              }`}
            >
              {blocking ? <Lock className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
            </span>
            <div>
              {blocking && (
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>AndrewsPlan</span>
                </p>
              )}
              <h1
                id="demo-unlock-title"
                className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
              >
                {blocking ? '7-Day Demo Expired' : 'Unlock Full Version'}
              </h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {blocking
                  ? `Your 7-day demo ended on ${formattedExpiry}. Enter the password to unlock the full version.`
                  : `Demo active (${remainingLabel}, ends ${formattedExpiry}). Enter the password to activate the full version.`}
              </p>
            </div>
          </div>

          {!blocking && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="min-h-[40px] min-w-[40px] -mt-1 -mr-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-3 text-xs text-red-800 dark:text-red-200"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="demo-unlock-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Unlock Password
            </label>
            <div className="relative">
              <input
                id="demo-unlock-password"
                type={showPassword ? 'text' : 'password'}
                autoFocus
                autoComplete="off"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter unlock password"
                className="w-full min-h-[48px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 pl-3.5 pr-12 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1 pb-safe">
            {!blocking && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className={`${
                blocking ? 'w-full' : ''
              } min-h-[48px] px-5 py-2.5 rounded-xl bg-blue-700 text-sm font-semibold text-white hover:bg-blue-800 active:scale-[0.99] transition-all`}
            >
              Unlock Full Version
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
