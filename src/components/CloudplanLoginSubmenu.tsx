import React, { useState } from 'react';
import { AlertCircle, ChevronDown, Eye, EyeOff, Lock, RefreshCw } from 'lucide-react';
import type { StoredCredentials } from '../types/calendar';

interface CloudplanLoginSubmenuProps {
  isSyncing: boolean;
  onSignIn: (creds: StoredCredentials) => Promise<{ ok: boolean; error?: string }>;
}

export const CloudplanLoginSubmenu: React.FC<CloudplanLoginSubmenuProps> = ({
  isSyncing,
  onSignIn,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setFormError('Enter both your AndrewsPlan username and password.');
      return;
    }

    setFormError(null);
    const result = await onSignIn({
      username: trimmedUser,
      password,
      remember,
    });

    if (!result.ok && result.error) {
      setFormError(result.error);
    }
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              AndrewsPlan Login
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Connect your AndrewsPlan schedule
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3"
        >

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-2.5 text-xs text-red-800 dark:text-red-200"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="submenu-cloudplan-username"
              className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Username
            </label>
            <input
              id="submenu-cloudplan-username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="AndrewsPlan username"
              disabled={isSyncing}
              className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="submenu-cloudplan-password"
              className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="submenu-cloudplan-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="AndrewsPlan password"
                disabled={isSyncing}
                className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 pl-3 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2.5 min-h-[36px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              Keep me signed in for 15-min sync
            </span>
          </label>

          <button
            type="submit"
            disabled={isSyncing}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Connecting & parsing…' : 'Connect & Sync AndrewsPlan'}</span>
          </button>
        </form>
      )}
    </section>
  );
};
