import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { CalendarEvent, StoredCredentials, SyncResponse } from '../types/calendar';
import {
  clearPersistedIcsCache,
  readFastIcsCache,
  readFullPersistedIcsCache,
  savePersistedIcsCache,
  type CachedIcsSnapshot,
} from '../utils/icsCache';
import { parseIcsCalendar } from '../utils/icsParser';

export const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
export const SYNC_INTERVAL_MINUTES = 15;
export const CLOUDPLAN_ICS_URL = 'https://cloudplan.nl/ics';

export type SyncTriggerSource = 'manual' | 'pull' | 'startup' | 'auto' | 'signin';

export interface SyncDiffSummary {
  id: number;
  added: number;
  removed: number;
  total: number;
  source: SyncTriggerSource;
  syncedAt: string;
}

const CREDENTIALS_KEY = 'cloudplan_credentials_v1';
const NEXT_SYNC_KEY = 'cloudplan_next_sync_at_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

function getSyncApiUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configured) {
    return `${configured.replace(/\/$/, '')}/api/ics/sync`;
  }
  return '/api/ics/sync';
}

function readStoredCredentials(): StoredCredentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (typeof parsed.username === 'string' && typeof parsed.password === 'string' && parsed.username && parsed.password) {
      return {
        username: parsed.username,
        password: parsed.password,
        remember: true,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function readNextSyncAt(): number | null {
  try {
    const raw = localStorage.getItem(NEXT_SYNC_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

function getSyncedAtMs(snapshot: SyncResponse | null): number {
  if (!snapshot?.syncedAt) return 0;
  const parsed = Date.parse(snapshot.syncedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isWithinDiffHorizon(ev: CalendarEvent, nowMs: number): boolean {
  const startMs = Date.parse(ev.start);
  const endMs = Date.parse(ev.end || ev.start);
  if (Number.isNaN(startMs)) return true;
  const minBound = nowMs - 85 * DAY_MS;
  const maxBound = nowMs + 360 * DAY_MS;
  const effectiveEnd = Number.isNaN(endMs) ? startMs : endMs;
  return effectiveEnd >= minBound && startMs <= maxBound;
}

function diffScheduleEvents(
  prevEvents: CalendarEvent[],
  nextEvents: CalendarEvent[],
  nowMs: number = Date.now()
): { added: number; removed: number } {
  const prevIds = new Set<string>();
  const nextIds = new Set<string>();

  for (const ev of prevEvents) {
    if (isWithinDiffHorizon(ev, nowMs)) {
      prevIds.add(ev.id);
    }
  }
  for (const ev of nextEvents) {
    if (isWithinDiffHorizon(ev, nowMs)) {
      nextIds.add(ev.id);
    }
  }

  let added = 0;
  for (const id of nextIds) {
    if (!prevIds.has(id)) added++;
  }

  let removed = 0;
  for (const id of prevIds) {
    if (!nextIds.has(id)) removed++;
  }

  return { added, removed };
}

function generateDemoSyncResponse(): SyncResponse {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const events: CalendarEvent[] = [
    {
      id: 'demo-ev-1',
      uid: 'demo-ev-1',
      summary: 'Morning Sync & Planning',
      description: 'Review weekly agenda, sprint backlog, and Android Auto integration progress. Tel: 0800 5200200',
      location: 'CloudPlan HQ, Keizersgracht 123, Amsterdam',
      start: new Date(startOfToday + 9 * 3600000).toISOString(),
      end: new Date(startOfToday + 9 * 3600000 + 45 * 60000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Work'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'demo@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-2',
      uid: 'demo-ev-2',
      summary: 'Client Lunch Meeting',
      description: 'Discuss project milestones, deliverables, and Q3 extension over lunch.',
      location: 'Grand Café De Jaren, Doelenstraat 20, Amsterdam',
      start: new Date(startOfToday + 12 * 3600000 + 30 * 60000).toISOString(),
      end: new Date(startOfToday + 13 * 3600000 + 30 * 60000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Meeting'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'client@company.com',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-3',
      uid: 'demo-ev-3',
      summary: 'Android Auto Live Demo',
      description: 'Showcase native Android Auto POI templates and voice controls to stakeholders.',
      location: 'https://meet.google.com/abc-demo-xyz',
      start: new Date(startOfToday + 15 * 3600000).toISOString(),
      end: new Date(startOfToday + 16 * 3600000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Demo'],
      url: 'https://meet.google.com/abc-demo-xyz',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'product@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-4',
      uid: 'demo-ev-4',
      summary: 'On-site Technical Workshop',
      description: 'Interactive session on mobile architecture and car app design standards.',
      location: 'High Tech Campus 1, Eindhoven',
      start: new Date(startOfToday + 24 * 3600000 + 10 * 3600000).toISOString(),
      end: new Date(startOfToday + 24 * 3600000 + 12 * 3600000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Workshop'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'workshop@hightechcampus.com',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-5',
      uid: 'demo-ev-5',
      summary: 'Team Strategy Dinner',
      description: 'Quarterly team dinner and celebration for successful mobile release.',
      location: 'Baden Powelllaan 2, Rotterdam',
      start: new Date(startOfToday + 24 * 3600000 + 18 * 3600000 + 30 * 60000).toISOString(),
      end: new Date(startOfToday + 24 * 3600000 + 20 * 3600000 + 30 * 60000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Social'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'events@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-6',
      uid: 'demo-ev-6',
      summary: 'Architecture Review',
      description: 'Evaluate database sync performance and background worker lifecycle.',
      location: 'https://teams.microsoft.com/l/meetup-join/demo',
      start: new Date(startOfToday + 2 * 24 * 3600000 + 11 * 3600000).toISOString(),
      end: new Date(startOfToday + 2 * 24 * 3600000 + 12 * 3600000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Review'],
      url: 'https://teams.microsoft.com/l/meetup-join/demo',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'tech-lead@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-7',
      uid: 'demo-ev-7',
      summary: 'Customer Support Catch-up',
      description: 'Review feedback from Android Auto users and prioritize bug fixes.',
      location: 'Phone Call',
      start: new Date(startOfToday + 2 * 24 * 3600000 + 14 * 3600000 + 30 * 60000).toISOString(),
      end: new Date(startOfToday + 2 * 24 * 3600000 + 15 * 3600000 + 15 * 60000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Support'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'support@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-8',
      uid: 'demo-ev-8',
      summary: 'Mobile UX Design Sprint',
      description: 'Design sprint focused on car screen ergonomics and high-contrast night mode.',
      location: 'Stationsplein 45, Utrecht',
      start: new Date(startOfToday + 3 * 24 * 3600000 + 9 * 3600000 + 30 * 60000).toISOString(),
      end: new Date(startOfToday + 3 * 24 * 3600000 + 11 * 3600000 + 30 * 60000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Design'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'ux@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-9',
      uid: 'demo-ev-9',
      summary: 'Weekly Operations Sync',
      description: 'Operational review, resource allocation, and timeline check.',
      location: 'https://zoom.us/j/demo123456',
      start: new Date(startOfToday + 3 * 24 * 3600000 + 16 * 3600000).toISOString(),
      end: new Date(startOfToday + 3 * 24 * 3600000 + 17 * 3600000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Ops'],
      url: 'https://zoom.us/j/demo123456',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'ops@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-10',
      uid: 'demo-ev-10',
      summary: 'Security & Compliance Audit',
      description: 'Annual audit covering credential storage, TLS verification, and host validation.',
      location: 'Beatrixlaan 800, The Hague',
      start: new Date(startOfToday + 4 * 24 * 3600000 + 13 * 3600000).toISOString(),
      end: new Date(startOfToday + 4 * 24 * 3600000 + 14 * 3600000 + 30 * 60000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Security'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'security@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-11',
      uid: 'demo-ev-11',
      summary: 'Weekend Hackathon & Innovations',
      description: 'Prototyping AI features and voice shortcuts for driver convenience.',
      location: 'Science Park 904, Amsterdam',
      start: new Date(startOfToday + 5 * 24 * 3600000 + 11 * 3600000).toISOString(),
      end: new Date(startOfToday + 5 * 24 * 3600000 + 17 * 3600000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Hackathon'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'hackathon@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
    {
      id: 'demo-ev-12',
      uid: 'demo-ev-12',
      summary: 'Weekly Retrospective & Planning',
      description: 'Sprint retro, celebrate accomplishments, and plan tasks for the upcoming week.',
      location: 'CloudPlan HQ, Keizersgracht 123, Amsterdam',
      start: new Date(startOfToday + 6 * 24 * 3600000 + 10 * 3600000).toISOString(),
      end: new Date(startOfToday + 6 * 24 * 3600000 + 11 * 3600000 + 30 * 60000).toISOString(),
      allDay: false,
      isRecurring: false,
      status: 'CONFIRMED',
      categories: ['Planning'],
      url: '',
      calendarTitle: 'AndrewsPlan Demo',
      organizer: 'demo@cloudplan.nl',
      source: 'cloudplan',
      phoneDisplay: '0800 5200200',
      phoneHref: 'tel:08005200200',
    },
  ];

  return {
    calendarName: 'AndrewsPlan Demo',
    sourceUrl: 'demo://cloudplan',
    syncedAt: new Date().toISOString(),
    eventCount: events.length,
    events,
  };
}

/**
 * Robust calendar sync fetcher:
 * 1. On Android/Capacitor native: fetches directly from https://cloudplan.nl/ics via CapacitorHttp (no CORS, no proxy).
 * 2. In browser/local dev: tries /api/ics/sync proxy or direct fetch.
 * 3. Parses ICS content and validates events list before returning.
 */
async function fetchCloudplanSchedule(creds: StoredCredentials): Promise<SyncResponse> {
  if (creds.username.trim().toLowerCase() === 'demo' && creds.password.trim().toLowerCase() === 'demo') {
    return generateDemoSyncResponse();
  }

  const authHeader = `Basic ${btoa(`${creds.username}:${creds.password}`)}`;
  let lastError: string | null = null;

  // 1. Direct native HTTP request via CapacitorHttp
  if (Capacitor.isNativePlatform()) {
    try {
      const capRes = await CapacitorHttp.get({
        url: CLOUDPLAN_ICS_URL,
        headers: {
          Authorization: authHeader,
          Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
          'User-Agent': 'AndrewsPlan/1.0',
        },
        connectTimeout: 15000,
        readTimeout: 15000,
      });

      if (capRes.status === 401 || capRes.status === 403) {
        throw new Error('AUTH_FAILED: Authentication failed. Verify your AndrewsPlan username and password.');
      }

      if (capRes.status === 200 && typeof capRes.data === 'string' && capRes.data.includes('BEGIN:VCALENDAR')) {
        return parseIcsCalendar(capRes.data, CLOUDPLAN_ICS_URL);
      }
      if (capRes.status !== 200) {
        lastError = `AndrewsPlan returned HTTP ${capRes.status}.`;
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('AUTH_FAILED:')) {
        throw err;
      }
      lastError = err instanceof Error ? err.message : 'Native network error connecting to AndrewsPlan.';
    }
  }

  // 2. Try proxy endpoint (used during local development)
  try {
    const apiUrl = getSyncApiUrl();
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: creds.username,
        password: creds.password,
      }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('AUTH_FAILED: Authentication failed. Verify your AndrewsPlan username and password.');
    }

    const text = await res.text();
    if (text.includes('BEGIN:VCALENDAR')) {
      return parseIcsCalendar(text, CLOUDPLAN_ICS_URL);
    }

    if (res.ok) {
      try {
        const payload = JSON.parse(text);
        if (Array.isArray(payload.events)) {
          return {
            calendarName: payload.calendarName || 'AndrewsPlan Schedule',
            sourceUrl: CLOUDPLAN_ICS_URL,
            syncedAt: payload.syncedAt || new Date().toISOString(),
            eventCount: typeof payload.eventCount === 'number' ? payload.eventCount : payload.events.length,
            events: payload.events,
          };
        }
      } catch {
        // Not valid JSON (e.g. HTML preview response)
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('AUTH_FAILED:')) {
      throw err;
    }
    lastError = err instanceof Error ? err.message : 'Proxy connection error.';
  }

  // 3. Fallback: direct browser fetch with Basic auth
  try {
    const directRes = await fetch(CLOUDPLAN_ICS_URL, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
      },
    });

    if (directRes.status === 401 || directRes.status === 403) {
      throw new Error('AUTH_FAILED: Authentication failed. Verify your AndrewsPlan username and password.');
    }

    const icsText = await directRes.text();
    if (icsText.includes('BEGIN:VCALENDAR')) {
      return parseIcsCalendar(icsText, CLOUDPLAN_ICS_URL);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('AUTH_FAILED:')) {
      throw err;
    }
  }

  throw new Error(lastError || 'Unable to sync or parse schedule from AndrewsPlan. Please verify network connectivity.');
}

export function useCloudplanSync() {
  const initialCredentialsRef = useRef<StoredCredentials | null | undefined>(undefined);
  if (initialCredentialsRef.current === undefined) {
    initialCredentialsRef.current = readStoredCredentials();
  }

  const [credentials, setCredentials] = useState<StoredCredentials | null>(
    () => initialCredentialsRef.current ?? null
  );
  const [schedule, setSchedule] = useState<SyncResponse | null>(() =>
    readFastIcsCache(initialCredentialsRef.current?.username)
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncDiffSummary, setSyncDiffSummary] = useState<SyncDiffSummary | null>(null);
  const [nextSyncAt, setNextSyncAt] = useState<number | null>(() => readNextSyncAt());
  const [secondsUntilSync, setSecondsUntilSync] = useState<number>(() => {
    const storedNext = readNextSyncAt();
    if (!storedNext) return SYNC_INTERVAL_MS / 1000;
    return Math.max(0, Math.ceil((storedNext - Date.now()) / 1000));
  });

  const isSyncingRef = useRef(false);
  const credentialsRef = useRef<StoredCredentials | null>(credentials);
  credentialsRef.current = credentials;
  const scheduleRef = useRef<SyncResponse | null>(schedule);
  scheduleRef.current = schedule;
  const startupSyncUserRef = useRef<string | null>(null);

  const dismissSyncDiffSummary = useCallback(() => {
    setSyncDiffSummary(null);
  }, []);

  useEffect(() => {
    if (!syncDiffSummary) return;
    const timerId = window.setTimeout(() => {
      setSyncDiffSummary(null);
    }, 6000);
    return () => window.clearTimeout(timerId);
  }, [syncDiffSummary]);

  const scheduleNextSync = useCallback((fromMs: number = Date.now()) => {
    const target = fromMs + SYNC_INTERVAL_MS;
    setNextSyncAt(target);
    setSecondsUntilSync(Math.ceil(SYNC_INTERVAL_MS / 1000));
    try {
      localStorage.setItem(NEXT_SYNC_KEY, String(target));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const performSync = useCallback(
    async (
      credsToUse: StoredCredentials,
      source: SyncTriggerSource = 'auto'
    ): Promise<{ ok: boolean; error?: string }> => {
      if (isSyncingRef.current) {
        return { ok: false, error: 'Sync already in progress.' };
      }

      isSyncingRef.current = true;
      setIsSyncing(true);
      setError(null);
      setAuthError(null);

      try {
        const normalized = await fetchCloudplanSchedule(credsToUse);

        const previous = scheduleRef.current;
        const { added, removed } = previous
          ? diffScheduleEvents(previous.events, normalized.events)
          : { added: normalized.events.length, removed: 0 };

        setSchedule(normalized);
        await savePersistedIcsCache(normalized, credsToUse.username);
        scheduleNextSync();

        const shouldShowPopup =
          source === 'manual' ||
          source === 'pull' ||
          (previous !== null && (added > 0 || removed > 0));

        if (shouldShowPopup) {
          setSyncDiffSummary({
            id: Date.now(),
            added,
            removed,
            total: normalized.events.length,
            source,
            syncedAt: normalized.syncedAt,
          });
        }

        return { ok: true };
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : 'Unable to sync with AndrewsPlan.';
        const isAuth = rawMsg.startsWith('AUTH_FAILED:');
        const cleanMsg = isAuth ? rawMsg.replace('AUTH_FAILED:', '').trim() : rawMsg;

        if (isAuth) {
          setAuthError(cleanMsg);
        } else {
          setError(cleanMsg);
        }
        scheduleNextSync();
        return { ok: false, error: cleanMsg };
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [scheduleNextSync]
  );

  const signInAndSync = useCallback(
    async (nextCreds: StoredCredentials): Promise<{ ok: boolean; error?: string }> => {
      const result = await performSync(nextCreds, 'signin');
      if (result.ok) {
        startupSyncUserRef.current = nextCreds.username.trim().toLowerCase();
        setCredentials(nextCreds);
        try {
          if (nextCreds.remember) {
            localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(nextCreds));
          } else {
            localStorage.removeItem(CREDENTIALS_KEY);
          }
        } catch {
          // Ignore storage quota errors
        }
      }
      return result;
    },
    [performSync]
  );

  const manualSync = useCallback(
    async (source: 'manual' | 'pull' = 'manual') => {
      const active = credentialsRef.current;
      if (!active) return { ok: false, error: 'Not signed in.' };
      return performSync(active, source);
    },
    [performSync]
  );

  const signOut = useCallback(() => {
    startupSyncUserRef.current = null;
    setCredentials(null);
    setSchedule(null);
    setError(null);
    setAuthError(null);
    setSyncDiffSummary(null);
    setNextSyncAt(null);
    setSecondsUntilSync(SYNC_INTERVAL_MS / 1000);
    try {
      localStorage.removeItem(CREDENTIALS_KEY);
      localStorage.removeItem(NEXT_SYNC_KEY);
    } catch {
      // Ignore storage errors
    }
    void clearPersistedIcsCache();
  }, []);

  // Hydrate full persistent cache from IndexedDB (for large feeds or evicted localStorage)
  // and kick off a non-blocking background sync on startup when online.
  useEffect(() => {
    if (!credentials) return;

    let cancelled = false;
    const normalizedUser = credentials.username.trim().toLowerCase();

    void (async () => {
      const fullCached = await readFullPersistedIcsCache(credentials.username);
      if (!cancelled && fullCached) {
        const current = scheduleRef.current as CachedIcsSnapshot | null;
        const shouldHydrate =
          !current ||
          Boolean(current.isTrimmed && !fullCached.isTrimmed) ||
          getSyncedAtMs(fullCached) > getSyncedAtMs(current);

        if (shouldHydrate) {
          setSchedule(fullCached);
        }
      }

      if (cancelled) return;

      if (startupSyncUserRef.current !== normalizedUser && navigator.onLine) {
        startupSyncUserRef.current = normalizedUser;
        void performSync(credentials, 'startup');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [credentials, performSync]);

  // 1-second ticker that drives the live countdown and fires the 15-minute auto-sync
  useEffect(() => {
    if (!credentials) return;

    const target = nextSyncAt ?? Date.now() + SYNC_INTERVAL_MS;
    if (!nextSyncAt) {
      setNextSyncAt(target);
    }

    const tick = () => {
      const remainingMs = target - Date.now();
      if (remainingMs <= 0) {
        setSecondsUntilSync(0);
        if (!isSyncingRef.current && navigator.onLine) {
          void performSync(credentials, 'auto');
        }
      } else {
        setSecondsUntilSync(Math.ceil(remainingMs / 1000));
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [credentials, nextSyncAt, performSync]);

  // Sync automatically if returning to foreground or coming back online after 15-minute window elapsed
  useEffect(() => {
    if (!credentials) return;

    const checkAndSyncIfDue = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        const target = nextSyncAt ?? 0;
        if (Date.now() >= target && !isSyncingRef.current) {
          void performSync(credentials, 'auto');
        }
      }
    };

    const handleOnline = () => {
      const target = nextSyncAt ?? 0;
      const normalizedUser = credentials.username.trim().toLowerCase();
      const needsStartupSync = startupSyncUserRef.current !== normalizedUser;
      if ((needsStartupSync || Date.now() >= target || error) && !isSyncingRef.current) {
        startupSyncUserRef.current = normalizedUser;
        void performSync(credentials, needsStartupSync ? 'startup' : 'auto');
      }
    };

    document.addEventListener('visibilitychange', checkAndSyncIfDue);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', checkAndSyncIfDue);
      window.removeEventListener('online', handleOnline);
    };
  }, [credentials, nextSyncAt, error, performSync]);

  return {
    isAuthenticated: !!credentials,
    credentials,
    schedule,
    isSyncing,
    error,
    authError,
    syncDiffSummary,
    dismissSyncDiffSummary,
    secondsUntilSync,
    nextSyncAt,
    signInAndSync,
    manualSync,
    signOut,
  };
}
