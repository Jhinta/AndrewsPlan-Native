import React from 'react';
import {
  Bell,
  BellOff,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Cloud,
  FolderPlus,
  KeyRound,
  LogOut,
  MapPin,
  Moon,
  Navigation,
  RefreshCw,
  Sun,
  UploadCloud,
  User,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import type {
  NotificationLeadMinutes,
  NotificationPermissionState,
} from '../hooks/useEventNotifications';
import type { EventMapProvider, GoogleCalendarInfo, StoredCredentials } from '../types/calendar';
import { formatCountdown, formatSyncedRelative, formatTimeShort } from '../utils/dateUtils';
import type { DemoLicenseStatus } from '../utils/demoLicense';
import { NAV_APP_OPTIONS, type NavAppId } from '../utils/navigationPrefs';
import { CloudplanLoginSubmenu } from './CloudplanLoginSubmenu';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PWAInstallButton } from './PWAInstallButton';

interface AccountPanelProps {
  isCloudplanConnected: boolean;
  username: string;
  calendarName: string;
  eventCount: number;
  cloudplanEventCount: number;
  syncedAt: string | null;
  secondsUntilSync: number;
  isSyncing: boolean;
  isDark: boolean;
  showMapsView: boolean;
  mapProvider: EventMapProvider;
  notificationsEnabled: boolean;
  notificationLeadMinutes: NotificationLeadMinutes;
  notificationPermission: NotificationPermissionState;
  firebaseUser: FirebaseUser | null;
  needsGoogleAuth: boolean;
  calendars: GoogleCalendarInfo[];
  selectedCalendarId: string;
  googleEventsCount: number;
  isGoogleLoading: boolean;
  isMutatingGoogle: boolean;
  isCloudSyncing: boolean;
  cloudError: string | null;
  googleError: string | null;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onSelectCalendar: (id: string) => void;
  onRequestPushToGoogle: () => void;
  onRequestCreateDedicatedCalendar: () => void;
  onOpenNewGoogleEvent: () => void;
  demoStatus: DemoLicenseStatus;
  onOpenUnlockModal: () => void;
  onToggleTheme: () => void;
  onToggleMapsView: () => void;
  onChangeMapProvider: (provider: EventMapProvider) => void;
  onToggleNotifications: () => void;
  onChangeNotificationLeadMinutes: (minutes: NotificationLeadMinutes) => void;
  defaultNavApp: NavAppId | null;
  onChangeDefaultNavApp: (appId: NavAppId | null) => void;
  onManualSync: () => void;
  onCloudplanSignIn: (creds: StoredCredentials) => Promise<{ ok: boolean; error?: string }>;
  onSignOut: () => void;
}

export const AccountPanel: React.FC<AccountPanelProps> = ({
  isCloudplanConnected,
  username,
  calendarName,
  eventCount,
  cloudplanEventCount,
  syncedAt,
  secondsUntilSync,
  isSyncing,
  isDark,
  showMapsView,
  mapProvider,
  notificationsEnabled,
  notificationLeadMinutes,
  notificationPermission,
  firebaseUser,
  needsGoogleAuth,
  calendars,
  selectedCalendarId,
  googleEventsCount,
  isGoogleLoading,
  isMutatingGoogle,
  isCloudSyncing,
  cloudError,
  googleError,
  onGoogleSignIn,
  onGoogleSignOut,
  onSelectCalendar,
  onRequestPushToGoogle,
  onRequestCreateDedicatedCalendar,
  onOpenNewGoogleEvent,
  demoStatus,
  onOpenUnlockModal,
  onToggleTheme,
  onToggleMapsView,
  onChangeMapProvider,
  onToggleNotifications,
  onChangeNotificationLeadMinutes,
  defaultNavApp,
  onChangeDefaultNavApp,
  onManualSync,
  onCloudplanSignIn,
  onSignOut,
}) => {
  const isDemoUser = username.trim().toLowerCase() === 'demo';
  const activeCalendar = calendars.find((c) => c.id === selectedCalendarId);
  const canWriteSelectedCalendar =
    activeCalendar?.accessRole === 'owner' || activeCalendar?.accessRole === 'writer';

  return (
    <div className="space-y-5">
      {/* Sync Schedule & Manual Trigger */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Automatic 15-Minute Sync
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {syncedAt
                ? `Last synced ${formatSyncedRelative(syncedAt)} (${formatTimeShort(syncedAt)})`
                : isCloudplanConnected
                ? 'Waiting for first sync'
                : 'Synced with Google Calendar'}
            </p>
          </div>
          <span className="font-mono tabular-nums text-xs font-medium text-blue-700 dark:text-blue-400">
            {isSyncing || isGoogleLoading ? 'Syncing…' : `Next in ${formatCountdown(secondsUntilSync)}`}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Calendar</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {calendarName}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Loaded Events</p>
            <p className="mt-0.5 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {eventCount}
            </p>
          </div>
        </div>
      </section>

      {/* Google Calendar Integration (Hidden for Demo account) */}
      {!isDemoUser && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Google Calendar
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {!needsGoogleAuth && firebaseUser
                  ? `${firebaseUser.email || firebaseUser.displayName || 'Connected'} · ${googleEventsCount} events`
                  : firebaseUser
                  ? 'Session needs fresh Google authorization to access Calendar'
                  : 'Connect Google Calendar to view, add, or export AndrewsPlan events'}
              </p>
            </div>
            <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          </div>

          {googleError && (
            <p className="text-xs text-red-600 dark:text-red-400 break-words">{googleError}</p>
          )}

        {needsGoogleAuth ? (
          <GoogleSignInButton
            onClick={onGoogleSignIn}
            disabled={isGoogleLoading}
            label={firebaseUser ? 'Re-authorize Google Calendar' : 'Sign in with Google'}
          />
        ) : (
          <div className="space-y-3">
            {calendars.length > 0 && (
              <div>
                <label
                  htmlFor="mobile-gcal-select"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Active Google Calendar
                </label>
                <select
                  id="mobile-gcal-select"
                  value={selectedCalendarId}
                  onChange={(e) => onSelectCalendar(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                >
                  {calendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      {cal.summary} {cal.primary ? '(Primary)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {canWriteSelectedCalendar && (
                <button
                  type="button"
                  onClick={onOpenNewGoogleEvent}
                  disabled={isMutatingGoogle}
                  className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <CalendarPlus className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>New Event</span>
                </button>
              )}

              <button
                type="button"
                onClick={onRequestCreateDedicatedCalendar}
                disabled={isMutatingGoogle}
                className="min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <FolderPlus className="w-4 h-4 text-slate-500" />
                <span>Create AndrewsPlan Cal</span>
              </button>
            </div>

            {isCloudplanConnected && cloudplanEventCount > 0 && canWriteSelectedCalendar && (
              <button
                type="button"
                onClick={onRequestPushToGoogle}
                disabled={isMutatingGoogle}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Push AndrewsPlan Schedule to Google Calendar</span>
              </button>
            )}

            <button
              type="button"
              onClick={onGoogleSignOut}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Disconnect Google account</span>
            </button>
          </div>
        )}
      </section>
      )}

      {/* AndrewsPlan Connection Details or Login Submenu (only when Google Sign-In is active) */}
      {isCloudplanConnected ? (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            AndrewsPlan Account
          </h2>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate font-medium">{username}</span>
            </div>
            {firebaseUser && (
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-xs">
                <Cloud className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {isCloudSyncing
                    ? 'Backing up snapshot to Firestore…'
                    : 'Firestore cloud backup active'}
                </span>
              </div>
            )}
            {cloudError && (
              <p className="text-xs text-red-600 dark:text-red-400 break-words">{cloudError}</p>
            )}
          </div>
        </section>
      ) : (
        !needsGoogleAuth && (
          <CloudplanLoginSubmenu isSyncing={isSyncing} onSignIn={onCloudplanSignIn} />
        )
      )}

      {/* Preferences & Android Installation */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          App & Display
        </h2>

        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full min-h-[48px] flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            {isDark ? <Moon className="w-4 h-4 text-blue-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
            <span>{isDark ? 'Dark appearance' : 'Light appearance'}</span>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Switch to {isDark ? 'Light' : 'Dark'}
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={showMapsView}
          onClick={onToggleMapsView}
          className="w-full min-h-[48px] flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <MapPin
              className={`w-4 h-4 ${
                showMapsView ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
              }`}
            />
            <span>Maps view</span>
          </span>
          <span className="flex items-center gap-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {showMapsView ? 'Enabled' : 'Disabled'}
            </span>
            <span
              aria-hidden="true"
              className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                showMapsView ? 'bg-blue-700 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </span>
          </span>
        </button>

        {showMapsView && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 space-y-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 block">
              Event map provider
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
              {(
                [
                  { id: 'osm', label: 'OpenStreetMap' },
                  { id: 'google', label: 'Google Maps' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeMapProvider(opt.id)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    mapProvider === opt.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={notificationsEnabled}
          onClick={onToggleNotifications}
          className="w-full min-h-[48px] flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            {notificationsEnabled ? (
              <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <BellOff className="w-4 h-4 text-slate-400" />
            )}
            <span>Event notifications</span>
          </span>
          <span className="flex items-center gap-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {notificationsEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <span
              aria-hidden="true"
              className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                notificationsEnabled
                  ? 'bg-blue-700 justify-end'
                  : 'bg-slate-300 dark:bg-slate-700 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </span>
          </span>
        </button>

        {notificationsEnabled && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 px-3.5 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Remind before event
              </span>
              <span className="text-[11px] text-slate-400">
                {notificationPermission === 'granted'
                  ? 'Browser & in-app'
                  : 'In-app alerts'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {([0, 10, 15, 30] as const).map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => onChangeNotificationLeadMinutes(mins)}
                  className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                    notificationLeadMinutes === mins
                      ? 'bg-blue-700 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {mins === 0 ? 'At start' : `${mins}m`}
                </button>
              ))}
            </div>
            {notificationPermission === 'denied' && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Browser notifications are blocked; in-app reminders will still appear.
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2">
          <label
            htmlFor="mobile-default-nav-select"
            className="flex items-center justify-between gap-2 text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            <span className="flex items-center gap-2.5">
              <Navigation
                className={`w-4 h-4 ${
                  defaultNavApp ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                }`}
              />
              <span>Default navigation app</span>
            </span>
          </label>
          <select
            id="mobile-default-nav-select"
            value={defaultNavApp ?? ''}
            onChange={(e) =>
              onChangeDefaultNavApp(e.target.value ? (e.target.value as NavAppId) : null)
            }
            className="w-full min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            <option value="">Ask every time</option>
            {NAV_APP_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>

        <PWAInstallButton variant="full" />

        {demoStatus.isUnlocked ? (
          <div className="min-h-[44px] flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Full version unlocked</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenUnlockModal}
            className="w-full min-h-[48px] flex items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-2.5 text-sm font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span className="truncate">Demo · {demoStatus.remainingLabel}</span>
            </span>
            <span className="text-xs font-semibold shrink-0">Unlock</span>
          </button>
        )}

        {isCloudplanConnected && (
          <button
            type="button"
            onClick={onSignOut}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 px-4 py-2.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100/80 dark:hover:bg-red-950/60 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out of AndrewsPlan</span>
          </button>
        )}
      </section>
    </div>
  );
};
