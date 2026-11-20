import type { CalendarEvent } from '../types/calendar';

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDayHeading(dateKey: string, now: Date = new Date()): {
  primary: string;
  secondary: string;
  isToday: boolean;
  isTomorrow: boolean;
} {
  const [y, m, d] = dateKey.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const todayKey = toLocalDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toLocalDateKey(tomorrow);

  const isToday = dateKey === todayKey;
  const isTomorrow = dateKey === tomorrowKey;

  const fullDate = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(target);

  if (isToday) {
    return { primary: 'Today', secondary: fullDate, isToday: true, isTomorrow: false };
  }
  if (isTomorrow) {
    return { primary: 'Tomorrow', secondary: fullDate, isToday: false, isTomorrow: true };
  }

  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(target);
  const rest = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: target.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  }).format(target);

  return { primary: weekday, secondary: rest, isToday: false, isTomorrow: false };
}

export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function formatDuration(startIso: string, endIso: string, allDay: boolean): string {
  if (allDay) return 'All day';
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (diffMs <= 0) return '0m';
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export function formatSyncedRelative(iso: string, nowMs: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const time = formatTimeShort(iso);
  return `at ${time}`;
}

export function isEventInProgress(event: CalendarEvent, nowMs: number = Date.now()): boolean {
  const { startMs, endMs } = getEventEffectiveRange(event);
  return nowMs >= startMs && nowMs < endMs;
}

export function isEventPast(event: CalendarEvent, nowMs: number = Date.now()): boolean {
  const { endMs } = getEventEffectiveRange(event);
  return endMs < nowMs;
}

function parseYmdAsLocalMidnight(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function getEventEffectiveRange(
  ev: Pick<CalendarEvent, 'start' | 'end' | 'allDay'>
): { startMs: number; endMs: number; startDateKey: string } {
  const rawStartMs = new Date(ev.start).getTime();
  const rawEndMs = new Date(ev.end).getTime();

  if (ev.allDay) {
    // Server ICS all-day events arrive as UTC midnight (e.g. "2026-11-18T00:00:00.000Z")
    // or date-only ("2026-11-18"). Convert to browser local midnight so day boundaries
    // match the user's local calendar day cleanly.
    const isUtcMidnightStart =
      /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(ev.start.trim());
    const startMs = isUtcMidnightStart
      ? parseYmdAsLocalMidnight(ev.start.trim().slice(0, 10))
      : rawStartMs;

    const isUtcMidnightEnd =
      /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(ev.end.trim());
    let endMs = isUtcMidnightEnd
      ? parseYmdAsLocalMidnight(ev.end.trim().slice(0, 10))
      : rawEndMs;

    if (!Number.isFinite(endMs) || endMs <= startMs) {
      const s = new Date(startMs);
      endMs = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, 0, 0, 0, 0).getTime();
    }

    return {
      startMs,
      endMs,
      startDateKey: toLocalDateKey(new Date(startMs)),
    };
  }

  return {
    startMs: rawStartMs,
    endMs: Number.isFinite(rawEndMs) ? rawEndMs : rawStartMs,
    startDateKey: toLocalDateKey(new Date(rawStartMs)),
  };
}

export function eventStartsOrContinuesFromToday(
  ev: Pick<CalendarEvent, 'start' | 'end' | 'allDay'>,
  startOfTodayMs: number
): boolean {
  const { startMs, endMs } = getEventEffectiveRange(ev);
  return endMs > startOfTodayMs || startMs >= startOfTodayMs;
}

export function eventTouchesRange(
  ev: Pick<CalendarEvent, 'start' | 'end' | 'allDay'>,
  rangeStartMs: number,
  rangeEndMs: number
): boolean {
  const { startMs, endMs } = getEventEffectiveRange(ev);
  return startMs < rangeEndMs && (endMs > rangeStartMs || startMs >= rangeStartMs);
}

export function groupEventsByDay(
  events: CalendarEvent[],
  minDateKey?: string
): Array<{ dateKey: string; events: CalendarEvent[] }> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const rawKey = getEventEffectiveRange(ev).startDateKey;
    const key = minDateKey && rawKey < minDateKey ? minDateKey : rawKey;
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(ev);
    } else {
      map.set(key, [ev]);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayEvents]) => ({
      dateKey,
      events: dayEvents.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return getEventEffectiveRange(a).startMs - getEventEffectiveRange(b).startMs;
      }),
    }));
}
