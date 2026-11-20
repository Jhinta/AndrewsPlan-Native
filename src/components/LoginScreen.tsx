import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, RefreshCw, AlertCircle } from 'lucide-react';
import type { StoredCredentials } from '../types/calendar';
import type { DemoLicenseStatus } from '../utils/demoLicense';
import { ConfirmActionModal } from './ConfirmActionModal';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginScreenProps {
  isSyncing: boolean;
  isGoogleLoading: boolean;
  initialError: string | null;
  googleError: string | null;
  demoStatus: DemoLicenseStatus;
  onOpenUnlockModal: () => void;
  onSignIn: (creds: StoredCredentials) => Promise<{ ok: boolean; error?: string }>;
  onGoogleSignIn: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  isSyncing,
  isGoogleLoading,
  initialError,
  googleError,
  demoStatus,
  onOpenUnlockModal,
  onSignIn,
  onGoogleSignIn,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [formError, setFormError] = useState<string | null>(initialError);
  const [showGoogleWarning, setShowGoogleWarning] = useState(false);

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
    <div className="min-h-screen flex flex-col justify-center px-4 pt-safe-page pb-safe bg-[#F7F8FA] dark:bg-slate-950">
      <div className="w-full max-w-4xl mx-auto py-4 sm:px-2 lg:px-4 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left: Product Overview */}
        <div className="lg:col-span-6 space-y-5">
          <div className="inline-flex items-center gap-3">
            <img
              src="/pwa-192x192.png"
              alt="AndrewsPlan app icon"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-2xl shadow-sm object-cover shrink-0"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                AndrewsPlan
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AndrewsPlan & Google Calendar Schedule
              </p>
            </div>
          </div>

          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-md">
            Connect to your AndrewsPlan schedule, Google Calendar, or both in one scrollable agenda. Syncs automatically every 15 minutes with manual refresh anytime.
          </p>


          <div className="pt-1">
            <PWAInstallButton variant="compact" />
          </div>
        </div>

        {/* Right: Sign-In Form + Google Calendar Option */}
        <div className="lg:col-span-6 space-y-4">
          {!demoStatus.isUnlocked && (
            <div className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  7-Day Demo · <span className="font-mono tabular-nums">{demoStatus.remainingLabel}</span>
                </p>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80">
                  Enter the unlock password anytime to activate the full version.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenUnlockModal}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Unlock</span>
              </button>
            </div>
          )}

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Sign in to AndrewsPlan
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  HTTP Basic authentication over HTTPS
                </p>
              </div>
              <Lock className="w-5 h-5 text-slate-400 shrink-0" />
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-5">
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-3.5 text-sm text-red-800 dark:text-red-200"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="cloudplan-username"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Username
                </label>
                <input
                  id="cloudplan-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your AndrewsPlan username"
                  disabled={isSyncing}
                  className="w-full min-h-[48px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 px-3.5 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="cloudplan-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="cloudplan-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isSyncing}
                    className="w-full min-h-[48px] rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 pl-3.5 pr-12 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:opacity-60"
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

              <label className="flex items-center gap-3 min-h-[44px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  Keep me signed in on this device for 15-min background sync
                </span>
              </label>

              <button
                type="submit"
                disabled={isSyncing}
                className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Connecting & parsing schedule…' : 'Connect & Sync Schedule'}</span>
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center">
                Or connect Google Calendar directly
              </p>
              {googleError && (
                <p className="text-xs text-red-600 dark:text-red-400 text-center">{googleError}</p>
              )}
              <GoogleSignInButton
                onClick={() => setShowGoogleWarning(true)}
                disabled={isGoogleLoading}
                label={isGoogleLoading ? 'Connecting Google Calendar…' : 'Sign in with Google'}
              />
              <p className="text-xs text-amber-800 dark:text-amber-300/90 text-center leading-relaxed">
                This does not sign in to AndrewsPlan — only your Google agenda will be active.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmActionModal
        isOpen={showGoogleWarning}
        title="Sign in with Google only?"
        description="This will not sign you in to AndrewsPlan. Only your Google agenda will be active until you also sign in with your AndrewsPlan username and password."
        confirmLabel="Continue with Google"
        isBusy={isGoogleLoading}
        onConfirm={() => {
          setShowGoogleWarning(false);
          onGoogleSignIn();
        }}
        onCancel={() => setShowGoogleWarning(false)}
      />
    </div>
  );
};
