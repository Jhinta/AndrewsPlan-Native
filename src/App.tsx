import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  BellOff,
  Calendar,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FolderPlus,
  KeyRound,
  MapPin,
  Moon,
  Navigation,
  RefreshCw,
  Search,
  Sun,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import { AccountPanel } from './components/AccountPanel';
import { ChangelogModal } from './components/ChangelogModal';
import { CloudplanLoginSubmenu } from './components/CloudplanLoginSubmenu';
import { ConfirmActionModal } from './components/ConfirmActionModal';
import { CreateGoogleEventModal } from './components/CreateGoogleEventModal';
import { DemoUnlockModal } from './components/DemoUnlockModal';
import { EventDetailSheet } from './components/EventDetailSheet';
import { EventRow } from './components/EventRow';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { LoginScreen } from './components/LoginScreen';
import { MonthlyCalendarView } from './components/MonthlyCalendarView';
import { NavigationChooserModal } from './components/NavigationChooserModal';
import { OfflineBanner, PWAInstallButton } from './components/PWAInstallButton';
import { SummaryView } from './components/SummaryView';
import { useCloudplanSync } from './hooks/useCloudplanSync';
import { useEventNotifications } from './hooks/useEventNotifications';
import { useFirebaseSync } from './hooks/useFirebaseSync';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import { useStatusBar } from './hooks/useStatusBar';
import type { CreateGoogleEventInput } from './services/googleCalendar';
import type {
  CalendarEvent,
  DesktopView,
  EventMapProvider,
  MobileTab,
  ScheduleFilter,
  SourceFilter,
} from './types/calendar';
import {
  eventStartsOrContinuesFromToday,
  eventTouchesRange,
  formatCountdown,
  formatDayHeading,
  formatSyncedRelative,
  formatTimeShort,
  groupEventsByDay,
  toLocalDateKey,
} from './utils/dateUtils';
import {
  NAV_APP_OPTIONS,
  getSavedDefaultNavApp,
  openNavigationWithApp,
  saveDefaultNavApp,
  type NavAppId,
} from './utils/navigationPrefs';
import { clearAndroidAutoSchedule, syncScheduleToAndroidAuto } from './utils/androidAutoBridge';
import { getDemoLicenseStatus, unlockFullVersion } from './utils/demoLicense';
import { getEventCategories } from './utils/summaryUtils';

const THEME_STORAGE_KEY = 'cloudplan_theme_v1';
const MAPS_VIEW_STORAGE_KEY = 'andrewsplan_maps_view_v1';
const MAP_PROVIDER_STORAGE_KEY = 'andrewsplan_map_provider_v1';

type PendingConfirmAction =
  | { type: 'push_cloudplan' }
  | { type: 'create_calendar' }
  | { type: 'create_event'; input: CreateGoogleEventInput }
  | { type: 'delete_event'; event: CalendarEvent };

export default function App() {
  const {
    isAuthenticated: isCloudplanAuthenticated,
    credentials,
    schedule,
    isSyncing,
    error,
    authError,
    syncDiffSummary,
    dismissSyncDiffSummary,
    secondsUntilSync,
    signInAndSync,
    manualSync,
    signOut,
  } = useCloudplanSync();

  const {
    googleUser,
    needsGoogleAuth,
    calendars,
    activeCalendar,
    selectedCalendarId,
    googleEvents,
    isGoogleLoading,
    isMutatingGoogle,
    googleError,
    googleNotice,
    clearGoogleNotice,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    selectCalendar,
    refreshGoogleCalendar,
    pushToGoogleCalendar,
    createDedicatedCalendar,
    createEvent,
    deleteEvent,
  } = useGoogleCalendar();

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  const [showMapsView, setShowMapsView] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MAPS_VIEW_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const [mapProvider, setMapProvider] = useState<EventMapProvider>(() => {
    try {
      const stored = localStorage.getItem(MAP_PROVIDER_STORAGE_KEY);
      if (stored === 'google') {
        localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, 'osm');
      }
      return 'osm';
    } catch {
      return 'osm';
    }
  });

  const [filter, setFilter] = useState<ScheduleFilter>('today');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [mobileTab, setMobileTab] = useState<MobileTab>('upcoming');
  const [desktopView, setDesktopView] = useState<DesktopView>('schedule');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonthDateKey, setSelectedMonthDateKey] = useState<string>(() =>
    toLocalDateKey(new Date())
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [navigationLocation, setNavigationLocation] = useState<string | null>(null);
  const [defaultNavApp, setDefaultNavApp] = useState<NavAppId | null>(() =>
    getSavedDefaultNavApp()
  );
  const [isNewEventOpen, setIsNewEventOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [licenseRevision, setLicenseRevision] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmAction | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullSyncing, setIsPullSyncing] = useState(false);
  const [appRootEl, setAppRootEl] = useState<HTMLDivElement | null>(null);
  const pullDistanceRef = useRef(0);
  const isPullSyncingRef = useRef(false);
  const pullStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const syncStateRef = useRef({ isBusy: false, hasOverlay: false });
  const dayRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const demoStatus = useMemo(
    () => getDemoLicenseStatus(nowMs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nowMs, licenseRevision]
  );

  const handleUnlockDemo = useCallback((password: string): boolean => {
    const ok = unlockFullVersion(password);
    if (ok) {
      setLicenseRevision((prev) => prev + 1);
      setIsUnlockModalOpen(false);
    }
    return ok;
  }, []);

  const handleSaveDefaultNavApp = useCallback((appId: NavAppId | null) => {
    setDefaultNavApp(appId);
    saveDefaultNavApp(appId);
  }, []);

  const handleRequestNavigate = useCallback(
    (location: string) => {
      if (defaultNavApp) {
        openNavigationWithApp(defaultNavApp, location);
        return;
      }
      setNavigationLocation(location);
    },
    [defaultNavApp]
  );

  const handleCloseEventDetail = useCallback(() => setSelectedEvent(null), []);
  const handleCloseNavigationChooser = useCallback(() => setNavigationLocation(null), []);

  const {
    firebaseUser,
    cloudProfile,
    cloudEvents,
    isCloudSyncing,
    cloudError,
    syncTheme,
  } = useFirebaseSync(schedule, credentials?.username ?? null, isDark ? 'dark' : 'light');

  // Synchronize mobile & tablet status bar: keep full-screen while ensuring icons contrast and UI fits
  useStatusBar(isDark);

  const CURRENT_APP_VERSION = '2.0';
  const [isChangelogOpen, setIsChangelogOpen] = useState(() => {
    try {
      const stored = localStorage.getItem('andrewsplan_installed_version');
      return stored !== CURRENT_APP_VERSION;
    } catch {
      return false;
    }
  });

  const handleCloseChangelog = useCallback(() => {
    setIsChangelogOpen(false);
    try {
      localStorage.setItem('andrewsplan_installed_version', CURRENT_APP_VERSION);
    } catch {
      // Ignore
    }
  }, []);

  const handleToggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      void syncTheme(next ? 'dark' : 'light');
      return next;
    });
  };

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(MAPS_VIEW_STORAGE_KEY, showMapsView ? 'true' : 'false');
    } catch {
      // Ignore storage errors
    }
  }, [showMapsView]);

  useEffect(() => {
    try {
      localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, mapProvider);
    } catch {
      // Ignore storage errors
    }
  }, [mapProvider]);

  const isAnySessionActive = isCloudplanAuthenticated || !needsGoogleAuth;
  const wasSessionActiveRef = useRef(isAnySessionActive);
  useEffect(() => {
    if (!wasSessionActiveRef.current && isAnySessionActive) {
      setFilter('today');
      setMobileTab('upcoming');
      setDesktopView('schedule');
      window.scrollTo({ top: 0 });
    }
    wasSessionActiveRef.current = isAnySessionActive;
  }, [isAnySessionActive]);

  const handleToggleMapsView = useCallback(() => {
    setShowMapsView((prev) => !prev);
  }, []);

  // Keep relative timestamps & "In progress" indicator fresh every 30s
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  // Also refresh Google Calendar whenever Cloudplan completes a 15-min auto-sync
  const lastCloudplanSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (!schedule?.syncedAt) return;
    if (lastCloudplanSyncRef.current && lastCloudplanSyncRef.current !== schedule.syncedAt) {
      if (!needsGoogleAuth) {
        void refreshGoogleCalendar();
      }
    }
    lastCloudplanSyncRef.current = schedule.syncedAt;
  }, [schedule?.syncedAt, needsGoogleAuth, refreshGoogleCalendar]);

  const handleCombinedSync = useCallback(
    async (source: 'manual' | 'pull' = 'manual') => {
      const tasks: Promise<unknown>[] = [];
      if (isCloudplanAuthenticated) {
        tasks.push(manualSync(source));
      }
      if (!needsGoogleAuth) {
        tasks.push(refreshGoogleCalendar());
      }
      await Promise.all(tasks);
    },
    [isCloudplanAuthenticated, needsGoogleAuth, manualSync, refreshGoogleCalendar]
  );

  const cloudplanEvents = useMemo(
    () =>
      (schedule?.events ?? cloudEvents ?? []).map((ev) => ({
        ...ev,
        source: 'cloudplan' as const,
      })),
    [schedule?.events, cloudEvents]
  );

  const combinedEvents = useMemo(() => {
    const merged: CalendarEvent[] = [];
    if (sourceFilter !== 'google' && isCloudplanAuthenticated) {
      merged.push(...cloudplanEvents);
    }
    if (sourceFilter !== 'cloudplan' && !needsGoogleAuth) {
      merged.push(...googleEvents);
    }
    if (!isCloudplanAuthenticated && !needsGoogleAuth && sourceFilter === 'google') {
      return googleEvents;
    }
    return merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [
    sourceFilter,
    isCloudplanAuthenticated,
    needsGoogleAuth,
    cloudplanEvents,
    googleEvents,
  ]);

  useEffect(() => {
    const hasSession = isCloudplanAuthenticated || !needsGoogleAuth;
    if (!hasSession) {
      void clearAndroidAutoSchedule();
      return;
    }
    const activeCalName = isCloudplanAuthenticated
      ? schedule?.calendarName || cloudProfile?.calendarName || 'AndrewsPlan Schedule'
      : activeCalendar?.summary || 'Google Calendar';
    void syncScheduleToAndroidAuto({
      events: combinedEvents,
      calendarName: activeCalName,
      syncedAt: schedule?.syncedAt ?? null,
      credentials,
    });
  }, [
    isCloudplanAuthenticated,
    needsGoogleAuth,
    combinedEvents,
    schedule?.calendarName,
    schedule?.syncedAt,
    cloudProfile?.calendarName,
    activeCalendar?.summary,
    credentials,
  ]);

  const {
    notificationsEnabled,
    leadMinutes: notificationLeadMinutes,
    permission: notificationPermission,
    activeReminders,
    toggleNotifications,
    setLeadMinutes: setNotificationLeadMinutes,
    dismissReminder,
  } = useEventNotifications(combinedEvents, setSelectedEvent);

  const monthlyCalendarEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return combinedEvents.filter((ev) => {
      if (selectedCategory) {
        const cats = getEventCategories(ev);
        if (!cats.includes(selectedCategory)) return false;
      }

      if (query) {
        const cats = Array.isArray(ev.categories) ? ev.categories.join(' ') : '';
        const haystack = `${ev.summary ?? ''} ${ev.location ?? ''} ${ev.description ?? ''} ${ev.organizer ?? ''} ${ev.calendarTitle ?? ''} ${cats}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [combinedEvents, selectedCategory, searchQuery]);

  const filteredEvents = useMemo(() => {
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

    return monthlyCalendarEvents.filter((ev) => {
      if (filter === 'upcoming' && !eventStartsOrContinuesFromToday(ev, startOfToday)) {
        return false;
      }
      if (filter === 'today' && !eventTouchesRange(ev, startOfToday, endOfToday)) {
        return false;
      }
      return true;
    });
  }, [monthlyCalendarEvents, filter, nowMs]);

  const dayGroups = useMemo(() => {
    const minDateKey =
      filter === 'upcoming' || filter === 'today' ? toLocalDateKey(new Date(nowMs)) : undefined;
    return groupEventsByDay(filteredEvents, minDateKey);
  }, [filteredEvents, filter, nowMs]);

  const isMonthlyAgendaView = filter === 'upcoming';

  const jumpToDay = (dateKey: string) => {
    if (isMonthlyAgendaView) {
      setSelectedMonthDateKey(dateKey);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = dayRefs.current[dateKey];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const switchMobileTab = useCallback((nextTab: MobileTab) => {
    setMobileTab(nextTab);
    if (nextTab === 'agenda') {
      setFilter('upcoming');
    } else if (nextTab === 'upcoming') {
      setFilter('today');
    }
    window.scrollTo({ top: 0 });
  }, []);

  const PULL_TRIGGER_THRESHOLD = 42;
  const PULL_MAX_OFFSET = 76;

  const hasOpenOverlay = Boolean(
    selectedEvent ||
      isNewEventOpen ||
      isUnlockModalOpen ||
      pendingConfirm ||
      navigationLocation
  );

  syncStateRef.current = {
    isBusy: isSyncing || isGoogleLoading,
    hasOverlay: hasOpenOverlay,
  };

  const getPageScrollTop = (): number =>
    Math.max(
      window.scrollY || 0,
      document.documentElement?.scrollTop || 0,
      document.body?.scrollTop || 0
    );

  const updatePullDistance = useCallback((next: number) => {
    pullDistanceRef.current = next;
    setPullDistance(next);
  }, []);

  const triggerPullSync = useCallback(async () => {
    if (isPullSyncingRef.current || syncStateRef.current.isBusy) return;
    isPullSyncingRef.current = true;
    setIsPullSyncing(true);
    try {
      await handleCombinedSync('pull');
    } finally {
      isPullSyncingRef.current = false;
      setIsPullSyncing(false);
    }
  }, [handleCombinedSync]);

  const isSwipeBlockedElement = (target: EventTarget | null, root: HTMLElement): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('input, textarea, select, [data-no-swipe], .gm-style')) {
      return true;
    }
    let node: HTMLElement | null = target;
    while (node && node !== root) {
      if (node.scrollWidth > node.clientWidth + 4) {
        const overflowX = window.getComputedStyle(node).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') {
          return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  };

  const isPullBlockedElement = (target: EventTarget | null, root: HTMLElement): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('input, textarea, select, [data-no-pull], .gm-style')) {
      return true;
    }
    let node: HTMLElement | null = target;
    while (node && node !== root) {
      if (node.scrollHeight > node.clientHeight + 2 && node.scrollTop > 2) {
        const overflowY = window.getComputedStyle(node).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  };

  useEffect(() => {
    if (!appRootEl) return;

    const handleNativeTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || syncStateRef.current.hasOverlay) {
        pullStartRef.current = null;
        swipeStartRef.current = null;
        if (pullDistanceRef.current !== 0) updatePullDistance(0);
        return;
      }

      const touch = e.touches[0];
      let isHorizontalGesture = false;

      if (swipeStartRef.current) {
        const dx = touch.clientX - swipeStartRef.current.x;
        const dy = touch.clientY - swipeStartRef.current.y;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          isHorizontalGesture = true;
          pullStartRef.current = null;
          if (pullDistanceRef.current !== 0) updatePullDistance(0);
        }
      }

      if (isHorizontalGesture || syncStateRef.current.isBusy || isPullSyncingRef.current) {
        return;
      }

      const scrollTop = getPageScrollTop();

      if (pullStartRef.current === null) {
        if (scrollTop <= 2 && !isPullBlockedElement(e.target, appRootEl)) {
          pullStartRef.current = { x: touch.clientX, y: touch.clientY };
        }
        return;
      }

      const dy = touch.clientY - pullStartRef.current.y;
      const dx = touch.clientX - pullStartRef.current.x;

      if (dy > 6 && dy > Math.abs(dx) && scrollTop <= 6) {
        if (e.cancelable) {
          e.preventDefault();
        }
        const nextDistance = Math.min(PULL_MAX_OFFSET, (dy - 6) * 0.55);
        updatePullDistance(nextDistance);
        if (nextDistance >= 12) {
          swipeStartRef.current = null;
        }
      } else if (dy <= 0 || scrollTop > 6) {
        if (pullDistanceRef.current !== 0) updatePullDistance(0);
      }
    };

    appRootEl.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    return () => {
      appRootEl.removeEventListener('touchmove', handleNativeTouchMove);
    };
  }, [appRootEl, updatePullDistance]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1 || hasOpenOverlay) {
      pullStartRef.current = null;
      swipeStartRef.current = null;
      updatePullDistance(0);
      return;
    }

    const touch = e.touches[0];
    pullStartRef.current =
      getPageScrollTop() <= 6 && !isPullBlockedElement(e.target, e.currentTarget)
        ? { x: touch.clientX, y: touch.clientY }
        : null;
    swipeStartRef.current = isSwipeBlockedElement(e.target, e.currentTarget)
      ? null
      : { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (
      pullDistanceRef.current >= PULL_TRIGGER_THRESHOLD &&
      !syncStateRef.current.isBusy &&
      !isPullSyncingRef.current
    ) {
      void triggerPullSync();
    }

    const start = swipeStartRef.current;
    swipeStartRef.current = null;

    if (start && !hasOpenOverlay && e.changedTouches.length === 1) {
      const endTouch = e.changedTouches[0];
      const dx = endTouch.clientX - start.x;
      const dy = endTouch.clientY - start.y;
      const elapsed = Date.now() - start.time;

      if (
        elapsed <= 650 &&
        Math.abs(dx) >= 60 &&
        Math.abs(dy) <= 65 &&
        Math.abs(dx) > Math.abs(dy) * 1.5
      ) {
        // Swipe left (dx < 0) moves to next menu; swipe right (dx > 0) moves to previous menu
        const direction = dx < 0 ? 1 : -1;
        if (window.innerWidth < 1024) {
          const mobileOrder: MobileTab[] = ['upcoming', 'agenda', 'summary', 'account'];
          const currentIdx = mobileOrder.indexOf(mobileTab);
          const nextIdx = currentIdx + direction;
          if (nextIdx >= 0 && nextIdx < mobileOrder.length) {
            switchMobileTab(mobileOrder[nextIdx]);
          }
        } else {
          const desktopOrder: Array<{ view: DesktopView; filter?: ScheduleFilter }> = [
            { view: 'schedule', filter: 'today' },
            { view: 'schedule', filter: 'upcoming' },
            { view: 'schedule', filter: 'all' },
            { view: 'summary' },
          ];
          const currentIdx =
            desktopView === 'summary'
              ? 3
              : filter === 'today'
              ? 0
              : filter === 'all'
              ? 2
              : 1;
          const nextIdx = currentIdx + direction;
          if (nextIdx >= 0 && nextIdx < desktopOrder.length) {
            const target = desktopOrder[nextIdx];
            setDesktopView(target.view);
            if (target.filter) setFilter(target.filter);
            window.scrollTo({ top: 0 });
          }
        }
      }
    }

    pullStartRef.current = null;
    updatePullDistance(0);
  };

  const handleTouchCancel = () => {
    if (
      pullDistanceRef.current >= PULL_TRIGGER_THRESHOLD &&
      !syncStateRef.current.isBusy &&
      !isPullSyncingRef.current
    ) {
      void triggerPullSync();
    }
    pullStartRef.current = null;
    swipeStartRef.current = null;
    updatePullDistance(0);
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm) return;

    if (pendingConfirm.type === 'push_cloudplan') {
      await pushToGoogleCalendar(cloudplanEvents);
    } else if (pendingConfirm.type === 'create_calendar') {
      await createDedicatedCalendar();
    } else if (pendingConfirm.type === 'create_event') {
      const created = await createEvent(pendingConfirm.input);
      if (created) {
        setIsNewEventOpen(false);
      }
    } else if (pendingConfirm.type === 'delete_event') {
      const ev = pendingConfirm.event;
      if (ev.calendarId && ev.googleEventId) {
        const removed = await deleteEvent(ev.calendarId, ev.googleEventId, ev.summary);
        if (removed) {
          setSelectedEvent(null);
        }
      }
    }

    setPendingConfirm(null);
  };

  if (demoStatus.isExpired) {
    return (
      <>
        <OfflineBanner />
        <DemoUnlockModal
          isOpen
          blocking
          expiresAtMs={demoStatus.expiresAtMs}
          remainingLabel={demoStatus.remainingLabel}
          onUnlock={handleUnlockDemo}
        />
      </>
    );
  }

  if (!isAnySessionActive) {
    return (
      <>
        <OfflineBanner />
        <LoginScreen
          isSyncing={isSyncing}
          isGoogleLoading={isGoogleLoading}
          initialError={authError}
          googleError={googleError}
          demoStatus={demoStatus}
          onOpenUnlockModal={() => setIsUnlockModalOpen(true)}
          onSignIn={signInAndSync}
          onGoogleSignIn={() => void connectGoogleCalendar()}
        />
        <DemoUnlockModal
          isOpen={isUnlockModalOpen}
          blocking={false}
          expiresAtMs={demoStatus.expiresAtMs}
          remainingLabel={demoStatus.remainingLabel}
          onUnlock={handleUnlockDemo}
          onClose={() => setIsUnlockModalOpen(false)}
        />
      </>
    );
  }

  const todayKey = toLocalDateKey(new Date(nowMs));
  const activeError = authError || error || googleError;
  const calendarName = isCloudplanAuthenticated
    ? schedule?.calendarName || cloudProfile?.calendarName || 'AndrewsPlan Schedule'
    : activeCalendar?.summary || 'Google Calendar';
  const totalEventCount = combinedEvents.length;
  const isBusySync = isSyncing || isGoogleLoading;
  const isScheduleParsing = isCloudplanAuthenticated && schedule === null;
  const isLoadingSchedule = isBusySync || isScheduleParsing;
  const canWriteSelectedCalendar =
    activeCalendar?.accessRole === 'owner' || activeCalendar?.accessRole === 'writer';

  const confirmDialogConfig = (() => {
    if (!pendingConfirm) return null;
    const calName = activeCalendar?.summary || 'Primary Calendar';
    switch (pendingConfirm.type) {
      case 'push_cloudplan': {
        const count = cloudplanEvents.filter(
          (ev) => new Date(ev.end).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000
        ).slice(0, 100).length;
        return {
          title: 'Sync AndrewsPlan events to Google Calendar?',
          description: `This will add or update up to ${count} AndrewsPlan event(s) in "${calName}". Existing synced events will be updated in place.`,
          confirmLabel: 'Sync to Google Calendar',
          destructive: false,
        };
      }
      case 'create_calendar':
        return {
          title: 'Create "AndrewsPlan Schedule" calendar?',
          description:
            'This will create a new secondary Google Calendar named "AndrewsPlan Schedule" in your Google account.',
          confirmLabel: 'Create Calendar',
          destructive: false,
        };
      case 'create_event':
        return {
          title: `Add "${pendingConfirm.input.summary}" to Google Calendar?`,
          description: `This will create a new event on ${pendingConfirm.input.date} in "${calName}".`,
          confirmLabel: 'Add Event',
          destructive: false,
        };
      case 'delete_event':
        return {
          title: 'Delete Google Calendar event?',
          description: `Are you sure you want to permanently delete "${pendingConfirm.event.summary}" from "${
            pendingConfirm.event.calendarTitle || calName
          }"? This action cannot be undone.`,
          confirmLabel: 'Delete Event',
          destructive: true,
        };
    }
  })();

  return (
    <div
      ref={setAppRootEl}
      className="min-h-screen flex flex-col bg-[#F7F8FA] dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Desktop Top Navigation Bar (hidden on mobile; top AndrewsPlan and Sync now removed) */}
      <header className="hidden lg:block sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="max-w-6xl mx-auto h-14 px-6 flex items-center justify-between gap-8">
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => {
                setDesktopView('schedule');
                setFilter('today');
              }}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                desktopView === 'schedule' && filter === 'today'
                  ? 'border-blue-700 text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setDesktopView('schedule');
                setFilter('upcoming');
              }}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                desktopView === 'schedule' && filter === 'upcoming'
                  ? 'border-blue-700 text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Agenda
            </button>
            <button
              type="button"
              onClick={() => {
                setDesktopView('schedule');
                setFilter('all');
              }}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                desktopView === 'schedule' && filter === 'all'
                  ? 'border-blue-700 text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Events
            </button>
            <button
              type="button"
              onClick={() => setDesktopView('summary')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                desktopView === 'summary'
                  ? 'border-blue-700 text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Summary
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {gmpQuotaExceeded && (
          <div className="bg-amber-50 dark:bg-amber-950/70 border-t border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs md:text-sm text-center shadow-xs">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 dark:text-amber-100 hover:text-amber-800 dark:hover:text-amber-200"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}
      </header>

      {/* Mobile Status-Bar Safe Area Shield (prevents scrolled content from showing behind system icons) */}
      <div
        aria-hidden="true"
        className="lg:hidden fixed top-0 left-0 right-0 z-30 h-safe-top bg-[#F7F8FA]/95 dark:bg-slate-950/95 backdrop-blur-md pointer-events-none"
      />

      {/* Mobile Top Alerts */}
      <div className="lg:hidden">
        <OfflineBanner />
        {gmpQuotaExceeded && (
          <div className="bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs text-center pt-safe shadow-xs">
            <div className="px-4 py-2">
              <span>
                Google Maps Platform quota reached. If you are the app owner, visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-amber-950 dark:text-amber-100 hover:text-amber-800 dark:hover:text-amber-200"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Offline Banner */}
      <div className="hidden lg:block">
        <OfflineBanner />
      </div>

      {(pullDistance > 6 || isPullSyncing) && (
        <div
          className="flex items-center justify-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-400 overflow-hidden transition-[height] duration-150 pt-safe lg:pt-0"
          style={{
            height: `calc(${isPullSyncing ? 44 : pullDistance}px + max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), var(--safe-area-top-dynamic, 0px)))`,
          }}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              isPullSyncing || pullDistance >= PULL_TRIGGER_THRESHOLD ? 'animate-spin' : ''
            }`}
          />
          <span>
            {isPullSyncing
              ? 'Syncing schedule…'
              : pullDistance >= PULL_TRIGGER_THRESHOLD
              ? 'Release to sync'
              : 'Pull down to sync'}
          </span>
        </div>
      )}

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-safe-page lg:pt-5 pb-24 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 lg:gap-8 items-start">
          {/* Desktop Left Rail */}
          <aside className="hidden lg:block sticky top-20 space-y-5">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Connected Schedule
                </p>
                <h1 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                  {calendarName}
                </h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                  {credentials?.username || googleUser?.email || 'Active'} · {totalEventCount} events
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Last synced</span>
                  <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                    {schedule?.syncedAt
                      ? `${formatSyncedRelative(schedule.syncedAt, nowMs)} (${formatTimeShort(schedule.syncedAt)})`
                      : 'Active'}
                  </span>
                </div>
                {isCloudplanAuthenticated && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Auto-sync (15m)</span>
                    <span className="font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">
                      {isBusySync ? 'Syncing…' : formatCountdown(secondsUntilSync)}
                    </span>
                  </div>
                )}
              </div>

              <PWAInstallButton variant="full" />

              <button
                type="button"
                role="switch"
                aria-checked={showMapsView}
                onClick={handleToggleMapsView}
                className="w-full min-h-[40px] flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <MapPin
                    className={`w-3.5 h-3.5 ${
                      showMapsView ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                    }`}
                  />
                  <span>Maps view</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                    showMapsView ? 'bg-blue-700 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                </span>
              </button>

              {showMapsView && (
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
                      onClick={() => setMapProvider(opt.id)}
                      className={`min-h-[34px] px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        mapProvider === opt.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                onClick={toggleNotifications}
                className="w-full min-h-[40px] flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {notificationsEnabled ? (
                    <Bell className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>Event notifications</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                    notificationsEnabled
                      ? 'bg-blue-700 justify-end'
                      : 'bg-slate-300 dark:bg-slate-700 justify-start'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                </span>
              </button>

              {notificationsEnabled && (
                <div className="grid grid-cols-4 gap-1">
                  {([0, 10, 15, 30] as const).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setNotificationLeadMinutes(mins)}
                      className={`min-h-[30px] rounded-lg text-[11px] font-medium transition-colors ${
                        notificationLeadMinutes === mins
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {mins === 0 ? 'Now' : `${mins}m`}
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-1 space-y-1.5">
                <label
                  htmlFor="desktop-default-nav-select"
                  className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"
                >
                  <Navigation
                    className={`w-3.5 h-3.5 ${
                      defaultNavApp ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                    }`}
                  />
                  <span>Default navigation app</span>
                </label>
                <select
                  id="desktop-default-nav-select"
                  value={defaultNavApp ?? ''}
                  onChange={(e) =>
                    handleSaveDefaultNavApp(
                      e.target.value ? (e.target.value as NavAppId) : null
                    )
                  }
                  className="w-full min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 text-xs font-medium text-slate-800 dark:text-slate-200"
                >
                  <option value="">Ask every time</option>
                  {NAV_APP_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Desktop Google Calendar Controls */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Google Calendar
                </span>
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              {needsGoogleAuth ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {googleUser
                      ? 'Re-authorize Google Calendar access for this session.'
                      : 'View Google Calendar events or push your AndrewsPlan schedule.'}
                  </p>
                  <GoogleSignInButton
                    onClick={() => void connectGoogleCalendar()}
                    disabled={isGoogleLoading}
                    label={googleUser ? 'Re-authorize Google' : 'Sign in with Google'}
                  />
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {googleUser?.email || 'Connected'} · {googleEvents.length} events
                  </p>

                  {calendars.length > 0 && (
                    <select
                      aria-label="Select Google Calendar"
                      value={selectedCalendarId}
                      onChange={(e) => selectCalendar(e.target.value)}
                      className="w-full min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 text-xs text-slate-900 dark:text-slate-100"
                    >
                      {calendars.map((cal) => (
                        <option key={cal.id} value={cal.id}>
                          {cal.summary} {cal.primary ? '(Primary)' : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  {canWriteSelectedCalendar && (
                    <button
                      type="button"
                      onClick={() => setIsNewEventOpen(true)}
                      disabled={isMutatingGoogle}
                      className="w-full min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                      <span>New Google Event</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setPendingConfirm({ type: 'create_calendar' })}
                    disabled={isMutatingGoogle}
                    className="w-full min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-slate-400" />
                    <span>Create AndrewsPlan Cal</span>
                  </button>

                  {isCloudplanAuthenticated && cloudplanEvents.length > 0 && canWriteSelectedCalendar && (
                    <button
                      type="button"
                      onClick={() => setPendingConfirm({ type: 'push_cloudplan' })}
                      disabled={isMutatingGoogle}
                      className="w-full min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-1.5 text-xs font-semibold hover:opacity-90"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Push to Google Calendar</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void disconnectGoogleCalendar()}
                    className="w-full min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  >
                    Disconnect Google
                  </button>
                </div>
              )}

              {isCloudSyncing && (
                <p className="text-[11px] text-slate-400">Backing up snapshot to Firestore…</p>
              )}
              {cloudError && (
                <p className="text-[11px] text-red-600 dark:text-red-400 break-words">{cloudError}</p>
              )}
            </div>

            {!isCloudplanAuthenticated && !needsGoogleAuth && (
              <CloudplanLoginSubmenu isSyncing={isSyncing} onSignIn={signInAndSync} />
            )}

            {/* Day Jump Index */}
            {dayGroups.length > 0 && (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                <p className="px-2 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Jump to day
                </p>
                <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                  {dayGroups.slice(0, 14).map(({ dateKey, events }) => {
                    const heading = formatDayHeading(dateKey, new Date(nowMs));
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => jumpToDay(dateKey)}
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                      >
                        <span
                          className={`truncate ${
                            heading.isToday
                              ? 'font-semibold text-blue-700 dark:text-blue-400'
                              : 'font-medium text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {heading.isToday || heading.isTomorrow
                            ? `${heading.primary} · ${heading.secondary}`
                            : `${heading.primary}, ${heading.secondary}`}
                        </span>
                        <span className="font-mono tabular-nums text-slate-400 shrink-0">
                          {events.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!demoStatus.isUnlocked && (
              <div className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    7-Day Demo
                  </span>
                  <span className="font-mono tabular-nums text-xs font-medium text-amber-800 dark:text-amber-300">
                    {demoStatus.remainingLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUnlockModalOpen(true)}
                  className="w-full min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Unlock Full Version</span>
                </button>
              </div>
            )}

            {isCloudplanAuthenticated && (
              <button
                type="button"
                onClick={signOut}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-300 hover:border-red-200 dark:hover:border-red-900 transition-colors"
              >
                Sign out of AndrewsPlan ({credentials?.username})
              </button>
            )}
          </aside>

          {/* Primary Column */}
          <div className="min-w-0">
            {mobileTab === 'account' ? (
              <div className="lg:hidden">
                <AccountPanel
                  isCloudplanConnected={isCloudplanAuthenticated}
                  username={credentials?.username ?? ''}
                  calendarName={calendarName}
                  eventCount={totalEventCount}
                  cloudplanEventCount={cloudplanEvents.length}
                  syncedAt={schedule?.syncedAt ?? null}
                  secondsUntilSync={secondsUntilSync}
                  isSyncing={isSyncing}
                  isDark={isDark}
                  showMapsView={showMapsView}
                  mapProvider={mapProvider}
                  notificationsEnabled={notificationsEnabled}
                  notificationLeadMinutes={notificationLeadMinutes}
                  notificationPermission={notificationPermission}
                  firebaseUser={firebaseUser}
                  needsGoogleAuth={needsGoogleAuth}
                  calendars={calendars}
                  selectedCalendarId={selectedCalendarId}
                  googleEventsCount={googleEvents.length}
                  isGoogleLoading={isGoogleLoading}
                  isMutatingGoogle={isMutatingGoogle}
                  isCloudSyncing={isCloudSyncing}
                  cloudError={cloudError}
                  googleError={googleError}
                  onGoogleSignIn={() => void connectGoogleCalendar()}
                  onGoogleSignOut={() => void disconnectGoogleCalendar()}
                  onSelectCalendar={selectCalendar}
                  onRequestPushToGoogle={() => setPendingConfirm({ type: 'push_cloudplan' })}
                  onRequestCreateDedicatedCalendar={() =>
                    setPendingConfirm({ type: 'create_calendar' })
                  }
                  onOpenNewGoogleEvent={() => setIsNewEventOpen(true)}
                  demoStatus={demoStatus}
                  onOpenUnlockModal={() => setIsUnlockModalOpen(true)}
                  onToggleTheme={handleToggleTheme}
                  onToggleMapsView={handleToggleMapsView}
                  onChangeMapProvider={setMapProvider}
                  onToggleNotifications={toggleNotifications}
                  onChangeNotificationLeadMinutes={setNotificationLeadMinutes}
                  defaultNavApp={defaultNavApp}
                  onChangeDefaultNavApp={handleSaveDefaultNavApp}
                  onManualSync={() => void handleCombinedSync()}
                  onCloudplanSignIn={signInAndSync}
                  onSignOut={signOut}
                />
              </div>
            ) : null}

            {(mobileTab === 'summary' || desktopView === 'summary') && (
              <div
                className={
                  mobileTab === 'summary' && desktopView === 'summary'
                    ? 'block'
                    : mobileTab === 'summary'
                    ? 'lg:hidden'
                    : 'hidden lg:block'
                }
              >
                <SummaryView
                  events={combinedEvents}
                  nowMs={nowMs}
                  scope={filter}
                  onChangeScope={setFilter}
                  onSelectCategory={(category) => {
                    setSelectedCategory(category);
                    setMobileTab(filter === 'today' ? 'upcoming' : 'agenda');
                    setDesktopView('schedule');
                  }}
                />
              </div>
            )}

            <div
              className={
                mobileTab === 'account' || mobileTab === 'summary'
                  ? desktopView === 'summary'
                    ? 'hidden'
                    : 'hidden lg:block space-y-4'
                  : desktopView === 'summary'
                  ? 'lg:hidden space-y-4'
                  : 'space-y-4'
              }
            >
              {/* Mobile Sync Summary Strip */}
              <div className="lg:hidden flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 px-0.5">
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {calendarName}
                </span>
                <span className="font-mono tabular-nums">
                  {isBusySync
                    ? schedule?.syncedAt
                      ? `Syncing… · Cached ${formatSyncedRelative(schedule.syncedAt, nowMs)}`
                      : 'Syncing…'
                    : schedule?.syncedAt
                    ? `Synced ${formatSyncedRelative(schedule.syncedAt, nowMs)} · Next ${formatCountdown(secondsUntilSync)}`
                    : `${totalEventCount} events`}
                </span>
              </div>

              {/* Search & Filter Controls (pinned on top while scrolling Agenda / Today / All) */}
              <div className="sticky top-safe lg:top-14 z-20 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 py-2 bg-[#F7F8FA]/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800/70 lg:border-b-0 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search events, locations, or notes…"
                    aria-label="Search scheduled events"
                    className="w-full min-h-[44px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 pl-10 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Source Filter when both Cloudplan & Google Calendar are connected */}
                {isCloudplanAuthenticated && !needsGoogleAuth && (
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl shrink-0">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'cloudplan', label: 'AndrewsPlan' },
                        { id: 'google', label: 'Google' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSourceFilter(item.id)}
                        className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          sourceFilter === item.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Mobile Interactive Date Scope Tabs (Today / All) */}
                {!isMonthlyAgendaView && (
                  <div className="lg:hidden grid grid-cols-2 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl">
                    {(
                      [
                        { id: 'today', label: 'Today' },
                        { id: 'all', label: 'All' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setFilter(item.id);
                          if (item.id === 'today') {
                            setMobileTab('upcoming');
                          }
                        }}
                        className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          filter === item.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Category Filter Indicator */}
              {selectedCategory && (
                <div className="rounded-2xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/80 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                  <span className="text-blue-900 dark:text-blue-200 font-medium truncate">
                    Filtered by category: <strong>{selectedCategory}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 font-semibold text-blue-800 dark:text-blue-300 hover:bg-blue-100/60 shrink-0 whitespace-nowrap"
                  >
                    Clear filter
                  </button>
                </div>
              )}

              {/* Upcoming Event Reminders */}
              {activeReminders.length > 0 && (
                <div className="space-y-2">
                  {activeReminders.map((reminder) => (
                    <div
                      key={reminder.key}
                      role="status"
                      className="rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/80 p-3.5 flex items-center justify-between gap-3 text-sm text-blue-950 dark:text-blue-100"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Bell className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{reminder.event.summary}</p>
                          <p className="text-xs text-blue-800 dark:text-blue-300 truncate">
                            {reminder.minutesUntilStart === 0
                              ? 'Starting now'
                              : `Starts in ${reminder.minutesUntilStart} min`}{' '}
                            · {formatTimeShort(reminder.event.start)}
                            {reminder.event.location ? ` · ${reminder.event.location}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedEvent(reminder.event)}
                          className="min-h-[34px] px-2.5 rounded-lg bg-blue-700 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissReminder(reminder.key)}
                          aria-label="Dismiss reminder"
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Google Calendar Action Success Notice */}
              {googleNotice && (
                <div
                  role="status"
                  className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/80 p-3.5 flex items-center justify-between gap-3 text-sm text-emerald-900 dark:text-emerald-200"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">{googleNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearGoogleNotice}
                    aria-label="Dismiss message"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Error Alert */}
              {activeError && (
                <div
                  role="alert"
                  className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-red-800 dark:text-red-200"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{activeError}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {authError && isCloudplanAuthenticated && (
                      <button
                        type="button"
                        onClick={signOut}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 whitespace-nowrap"
                      >
                        Update Credentials
                      </button>
                    )}
                    {needsGoogleAuth && googleError && (
                      <button
                        type="button"
                        onClick={() => void connectGoogleCalendar()}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 whitespace-nowrap"
                      >
                        Sign in with Google
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCombinedSync()}
                      disabled={isBusySync}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-xs font-semibold hover:bg-red-100/70 dark:hover:bg-red-900/40 whitespace-nowrap"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* Loading Skeleton */}
              {isLoadingSchedule &&
                (isMonthlyAgendaView ? monthlyCalendarEvents.length === 0 : dayGroups.length === 0) && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1 text-xs font-medium text-blue-700 dark:text-blue-400 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Syncing & parsing schedule events…</span>
                  </div>
                  {[1, 2, 3].map((group) => (
                    <div
                      key={group}
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 animate-pulse"
                    >
                      <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800" />
                      <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
                      <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
                    </div>
                  ))}
                </div>
              )}

              {/* Monthly View on Agenda Menu */}
              {isMonthlyAgendaView &&
                !(isLoadingSchedule && monthlyCalendarEvents.length === 0) && (
                  <MonthlyCalendarView
                    events={monthlyCalendarEvents}
                    nowMs={nowMs}
                    selectedDateKey={selectedMonthDateKey}
                    onSelectDateKey={setSelectedMonthDateKey}
                    selectedEventId={selectedEvent?.id ?? null}
                    onSelectEvent={setSelectedEvent}
                    onRequestNavigate={handleRequestNavigate}
                    isSearchOrCategoryActive={Boolean(searchQuery.trim() || selectedCategory)}
                    onClearFilters={() => {
                      setSearchQuery('');
                      setSelectedCategory(null);
                    }}
                  />
                )}

              {/* Empty State (Today / All Events list views) */}
              {!isMonthlyAgendaView && !isLoadingSchedule && dayGroups.length === 0 && (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {searchQuery
                      ? 'No matching events'
                      : filter === 'today'
                      ? 'No events scheduled for today'
                      : 'No events found'}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {searchQuery
                      ? 'Try clearing your search filter or switching to All Events.'
                      : 'Trigger a manual sync or switch filters to check past or upcoming events.'}
                  </p>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Clear search
                      </button>
                    )}
                    {filter === 'today' && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilter('upcoming');
                          setMobileTab('agenda');
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-sm font-semibold text-white hover:bg-blue-800"
                      >
                        View upcoming agenda
                      </button>
                    )}
                    {filter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setFilter('all')}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Show all events
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCombinedSync()}
                      disabled={isLoadingSchedule}
                      className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Sync now
                    </button>
                  </div>
                </div>
              )}

              {/* Day-Grouped Scrollable Schedule List (Today / All Events) */}
              {!isMonthlyAgendaView && dayGroups.length > 0 && (
                <div className="space-y-6">
                  {dayGroups.map(({ dateKey, events }) => {
                    const heading = formatDayHeading(dateKey, new Date(nowMs));
                    const isTodayGroup = dateKey === todayKey;
                    return (
                      <section
                        key={dateKey}
                        ref={(el) => {
                          dayRefs.current[dateKey] = el;
                        }}
                        aria-labelledby={`day-heading-${dateKey}`}
                        className="scroll-mt-36"
                      >
                        <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
                          <h2
                            id={`day-heading-${dateKey}`}
                            className={`text-sm font-bold tracking-tight ${
                              isTodayGroup
                                ? 'text-blue-700 dark:text-blue-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {heading.primary}
                            <span className="font-normal text-slate-500 dark:text-slate-400">
                              {' '}
                              · {heading.secondary}
                            </span>
                          </h2>
                          <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                            {events.length} {events.length === 1 ? 'event' : 'events'}
                          </span>
                        </div>

                        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden">
                          {events.map((ev) => (
                            <EventRow
                              key={ev.id}
                              event={ev}
                              nowMs={nowMs}
                              isSelected={selectedEvent?.id === ev.id}
                              onSelect={setSelectedEvent}
                              onRequestNavigate={handleRequestNavigate}
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Primary mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-4 h-14 items-center">
          <button
            type="button"
            onClick={() => switchMobileTab('upcoming')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              mobileTab === 'upcoming'
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[11px] font-medium tracking-tight">Today</span>
          </button>

          <button
            type="button"
            onClick={() => switchMobileTab('agenda')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              mobileTab === 'agenda'
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <CalendarDays className="w-5 h-5" />
            <span className="text-[11px] font-medium tracking-tight">Agenda</span>
          </button>

          <button
            type="button"
            onClick={() => switchMobileTab('summary')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              mobileTab === 'summary'
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[11px] font-medium tracking-tight">Summary</span>
          </button>

          <button
            type="button"
            onClick={() => switchMobileTab('account')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              mobileTab === 'account'
                ? 'text-blue-700 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[11px] font-medium tracking-tight">Account</span>
          </button>
        </div>
      </nav>

      {/* Event Detail Bottom Sheet / Modal */}
      <EventDetailSheet
        event={selectedEvent}
        showMapsView={showMapsView}
        mapProvider={mapProvider}
        onChangeMapProvider={setMapProvider}
        onClose={handleCloseEventDetail}
        onRequestNavigate={handleRequestNavigate}
        onRequestDeleteGoogleEvent={(ev) =>
          setPendingConfirm({ type: 'delete_event', event: ev })
        }
      />

      {/* New Google Calendar Event Modal */}
      <CreateGoogleEventModal
        isOpen={isNewEventOpen}
        calendarName={activeCalendar?.summary || 'Primary Calendar'}
        isBusy={isMutatingGoogle}
        onSubmit={(input) => setPendingConfirm({ type: 'create_event', input })}
        onClose={() => setIsNewEventOpen(false)}
      />

      {/* Mandatory Confirmation Modal before Google Calendar Mutations */}
      <ConfirmActionModal
        isOpen={Boolean(pendingConfirm && confirmDialogConfig)}
        title={confirmDialogConfig?.title || ''}
        description={confirmDialogConfig?.description || ''}
        confirmLabel={confirmDialogConfig?.confirmLabel || 'Confirm'}
        destructive={Boolean(confirmDialogConfig?.destructive)}
        isBusy={isMutatingGoogle}
        onConfirm={() => void executeConfirmedAction()}
        onCancel={() => setPendingConfirm(null)}
      />

      {/* Full Version Unlock Modal */}
      <DemoUnlockModal
        isOpen={isUnlockModalOpen}
        blocking={false}
        expiresAtMs={demoStatus.expiresAtMs}
        remainingLabel={demoStatus.remainingLabel}
        onUnlock={handleUnlockDemo}
        onClose={() => setIsUnlockModalOpen(false)}
      />

      {/* Sync Diff Summary Popup */}
      {syncDiffSummary && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(4.25rem+max(env(safe-area-inset-bottom,0px),var(--safe-area-inset-bottom,0px)))] lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-96 z-40 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white shadow-xl border border-slate-700/80 p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">
                {syncDiffSummary.added > 0 || syncDiffSummary.removed > 0
                  ? 'Schedule updated'
                  : 'Schedule up to date'}
              </p>
              <p className="mt-0.5 text-xs text-slate-300 font-mono tabular-nums">
                <span className={syncDiffSummary.added > 0 ? 'text-emerald-400 font-semibold' : ''}>
                  +{syncDiffSummary.added} added
                </span>
                {' · '}
                <span className={syncDiffSummary.removed > 0 ? 'text-amber-300 font-semibold' : ''}>
                  -{syncDiffSummary.removed} removed
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissSyncDiffSummary}
            aria-label="Dismiss sync popup"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation App Chooser Modal */}
      <NavigationChooserModal
        location={navigationLocation}
        defaultNavApp={defaultNavApp}
        onSaveDefaultNavApp={handleSaveDefaultNavApp}
        onClose={handleCloseNavigationChooser}
      />

      {/* Changelog Update Modal */}
      <ChangelogModal
        isOpen={isChangelogOpen}
        version={CURRENT_APP_VERSION}
        onClose={handleCloseChangelog}
      />
    </div>
  );
}
