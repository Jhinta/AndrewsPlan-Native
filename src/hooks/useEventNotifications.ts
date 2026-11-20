import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalendarEvent } from '../types/calendar';
import { formatTimeShort } from '../utils/dateUtils';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';
export type NotificationLeadMinutes = 0 | 10 | 15 | 30;

export interface ActiveEventReminder {
  key: string;
  event: CalendarEvent;
  minutesUntilStart: number;
  triggeredAt: number;
}

const NOTIFICATIONS_ENABLED_KEY = 'andrewsplan_event_notifications_v1';
const NOTIFICATION_LEAD_MIN_KEY = 'andrewsplan_event_notification_lead_v1';
const NOTIFIED_HISTORY_KEY = 'andrewsplan_notified_events_v1';
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;

function readEnabledPreference(): boolean {
  try {
    return localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

function readLeadMinutesPreference(): NotificationLeadMinutes {
  try {
    const raw = Number(localStorage.getItem(NOTIFICATION_LEAD_MIN_KEY));
    if (raw === 0 || raw === 10 || raw === 15 || raw === 30) {
      return raw;
    }
    return 15;
  } catch {
    return 15;
  }
}

function getCurrentPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

function readNotifiedHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(NOTIFIED_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && v >= cutoff) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeNotifiedHistory(history: Record<string, number>): void {
  try {
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    const pruned: Record<string, number> = {};
    for (const [k, v] of Object.entries(history)) {
      if (v >= cutoff) {
        pruned[k] = v;
      }
    }
    localStorage.setItem(NOTIFIED_HISTORY_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore storage quota errors
  }
}

async function dispatchSystemNotification(
  title: string,
  body: string,
  tag: string,
  onClick?: () => void
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          tag,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
        });
        return;
      }
    }
  } catch {
    // Fallback to Notification constructor below
  }

  try {
    const notification = new window.Notification(title, {
      body,
      tag,
      icon: '/pwa-192x192.png',
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onClick?.();
    };
  } catch {
    // Browser blocked direct Notification constructor
  }
}

export function useEventNotifications(
  events: CalendarEvent[],
  onSelectEvent?: (event: CalendarEvent) => void
) {
  const [enabled, setEnabled] = useState<boolean>(() => readEnabledPreference());
  const [leadMinutes, setLeadMinutes] = useState<NotificationLeadMinutes>(() =>
    readLeadMinutesPreference()
  );
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getCurrentPermission()
  );
  const [activeReminders, setActiveReminders] = useState<ActiveEventReminder[]>([]);

  const historyRef = useRef<Record<string, number>>(readNotifiedHistory());
  const onSelectRef = useRef(onSelectEvent);
  onSelectRef.current = onSelectEvent;

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore storage errors
    }
  }, [enabled]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_LEAD_MIN_KEY, String(leadMinutes));
    } catch {
      // Ignore storage errors
    }
  }, [leadMinutes]);

  const checkUpcomingEvents = useCallback(() => {
    if (!enabled || events.length === 0) return;

    const nowMs = Date.now();
    const leadMs = leadMinutes * 60 * 1000;
    const newlyTriggered: ActiveEventReminder[] = [];
    let historyChanged = false;

    for (const ev of events) {
      if (ev.allDay) continue;
      if (ev.status && ev.status.toUpperCase() === 'CANCELLED') continue;

      const startMs = new Date(ev.start).getTime();
      const endMs = new Date(ev.end).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= nowMs) continue;

      const notifyFrom = startMs - leadMs;
      const notifyUntil = startMs + 2 * 60 * 1000;
      if (nowMs < notifyFrom || nowMs > notifyUntil) continue;

      const dedupeKey = `${ev.id}::${leadMinutes}`;
      if (historyRef.current[dedupeKey]) continue;

      historyRef.current[dedupeKey] = nowMs;
      historyChanged = true;

      const minutesUntilStart = Math.max(0, Math.round((startMs - nowMs) / 60000));
      const timingText =
        minutesUntilStart === 0
          ? 'Starting now'
          : `Starts in ${minutesUntilStart} min (${formatTimeShort(ev.start)})`;
      const bodyParts = [timingText];
      if (ev.location) {
        bodyParts.push(ev.location);
      }

      void dispatchSystemNotification(
        ev.summary,
        bodyParts.join(' · '),
        dedupeKey,
        () => onSelectRef.current?.(ev)
      );

      newlyTriggered.push({
        key: dedupeKey,
        event: ev,
        minutesUntilStart,
        triggeredAt: nowMs,
      });
    }

    if (historyChanged) {
      writeNotifiedHistory(historyRef.current);
    }

    if (newlyTriggered.length > 0) {
      setActiveReminders((prev) => {
        const existingKeys = new Set(prev.map((r) => r.key));
        const uniqueNew = newlyTriggered.filter((r) => !existingKeys.has(r.key));
        return [...uniqueNew, ...prev].slice(0, 5);
      });
    }
  }, [enabled, events, leadMinutes]);

  useEffect(() => {
    if (!enabled) {
      setActiveReminders([]);
      return;
    }

    setPermission(getCurrentPermission());
    checkUpcomingEvents();
    const intervalId = window.setInterval(checkUpcomingEvents, 20000);
    return () => window.clearInterval(intervalId);
  }, [enabled, checkUpcomingEvents]);

  const toggleEnabled = useCallback(async () => {
    setEnabled((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined' && 'Notification' in window) {
        if (window.Notification.permission === 'default') {
          void window.Notification.requestPermission()
            .then((result) => setPermission(result))
            .catch(() => setPermission(getCurrentPermission()));
        } else {
          setPermission(getCurrentPermission());
        }
      }
      return next;
    });
  }, []);

  const dismissReminder = useCallback((key: string) => {
    setActiveReminders((prev) => prev.filter((item) => item.key !== key));
  }, []);

  return {
    notificationsEnabled: enabled,
    leadMinutes,
    permission,
    activeReminders,
    toggleNotifications: () => void toggleEnabled(),
    setLeadMinutes,
    dismissReminder,
  };
}
